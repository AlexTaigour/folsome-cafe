import { supabase, sb } from '../db.js';

// supabase-js has no GROUP BY, so we pull the raw rows for the range and
// aggregate in JS — at tea-shop volume (thousands of orders) this is fine.
// All ranges are [from, to) ISO strings. Cancelled orders are excluded from
// revenue metrics.

async function fetchOrders(from, to, cols = 'id, status, total, created_at') {
  let q = supabase.from('orders').select(cols);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lt('created_at', to);
  return sb(await q);
}

async function fetchHistory(orderIds) {
  if (!orderIds.length) return [];
  const out = [];
  // .in() with huge lists can blow the URL length — chunk it.
  for (let i = 0; i < orderIds.length; i += 200) {
    out.push(
      ...sb(
        await supabase
          .from('order_status_history')
          .select('order_id, to_status, changed_at')
          .in('order_id', orderIds.slice(i, i + 200))
      )
    );
  }
  return out;
}

const notCancelled = (rows) => rows.filter((o) => o.status !== 'cancelled');

export async function summary(from, to) {
  const rows = await fetchOrders(from, to);
  const ok = notCancelled(rows);
  const revenue = ok.reduce((s, o) => s + o.total, 0);

  // Money actually collected at the counter in the range, by payment method.
  let pq = supabase.from('payments').select('method, total');
  if (from) pq = pq.gte('created_at', from);
  if (to) pq = pq.lt('created_at', to);
  const payments = sb(await pq);
  const byMethod = {};
  let collected = 0;
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] || 0) + p.total;
    collected += p.total;
  }

  return {
    orderCount: ok.length,
    revenue,
    avgOrderValue: ok.length ? Math.round(revenue / ok.length) : 0,
    cancelledCount: rows.length - ok.length,
    collected,
    collectedByMethod: byMethod,
  };
}

// Bucket by the shop's local day/hour (server timezone).
const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function salesByDay(from, to) {
  const rows = notCancelled(await fetchOrders(from, to));
  const days = {};
  for (const o of rows) {
    const day = localDay(o.created_at);
    days[day] ??= { day, revenue: 0, orders: 0 };
    days[day].revenue += o.total;
    days[day].orders++;
  }
  return Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
}

export async function topItems(from, to, limit = 10) {
  const orders = notCancelled(await fetchOrders(from, to));
  const ids = orders.map((o) => o.id);
  if (!ids.length) return [];
  const items = [];
  for (let i = 0; i < ids.length; i += 200) {
    items.push(
      ...sb(
        await supabase
          .from('order_items')
          .select('name, price, qty, order_id')
          .in('order_id', ids.slice(i, i + 200))
      )
    );
  }
  const agg = {};
  for (const it of items) {
    agg[it.name] ??= { name: it.name, qty: 0, revenue: 0 };
    agg[it.name].qty += it.qty;
    agg[it.name].revenue += it.qty * it.price;
  }
  return Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export async function peakHours(from, to) {
  const rows = notCancelled(await fetchOrders(from, to));
  const hours = {};
  for (const o of rows) {
    const hour = new Date(o.created_at).getHours();
    hours[hour] ??= { hour, orders: 0 };
    hours[hour].orders++;
  }
  return Object.values(hours).sort((a, b) => a.hour - b.hour);
}

// prep = accepted → cooked; response = pending → accepted. Legacy migrated
// orders lack these rows and drop out naturally.
export async function prepTimes(from, to) {
  const orders = notCancelled(await fetchOrders(from, to));
  const hist = await fetchHistory(orders.map((o) => o.id));

  const marks = {};
  for (const h of hist) {
    const m = (marks[h.order_id] ??= {});
    const t = new Date(h.changed_at).getTime();
    if (m[h.to_status] === undefined || t < m[h.to_status]) m[h.to_status] = t;
  }

  const prep = [];
  const response = [];
  for (const m of Object.values(marks)) {
    if (m.accepted !== undefined && m.cooked !== undefined) prep.push((m.cooked - m.accepted) / 60000);
    if (m.pending !== undefined && m.accepted !== undefined) response.push((m.accepted - m.pending) / 60000);
  }
  const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);
  return { sampleCount: prep.length, avgPrepMinutes: avg(prep), avgResponseMinutes: avg(response) };
}

export async function statusFunnel(from, to) {
  const orders = await fetchOrders(from, to);
  const hist = await fetchHistory(orders.map((o) => o.id));
  const agg = {};
  for (const h of hist) {
    agg[h.to_status] ??= new Set();
    agg[h.to_status].add(h.order_id);
  }
  return Object.entries(agg).map(([status, set]) => ({ status, orders: set.size }));
}

// End-of-day closing report: everything the owner reconciles the drawer
// against. Defaults to today (local midnight → now).
export async function dayReport(from, to) {
  if (!from) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    from = d.toISOString();
  }

  const rows = await fetchOrders(from, to, 'id, status, total, created_at, order_type');
  const ok = notCancelled(rows);

  let pq = supabase
    .from('payments')
    .select('method, total, subtotal, discount, extra_charge')
    .gte('created_at', from);
  if (to) pq = pq.lt('created_at', to);
  const payments = sb(await pq);

  const byMethod = {};
  let collected = 0;
  let discounts = 0;
  let extraCharges = 0;
  for (const p of payments) {
    byMethod[p.method] = (byMethod[p.method] || 0) + p.total;
    collected += p.total;
    discounts += p.discount || 0;
    extraCharges += p.extra_charge || 0;
  }

  // Credit movement in the range + all-time outstanding.
  const credits = sb(
    await supabase.from('credit_entries').select('amount, created_at')
  );
  let creditGiven = 0;
  let creditRepaid = 0;
  let outstanding = 0;
  for (const c of credits) {
    outstanding += c.amount;
    if (c.created_at >= from && (!to || c.created_at < to)) {
      if (c.amount > 0) creditGiven += c.amount;
      else creditRepaid += -c.amount;
    }
  }

  const top = await topItems(from, to, 5);

  // still-unpaid tabs right now (should be zero when the shop shuts)
  const unpaid = sb(
    await supabase
      .from('orders')
      .select('total')
      .is('payment_id', null)
      .neq('status', 'cancelled')
  );

  return {
    from,
    to: to ?? null,
    orderCount: ok.length,
    cancelledCount: rows.length - ok.length,
    takeawayCount: ok.filter((o) => o.order_type === 'takeaway').length,
    revenue: ok.reduce((s, o) => s + o.total, 0),
    collected,
    collectedByMethod: byMethod,
    discounts,
    extraCharges,
    creditGiven,
    creditRepaid,
    creditOutstanding: outstanding,
    unpaidTotal: unpaid.reduce((s, o) => s + o.total, 0),
    topItems: top,
  };
}

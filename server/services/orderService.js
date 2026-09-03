import crypto from 'crypto';
import { supabase, sb, nowIso } from '../db.js';
import { emitOrderNew, emitOrderStatus } from '../sockets.js';

// ---- state machine ----------------------------------------------------
// transition key: `${from}->${to}` → roles allowed to perform it
const TRANSITIONS = {
  'pending->accepted': ['kitchen', 'owner'],
  'accepted->preparing': ['kitchen', 'owner'],
  'preparing->cooked': ['kitchen', 'owner'],
  'cooked->served': ['staff', 'owner'],
  'pending->cancelled': ['staff', 'kitchen', 'owner'],
  'accepted->cancelled': ['staff', 'kitchen', 'owner'],
  'preparing->cancelled': ['staff', 'kitchen', 'owner'],
  'cooked->cancelled': ['staff', 'owner'],
};

// "Active" for staff = anything not yet settled: unpaid and not cancelled.
// Served orders stay on the counter until the table's bill is paid.

// ---- shaping ----------------------------------------------------------
// PostgREST embedded selects — items (and optionally history) arrive on the
// order row in one round trip instead of one query per order.
const ITEMS_EMBED = 'order_items(id, menu_item_id, name, price, qty)';
const HISTORY_EMBED = 'order_status_history(from_status, to_status, changed_at, users(display_name))';
const PAYMENT_EMBED = 'payment:payments(id, method, total, discount, created_at, taker:users(display_name))';

function shapeOrder(row) {
  if (!row) return null;
  const items = row.order_items ?? [];
  const order = {
    id: row.id,
    publicCode: row.public_code,
    name: row.customer_name,
    phone: row.customer_phone,
    table: row.table_no,
    orderType: row.order_type || 'dine',
    queueNo: row.queue_no ?? null,
    note: row.note,
    status: row.status,
    total: row.total,
    source: row.source,
    paymentId: row.payment_id ?? null,
    paid: !!row.payment_id,
    createdAt: row.created_at,
    items: items.map((it) => ({
      id: it.id,
      menuItemId: it.menu_item_id,
      name: it.name,
      price: it.price,
      qty: it.qty,
    })),
  };
  if (row.payment) {
    order.payment = {
      id: row.payment.id,
      method: row.payment.method,
      total: row.payment.total,
      discount: row.payment.discount ?? 0,
      createdAt: row.payment.created_at, // when the bill was actually paid
      takenBy: row.payment.taker?.display_name ?? null,
    };
  }
  if (row.order_status_history) {
    order.history = row.order_status_history.map((h) => ({
      fromStatus: h.from_status,
      toStatus: h.to_status,
      changedAt: h.changed_at,
      changedBy: h.users?.display_name ?? null,
    }));
  }
  return order;
}

export async function getOrderByCode(publicCode, { includeHistory = false } = {}) {
  let q = supabase
    .from('orders')
    .select(includeHistory ? `*, ${ITEMS_EMBED}, ${HISTORY_EMBED}` : `*, ${ITEMS_EMBED}`)
    .eq('public_code', publicCode)
    .order('id', { referencedTable: 'order_items' });
  if (includeHistory) q = q.order('changed_at', { referencedTable: 'order_status_history' });
  const row = sb(await q.maybeSingle());
  return shapeOrder(row);
}

const IN_KITCHEN = ['pending', 'accepted', 'preparing'];
const FALLBACK_PREP_MIN = 7; // no history yet — a chiya round takes ~7 min

// The 200-row history scan behind the prep-time average is the heaviest query
// on the customer-tracking hot path and changes slowly — cache it for 60s
// (shared across all tracking customers).
let avgPrepCache = { value: null, at: 0 };
const AVG_PREP_TTL_MS = 60_000;

async function getAvgPrepMinutes() {
  if (avgPrepCache.value !== null && Date.now() - avgPrepCache.at < AVG_PREP_TTL_MS) {
    return avgPrepCache.value;
  }
  // Average accepted→cooked over the last 20 finished orders today.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const hist = sb(
    await supabase
      .from('order_status_history')
      .select('order_id, to_status, changed_at')
      .gte('changed_at', dayStart.toISOString())
      .in('to_status', ['accepted', 'cooked'])
      .order('changed_at', { ascending: false })
      .limit(200)
  );
  const marks = {};
  for (const h of hist) {
    (marks[h.order_id] ??= {})[h.to_status] = new Date(h.changed_at).getTime();
  }
  const samples = Object.values(marks)
    .filter((m) => m.accepted && m.cooked && m.cooked > m.accepted)
    .map((m) => (m.cooked - m.accepted) / 60000)
    .slice(0, 20);
  const avgPrep = samples.length
    ? samples.reduce((s, v) => s + v, 0) / samples.length
    : FALLBACK_PREP_MIN;
  avgPrepCache = { value: avgPrep, at: Date.now() };
  return avgPrep;
}

// Queue position + rough ETA for a customer's order. Position = orders that
// entered the kitchen before this one and aren't done yet; ETA scales the
// shop's recent average prep time by kitchen load.
export async function getQueueInfo(order) {
  if (!IN_KITCHEN.includes(order.status)) return null;

  const [{ count }, avgPrep] = await Promise.all([
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', IN_KITCHEN)
      .lt('created_at', order.createdAt),
    getAvgPrepMinutes(),
  ]);
  const ahead = count ?? 0;

  // Rough: the kitchen works through the queue roughly serially at tea-shop
  // scale. Preparing orders are already partway done — count them as half.
  const estMinutes = Math.max(2, Math.round(avgPrep * (1 + ahead * 0.5)));
  return { ahead, estMinutes };
}

export async function listOrders({ scope = 'active', from, to } = {}) {
  // 'history': everything in a date range (paid, unpaid, cancelled) with the
  // payment row embedded — one round trip for the owner's history tab.
  if (scope === 'history') {
    let q = supabase
      .from('orders')
      .select(`*, ${ITEMS_EMBED}, ${PAYMENT_EMBED}`)
      .order('created_at', { ascending: false })
      .order('id', { referencedTable: 'order_items' })
      .limit(500);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lt('created_at', to); // half-open [from, to)
    const rows = sb(await q);
    return rows.map(shapeOrder);
  }
  let q = supabase
    .from('orders')
    .select(`*, ${ITEMS_EMBED}`)
    .order('created_at', { ascending: false })
    .order('id', { referencedTable: 'order_items' });
  q = scope === 'active' ? q.is('payment_id', null).neq('status', 'cancelled') : q.limit(500);
  const rows = sb(await q);
  return rows.map(shapeOrder);
}

// ---- create -----------------------------------------------------------
function generateCode() {
  // crypto-random, unambiguous alphabet
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `HCP-${s}`;
}

export async function createOrder(data, user) {
  const createdAt = nowIso();
  const orderType = data.orderType || 'dine';

  // Takeaway pickup token: today's takeaway count + 1. A concurrent-order tie
  // would duplicate a token — harmless at counter scale (names disambiguate).
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  // Server recomputes everything from DB prices — client totals are ignored.
  // Menu lookup and takeaway count are independent — run them in parallel.
  const ids = data.items.map((l) => l.menuItemId);
  const [menuRows, takeawayCount] = await Promise.all([
    supabase
      .from('menu_items')
      .select('id, name, price, is_available, is_deleted')
      .in('id', ids)
      .then(sb),
    orderType === 'takeaway'
      ? supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('order_type', 'takeaway')
          .gte('created_at', dayStart.toISOString())
          .then(({ count }) => count ?? 0)
      : Promise.resolve(null),
  ]);
  const byId = new Map(menuRows.map((m) => [m.id, m]));

  let total = 0;
  const lines = [];
  for (const line of data.items) {
    const item = byId.get(line.menuItemId);
    if (!item || item.is_deleted) throw httpError(400, `Unknown menu item ${line.menuItemId}`);
    if (!item.is_available) throw httpError(409, `"${item.name}" is currently unavailable`);
    total += item.price * line.qty;
    lines.push({ menu_item_id: item.id, name: item.name, price: item.price, qty: line.qty });
  }

  const queueNo = orderType === 'takeaway' ? takeawayCount + 1 : null;

  // public_code is UNIQUE — on the (astronomically rare) collision, retry.
  let orderRow = null;
  for (let attempt = 0; attempt < 5 && !orderRow; attempt++) {
    const { data: inserted, error } = await supabase
      .from('orders')
      .insert({
        public_code: generateCode(),
        customer_name: data.name,
        customer_phone: data.phone,
        table_no: orderType === 'takeaway' ? 'TA' : data.table,
        order_type: orderType,
        queue_no: queueNo,
        note: data.note,
        status: 'pending',
        total,
        source: user ? 'staff' : 'customer',
        created_by: user?.id ?? null,
        created_at: createdAt,
      })
      .select('*')
      .single();
    if (!error) orderRow = inserted;
    else if (error.code !== '23505') throw httpError(500, error.message);
  }
  if (!orderRow) throw httpError(500, 'Could not generate order code');

  // Items must land before the kitchen sees the order — awaited, with the
  // returned rows used directly so no re-select is needed.
  let insertedItems;
  try {
    insertedItems = sb(
      await supabase
        .from('order_items')
        .insert(lines.map((l) => ({ ...l, order_id: orderRow.id })))
        .select('id, menu_item_id, name, price, qty')
    );
  } catch (err) {
    // No transactions over the REST API — undo the parent row (cascades) so a
    // half-written order never reaches the kitchen.
    await supabase.from('orders').delete().eq('id', orderRow.id);
    throw err;
  }

  // Audit trail, not money — persist in the background so the customer isn't
  // waiting on it. Never sb() here: a throw would be an unhandled rejection.
  supabase
    .from('order_status_history')
    .insert({
      order_id: orderRow.id,
      from_status: null,
      to_status: 'pending',
      changed_by: user?.id ?? null,
      changed_at: createdAt,
    })
    .then(({ error }) => {
      if (error) console.error(`history insert failed (order ${orderRow.id}):`, error.message);
    });

  const order = shapeOrder({ ...orderRow, order_items: insertedItems });
  emitOrderNew(order);
  return order;
}

// ---- transition -------------------------------------------------------
export async function transitionOrder(orderId, toStatus, user) {
  const changedAt = nowIso();

  const row = sb(await supabase.from('orders').select('*').eq('id', orderId).maybeSingle());
  if (!row) throw httpError(404, 'Order not found');
  // A settled order is part of a recorded payment — it can no longer change.
  if (row.payment_id) throw httpError(409, 'Order is already paid and settled');

  const key = `${row.status}->${toStatus}`;
  const allowedRoles = TRANSITIONS[key];
  if (!allowedRoles) throw httpError(409, `Cannot go from "${row.status}" to "${toStatus}"`);
  if (!allowedRoles.includes(user.role)) {
    throw httpError(403, `Role "${user.role}" cannot perform ${key}`);
  }

  // Optimistic concurrency: the update only applies if the status is still
  // what we just read, so two staff tapping at once can't double-transition.
  // The embedded select returns the full shaped payload — no re-query.
  const updated = sb(
    await supabase
      .from('orders')
      .update({ status: toStatus })
      .eq('id', orderId)
      .eq('status', row.status)
      .is('payment_id', null) // settle may have raced in — paid orders are frozen
      .select(`*, ${ITEMS_EMBED}`)
  );
  if (!updated.length) throw httpError(409, 'Order was just updated by someone else — refresh');

  // Audit trail — background write, same rationale as in createOrder.
  supabase
    .from('order_status_history')
    .insert({
      order_id: orderId,
      from_status: row.status,
      to_status: toStatus,
      changed_by: user.id,
      changed_at: changedAt,
    })
    .then(({ error }) => {
      if (error) console.error(`history insert failed (order ${orderId}):`, error.message);
    });

  const result = shapeOrder(updated[0]);
  emitOrderStatus({
    id: result.id,
    publicCode: result.publicCode,
    status: result.status,
    changedAt,
    changedBy: user.displayName,
  });
  return result;
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, sb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SQLITE_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'hcp.db');

const STATUS_MAP = {
  Pending: 'pending',
  Preparing: 'preparing',
  Served: 'served',
  Cancelled: 'cancelled',
};

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function toIsoLoose(legacyTime) {
  const d = new Date(legacyTime);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// One-time import into Supabase, only when the remote DB is empty.
// Preferred source: the local SQLite DB (full history incl. users);
// fallback: the original legacy JSON files.
export async function runMigration() {
  const { count, error } = await supabase
    .from('menu_items')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if (count > 0) return { migrated: false };

  if (fs.existsSync(SQLITE_PATH)) {
    try {
      return await migrateFromSqlite();
    } catch (err) {
      console.error('[migrate] SQLite import failed, falling back to JSON:', err.message);
    }
  }
  return migrateFromJson();
}

async function migrateFromSqlite() {
  // Lazy import: better-sqlite3 is only needed for this one-time migration.
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  const users = sqlite.prepare('SELECT * FROM users').all();
  const menu = sqlite.prepare('SELECT * FROM menu_items').all();
  const orders = sqlite.prepare('SELECT * FROM orders').all();
  const items = sqlite.prepare('SELECT * FROM order_items').all();
  const history = sqlite.prepare('SELECT * FROM order_status_history').all();
  sqlite.close();

  // Fresh ids are assigned by Supabase and FK references are remapped —
  // inserting the old explicit ids would desync the identity sequences,
  // which we can't reset through the supabase-js API.
  const userIdMap = {};
  for (const u of users) {
    const row = sb(
      await supabase
        .from('users')
        .insert({
          username: u.username,
          password_hash: u.password_hash,
          role: u.role,
          display_name: u.display_name,
          is_active: !!u.is_active,
          created_at: u.created_at,
        })
        .select('id')
        .single()
    );
    userIdMap[u.id] = row.id;
  }

  const menuIdMap = {};
  for (const m of menu) {
    const row = sb(
      await supabase
        .from('menu_items')
        .insert({
          name: m.name,
          category: m.category,
          price: m.price,
          image: m.image,
          is_available: !!m.is_available,
          is_deleted: !!m.is_deleted,
          legacy_id: m.legacy_id,
          created_at: m.created_at,
        })
        .select('id')
        .single()
    );
    menuIdMap[m.id] = row.id;
  }

  const orderIdMap = {};
  for (const o of orders) {
    const row = sb(
      await supabase
        .from('orders')
        .insert({
          public_code: o.public_code,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          table_no: o.table_no,
          note: o.note,
          status: o.status,
          total: o.total,
          source: o.source,
          created_by: o.created_by ? userIdMap[o.created_by] ?? null : null,
          created_at: o.created_at,
        })
        .select('id')
        .single()
    );
    orderIdMap[o.id] = row.id;
  }

  const itemRows = items.map((it) => ({
    order_id: orderIdMap[it.order_id],
    menu_item_id: it.menu_item_id ? menuIdMap[it.menu_item_id] ?? null : null,
    name: it.name,
    price: it.price,
    qty: it.qty,
  })).filter((r) => r.order_id);
  if (itemRows.length) sb(await supabase.from('order_items').insert(itemRows));

  const histRows = history.map((h) => ({
    order_id: orderIdMap[h.order_id],
    from_status: h.from_status,
    to_status: h.to_status,
    changed_by: h.changed_by ? userIdMap[h.changed_by] ?? null : null,
    changed_at: h.changed_at,
  })).filter((r) => r.order_id);
  if (histRows.length) sb(await supabase.from('order_status_history').insert(histRows));

  console.log(
    `[migrate] imported from SQLite: ${users.length} users, ${menu.length} menu items, ` +
      `${orders.length} orders, ${items.length} order lines, ${history.length} history rows`
  );
  return { migrated: true, source: 'sqlite', menuRows: menu.length, orderRows: orders.length };
}

async function migrateFromJson() {
  const legacyMenu = readJsonSafe(path.join(DATA_DIR, 'menu.json'));
  const legacyOrders = readJsonSafe(path.join(DATA_DIR, 'orders.json'));
  if (!legacyMenu.length && !legacyOrders.length) return { migrated: false };

  let menuRows = 0;
  const legacyIdMap = {};
  for (const item of legacyMenu) {
    if (!item?.name) continue;
    const row = sb(
      await supabase
        .from('menu_items')
        .insert({
          name: String(item.name),
          category: String(item.category || 'Others'),
          price: Math.max(0, Math.round(Number(item.price) || 0)),
          image: String(item.image || ''),
          legacy_id: String(item.id ?? ''),
        })
        .select('id, legacy_id')
        .single()
    );
    legacyIdMap[row.legacy_id] = row.id;
    menuRows++;
  }

  let orderRows = 0;
  for (const o of legacyOrders) {
    if (!o?.orderId) continue;
    const createdAt = toIsoLoose(o.time);
    const status = STATUS_MAP[o.status] || 'served';
    const { data: inserted, error } = await supabase
      .from('orders')
      .insert({
        public_code: String(o.orderId),
        customer_name: String(o.name || 'N/A'),
        customer_phone: String(o.phone || ''),
        table_no: String(o.table || '?'),
        note: String(o.note || ''),
        status,
        // keep the historical stored total; prices may have changed since
        total: Math.max(0, Math.round(Number(o.total) || 0)),
        source: 'customer',
        created_at: createdAt,
      })
      .select('id')
      .single();
    if (error) continue; // duplicate public_code in legacy data — skip

    const lines = (o.items || []).map((it) => ({
      order_id: inserted.id,
      menu_item_id: legacyIdMap[String(it.id ?? '')] ?? null,
      name: String(it.name || '?'),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
    }));
    if (lines.length) sb(await supabase.from('order_items').insert(lines));
    sb(
      await supabase.from('order_status_history').insert({
        order_id: inserted.id,
        from_status: null,
        to_status: status,
        changed_by: null,
        changed_at: createdAt,
      })
    );
    orderRows++;
  }

  console.log(`[migrate] imported ${menuRows} menu items, ${orderRows} orders from JSON`);
  return { migrated: true, source: 'json', menuRows, orderRows };
}

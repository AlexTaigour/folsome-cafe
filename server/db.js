import { createClient } from '@supabase/supabase-js';

// Supabase via URL + key (supabase-js REST). No direct Postgres connection.
//   SUPABASE_URL=https://<ref>.supabase.co
//
// KEY CHOICE (see DEPLOYMENT.md → "Supabase key model"):
//   • Production: SUPABASE_SERVICE_ROLE_KEY — a server-only secret that bypasses
//     RLS. Pair it with supabase-hardening.sql so the anon key can't touch data.
//   • Dev / current setup: SUPABASE_ANON_KEY — works under the allow-all RLS
//     policy in supabase-schema.sql, but behaves like a database password, so it
//     must never reach a browser or a public repo.
// The server prefers the service_role key when present and falls back to anon.
// Tables must exist first — see supabase-schema.sql (paste once into the
// Supabase Dashboard → SQL Editor). checkSchema() below verifies this at boot.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase config. Set:');
  console.error('   SUPABASE_URL=https://<your-ref>.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=<service_role key>   (recommended for production)');
  console.error('   — or, for dev — SUPABASE_ANON_KEY=<anon key>   (Dashboard → Project Settings → API)');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️  Using the Supabase ANON key in production. Under the current RLS policy it grants full read/write to every table and behaves like a database password. Prefer SUPABASE_SERVICE_ROLE_KEY and run supabase-hardening.sql to lock out anon. Never expose this key in a browser or public repo.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Unwrap the { data, error } envelope: throw on error, return data.
export function sb({ data, error }) {
  if (error) {
    // Log full error object for easier debugging of network/fetch issues.
    console.error('Supabase request error:', error);
    const err = new Error(error.message || 'Supabase error');
    err.code = error.code || '';
    err.details = error;
    throw err;
  }
  return data;
}

export async function checkSchema() {
  const { error } = await supabase.from('menu_items').select('id').limit(1);
  if (!error) {
    // Newer feature tables/columns — added after the initial release. Missing
    // any means the user hasn't re-run the (idempotent) supabase-schema.sql.
    const probes = [
      ['payments', supabase.from('payments').select('id, discount').limit(1)],
      ['credit_entries', supabase.from('credit_entries').select('id').limit(1)],
      ['service_calls', supabase.from('service_calls').select('id').limit(1)],
      ['app_settings', supabase.from('app_settings').select('key').limit(1)],
      ['orders.order_type', supabase.from('orders').select('order_type').limit(1)],
      ['menu_items.description', supabase.from('menu_items').select('description').limit(1)],
      ['menu_items.cook_minutes', supabase.from('menu_items').select('cook_minutes').limit(1)],
    ];
    for (const [what, probe] of probes) {
      const { error: pErr } = await probe;
      if (pErr && (pErr.code === '42P01' || pErr.code === '42703' || /find the table|does not exist|column/i.test(pErr.message))) {
        console.error(`❌ The database is missing "${what}" (added in a newer version).`);
        console.error('   Open Supabase Dashboard → SQL Editor, paste the current');
        console.error('   contents of supabase-schema.sql and click Run (safe to re-run).');
        console.error('   Then start this server again.');
        process.exit(1);
      }
    }
    return;
  }
  if (error.code === '42P01' || /find the table|does not exist/i.test(error.message)) {
    console.error('❌ Database tables not found in your Supabase project.');
    console.error('   One-time setup: open Supabase Dashboard → SQL Editor,');
    console.error('   paste the contents of supabase-schema.sql and click Run.');
    console.error('   Then start this server again.');
  } else {
    console.error('❌ Could not reach Supabase:', error.message);
    console.error('   Check SUPABASE_URL and your Supabase key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).');
  }
  process.exit(1);
}

export const nowIso = () => new Date().toISOString();

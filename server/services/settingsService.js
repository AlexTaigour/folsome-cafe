import { supabase, sb, nowIso } from '../db.js';

// Generic app_settings key→JSON store. Currently backs the "order gate": the
// controls that keep customer ordering to people inside the café — an allowlist
// of the café's public IP(s) and/or a GPS geofence around the café.

const ORDER_GATE_KEY = 'order_gate';
const DEFAULT_GEO = { enabled: false, lat: null, lng: null, radiusM: 150 };
const DEFAULT_GATE = { enabled: false, ips: [], geo: { ...DEFAULT_GEO }, mode: 'any' };

// The gate is read on every customer order (hot path) but changes rarely —
// cache it briefly, same rationale as avgPrepCache in orderService. Writes
// refresh the cache immediately; other instances converge within the TTL.
let cache = { value: null, at: 0 };
const TTL_MS = 15_000;

const numOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function normalizeGeo(value) {
  const g = value && typeof value === 'object' ? value : {};
  const lat = numOrNull(g.lat);
  const lng = numOrNull(g.lng);
  // Clamp radius to a sane café-scale range; default if unset/garbage.
  let radiusM = numOrNull(g.radiusM);
  radiusM = radiusM == null ? DEFAULT_GEO.radiusM : Math.min(5000, Math.max(20, Math.round(radiusM)));
  const inRange =
    lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return {
    enabled: !!g.enabled,
    lat: inRange ? lat : null,
    lng: inRange ? lng : null,
    radiusM,
  };
}

// Coerce whatever is in the DB (or a client patch) into a safe, deduped shape.
function normalizeGate(value) {
  const v = value && typeof value === 'object' ? value : {};
  const ips = Array.isArray(v.ips)
    ? [...new Set(v.ips.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    enabled: !!v.enabled,
    ips,
    geo: normalizeGeo(v.geo),
    mode: v.mode === 'all' ? 'all' : 'any',
  };
}

export async function getOrderGate() {
  if (cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = sb(
    await supabase.from('app_settings').select('value').eq('key', ORDER_GATE_KEY).maybeSingle()
  );
  const value = row ? normalizeGate(row.value) : normalizeGate(DEFAULT_GATE);
  cache = { value, at: Date.now() };
  return value;
}

export async function setOrderGate(patch, userId) {
  const current = await getOrderGate();
  // Deep-merge geo so a partial patch (e.g. just toggling geo.enabled) doesn't
  // clobber the saved café coordinates — top-level keys still overwrite.
  const merged = {
    ...current,
    ...patch,
    geo: patch.geo ? { ...current.geo, ...patch.geo } : current.geo,
  };
  const next = normalizeGate(merged);
  sb(
    await supabase
      .from('app_settings')
      .upsert(
        { key: ORDER_GATE_KEY, value: next, updated_by: userId ?? null, updated_at: nowIso() },
        { onConflict: 'key' }
      )
      .select('key')
  );
  cache = { value: next, at: Date.now() };
  return next;
}

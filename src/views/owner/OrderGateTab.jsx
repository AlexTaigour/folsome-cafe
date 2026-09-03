import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Loader2, Plus, Trash2, MapPin, Wifi, AlertTriangle, Lock, Navigation, Crosshair, RefreshCw, Globe, CheckCircle2 } from 'lucide-react';
import { fetchOrderGate, updateOrderGate, detectMyIp } from '../../api/client';

// Read a fresh GPS fix from the browser. Needs HTTPS (fine on the live site).
function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device has no location support.'));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? 'Location permission was blocked. Allow it in your browser and try again.'
              : 'Could not get your location. Make sure you are on the live (https) site.'
          )
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

const RADII = [100, 150, 200, 300, 500];

// Small coloured pill describing the detected IP so the owner can tell at a
// glance whether it's a real café connection (public) or a local/proxy address
// that can't be used to lock the gate.
function IpKindBadge({ kind }) {
  const map = {
    public: { label: 'Public IP', cls: 'bg-green-100 text-green-700' },
    private: { label: 'Private IP', cls: 'bg-amber-100 text-amber-700' },
    loopback: { label: 'Local only', cls: 'bg-amber-100 text-amber-700' },
    unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-500' },
  };
  const b = map[kind] || map.unknown;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${b.cls}`}>
      {b.label}
    </span>
  );
}

// Owner control for the in-café ordering lock. Two independent layers keep
// ordering to people physically at the café: a café-Wi-Fi (public IP) allowlist
// and a GPS geofence. When both are on, "mode" decides whether either or both
// must pass. Staff logged in always bypass.
export default function OrderGateTab() {
  const [gate, setGate] = useState(null); // { enabled, ips, geo, mode, currentIp, currentIpKind }
  const [busy, setBusy] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [detectedAt, setDetectedAt] = useState(null);
  const [externalIp, setExternalIp] = useState('');
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalErr, setExternalErr] = useState('');

  useEffect(() => {
    fetchOrderGate()
      .then(setGate)
      .catch((e) => setError(e.message));
  }, []);

  // Every mutation goes through the server and replaces local state with the
  // normalized result, so the UI always reflects what's actually stored.
  const save = async (patch) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const updated = await updateOrderGate(patch);
      setGate(updated);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const currentIsListed = gate?.ips?.some(
    (ip) => ip.toLowerCase() === (gate.currentIp || '').toLowerCase()
  );
  // A real café connection is a public IP. Loopback/private means local testing
  // or a misconfigured proxy — locking to it would block everyone or do nothing.
  const currentIsPublic = gate?.currentIpKind === 'public';

  // Re-detect the current IP on demand — the owner switched to café Wi-Fi, or
  // fixed a proxy setting — without reloading the page. Deliberately does NOT
  // auto-enable or auto-add anything: merely opening this tab must never change
  // the lock (the old auto-add-on-view behaviour was a footgun). Locking stays
  // an explicit tap on "Lock ordering to this network" below.
  const refreshIp = async () => {
    if (detecting) return;
    setDetecting(true);
    setError('');
    try {
      const { ip, kind } = await detectMyIp();
      setGate((g) => (g ? { ...g, currentIp: ip, currentIpKind: kind } : g));
      setDetectedAt(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  };

  // Optional, diagnostic-only. Asks a public echo service (from the owner's
  // browser) what the café's real public IP is. Only useful when the server
  // reports a non-public IP — it reveals the true address so the owner can
  // confirm the proxy fix. We never lock to this value: the gate enforces on
  // what the *server* sees, so an IP the server can't see would block everyone.
  const lookupExternalIp = async () => {
    if (externalBusy) return;
    setExternalBusy(true);
    setExternalErr('');
    setExternalIp('');
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (!res.ok) throw new Error('lookup failed');
      const data = await res.json();
      setExternalIp(String(data.ip || '').trim());
    } catch {
      setExternalErr('Could not reach the lookup service. Check the connection and try again.');
    } finally {
      setExternalBusy(false);
    }
  };

  const lockToHere = () => {
    if (!gate?.currentIp || !currentIsPublic) return;
    const ips = currentIsListed ? gate.ips : [...(gate.ips || []), gate.currentIp];
    save({ enabled: true, ips });
  };

  const addIp = () => {
    const ip = newIp.trim();
    if (!ip) return;
    save({ ips: [...(gate.ips || []), ip] }).then((ok) => ok && setNewIp(''));
  };

  const removeIp = (ip) => save({ ips: gate.ips.filter((x) => x !== ip) });

  const useMyLocation = async () => {
    setGeoErr('');
    setLocating(true);
    try {
      const loc = await getBrowserLocation();
      await save({ geo: { enabled: true, lat: loc.lat, lng: loc.lng } });
    } catch (e) {
      setGeoErr(e.message);
    } finally {
      setLocating(false);
    }
  };

  if (!gate) {
    return (
      <div className="flex justify-center py-20">
        {error ? (
          <p className="text-red-500 font-bold">{error}</p>
        ) : (
          <Loader2 className="animate-spin text-espresso" size={40} />
        )}
      </div>
    );
  }

  const geo = gate.geo || { enabled: false, lat: null, lng: null, radiusM: 150 };
  const ipActive = gate.enabled && gate.ips.length > 0;
  const geoActive = geo.enabled && geo.lat != null && geo.lng != null;
  const anyActive = ipActive || geoActive;
  const bothActive = ipActive && geoActive;

  const Toggle = ({ on, onClick, label }) => (
    <button
      onClick={onClick}
      disabled={busy}
      title={label}
      className={`relative w-16 h-9 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
        on ? 'bg-green-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-7 h-7 bg-white rounded-full shadow transition-transform ${
          on ? 'translate-x-7' : ''
        }`}
      />
    </button>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-3xl font-black text-bean tracking-tight">In-Café Ordering</h2>
        <p className="text-sm text-gray-500 font-medium mt-1">
          Only let people <span className="font-bold">inside the café</span> place orders from the website.
        </p>
      </div>

      {/* Overall status */}
      <div
        className={`rounded-3xl p-6 border shadow-sm mb-5 flex items-center gap-4 ${
          anyActive ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'
        }`}
      >
        <div className={`p-3 rounded-2xl ${anyActive ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
          {anyActive ? <ShieldCheck size={26} /> : <ShieldOff size={26} />}
        </div>
        <div>
          <p className="font-black text-lg text-bean">{anyActive ? 'Lock is ON' : 'Lock is OFF'}</p>
          <p className="text-sm font-bold text-gray-500">
            {anyActive
              ? `Guests must be ${[ipActive && 'on café Wi-Fi', geoActive && 'at the café'].filter(Boolean).join(bothActive ? (gate.mode === 'all' ? ' AND ' : ' or ') : '')} to order.`
              : 'Anyone with the link can order right now. Turn on a check below.'}
          </p>
        </div>
      </div>

      {/* ---- Layer 1: Café Wi-Fi (IP) ---- */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${ipActive ? 'bg-espresso text-white' : 'bg-gray-100 text-gray-400'}`}>
              <Wifi size={20} />
            </div>
            <div>
              <h3 className="font-black text-espresso">Café Wi-Fi check</h3>
              <p className="text-xs font-bold text-gray-400">Allow only the café's internet connection.</p>
            </div>
          </div>
          <Toggle on={gate.enabled} onClick={() => save({ enabled: !gate.enabled })} label="Toggle Wi-Fi check" />
        </div>

        {/* Current connection: detected IP, its kind, and an explicit re-detect */}
        <div className="bg-cream/60 rounded-2xl p-4 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1">
                Your current connection
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-black text-espresso break-all">
                  {gate.currentIp || 'unknown'}
                </span>
                <IpKindBadge kind={gate.currentIpKind} />
                {currentIsPublic && currentIsListed && (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-green-600">
                    <CheckCircle2 size={14} /> already allowed
                  </span>
                )}
              </div>
              {detectedAt && <p className="text-[11px] font-bold text-gray-400 mt-1">Re-checked just now.</p>}
            </div>
            <button
              onClick={refreshIp}
              disabled={detecting || busy}
              className="shrink-0 inline-flex items-center gap-2 bg-white border-2 border-gray-100 hover:border-chiya/40 text-espresso px-4 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {detecting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Detect my IP
            </button>
          </div>
        </div>

        {!currentIsPublic && (
          <div className="mb-4 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                This isn’t a public internet address, so it can’t identify the café. You’re seeing this because
                you’re running the app <span className="underline">locally</span>, or the host isn’t set to
                trust its proxy (<span className="font-mono">TRUST_PROXY=1</span>). Open the{' '}
                <span className="underline">live café website on the shop Wi-Fi</span> and tap{' '}
                <span className="font-mono">Detect my IP</span> to get the real address.
              </span>
            </div>
            {/* Optional diagnostic: reveal the café's true public IP from the browser */}
            <div className="mt-3 pl-6">
              <button
                onClick={lookupExternalIp}
                disabled={externalBusy}
                className="inline-flex items-center gap-2 bg-white border border-red-200 hover:border-red-300 text-red-600 px-3 py-2 rounded-lg font-black transition-all active:scale-95 disabled:opacity-50"
              >
                {externalBusy ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                Look up my public IP
              </button>
              {externalIp && (
                <p className="mt-2 font-bold text-gray-600">
                  An outside service sees your public IP as{' '}
                  <span className="font-mono text-espresso">{externalIp}</span>. If that differs from the address
                  above, the server isn’t receiving the real client IP — fix{' '}
                  <span className="font-mono">TRUST_PROXY</span> / your proxy so the two match before locking.
                </p>
              )}
              {externalErr && <p className="mt-2 font-bold text-red-500">{externalErr}</p>}
            </div>
          </div>
        )}

        <button
          onClick={lockToHere}
          disabled={busy || !currentIsPublic || (ipActive && currentIsListed)}
          className="w-full sm:w-auto bg-espresso hover:bg-bean text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
          {ipActive && currentIsListed ? 'This network is locked in' : 'Lock ordering to this network'}
        </button>

        {/* Allowlist */}
        {gate.ips.length > 0 && (
          <ul className="space-y-2 mt-4">
            {gate.ips.map((ip) => (
              <li key={ip} className="flex items-center justify-between bg-cream rounded-xl px-4 py-3">
                <span className="font-mono font-bold text-espresso break-all">
                  {ip}
                  {ip.toLowerCase() === (gate.currentIp || '').toLowerCase() && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-green-600">you now</span>
                  )}
                </span>
                <button
                  onClick={() => removeIp(ip)}
                  disabled={busy}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40"
                  aria-label={`Remove ${ip}`}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 mt-3">
          <input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addIp()}
            placeholder="Add an IP manually (e.g. a 4G backup line)"
            className="flex-1 p-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none font-mono text-sm font-bold"
          />
          <button
            onClick={addIp}
            disabled={busy || !newIp.trim()}
            className="bg-espresso text-white px-4 rounded-xl font-black flex items-center gap-1 disabled:opacity-40 shrink-0"
          >
            <Plus size={18} /> Add
          </button>
        </div>
        <p className="flex items-start gap-1.5 mt-3 text-[11px] font-bold text-amber-600">
          <Wifi size={13} className="shrink-0 mt-0.5" /> Lock while on the café Wi-Fi. If your provider changes
          the café's IP, re-open this page from the café and lock again.
        </p>
      </div>

      {/* ---- Layer 2: GPS location ---- */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${geoActive ? 'bg-espresso text-white' : 'bg-gray-100 text-gray-400'}`}>
              <Navigation size={20} />
            </div>
            <div>
              <h3 className="font-black text-espresso">GPS location check</h3>
              <p className="text-xs font-bold text-gray-400">Order only when the phone is near the café.</p>
            </div>
          </div>
          <Toggle on={geo.enabled} onClick={() => save({ geo: { enabled: !geo.enabled } })} label="Toggle GPS check" />
        </div>

        {geo.enabled && (
          <>
            <div className="bg-cream rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-espresso">
                <MapPin size={16} className="shrink-0" />
                {geo.lat != null ? (
                  <span className="font-mono">{geo.lat}, {geo.lng}</span>
                ) : (
                  <span className="text-amber-600">Café location not set yet</span>
                )}
              </div>
            </div>
            <button
              onClick={useMyLocation}
              disabled={busy || locating}
              className="w-full sm:w-auto bg-espresso hover:bg-bean text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {locating ? <Loader2 size={18} className="animate-spin" /> : <Crosshair size={18} />}
              {geo.lat != null ? 'Update café location to here' : 'Set café location to here'}
            </button>
            {geoErr && <p className="text-red-500 text-sm font-bold mt-3">{geoErr}</p>}

            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">
                Allowed distance from café
              </p>
              <div className="flex flex-wrap gap-2">
                {RADII.map((r) => (
                  <button
                    key={r}
                    onClick={() => save({ geo: { radiusM: r } })}
                    disabled={busy}
                    className={`px-4 py-2 rounded-xl font-black text-sm transition-all active:scale-95 ${
                      geo.radiusM === r ? 'bg-chiya text-white shadow' : 'border-2 border-gray-100 text-espresso hover:border-chiya/40'
                    }`}
                  >
                    {r} m
                  </button>
                ))}
              </div>
            </div>

            <p className="flex items-start gap-1.5 mt-4 text-[11px] font-bold text-amber-600">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Set this <span className="underline">at the
              café</span>. Phone GPS is only accurate to ~20–50 m, so keep the distance generous. Customers must
              allow location; it can be faked by a technical user, so it's best paired with the Wi-Fi check.
            </p>
          </>
        )}
      </div>

      {/* ---- Combine mode (only when both layers do something) ---- */}
      {bothActive && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-5">
          <h3 className="font-black text-espresso mb-1">When both checks are on…</h3>
          <p className="text-xs font-bold text-gray-400 mb-4">How should a customer prove they're at the café?</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => save({ mode: 'any' })}
              disabled={busy}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                gate.mode !== 'all' ? 'border-chiya bg-chiya/5' : 'border-gray-100 hover:border-chiya/40'
              }`}
            >
              <p className="font-black text-espresso">Either is enough ✓</p>
              <p className="text-xs font-bold text-gray-500 mt-1">
                On café Wi-Fi <span className="text-gray-400">or</span> near the café. Fewer false blocks — also
                lets guests on mobile data order. <span className="text-green-600">Recommended.</span>
              </p>
            </button>
            <button
              onClick={() => save({ mode: 'all' })}
              disabled={busy}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                gate.mode === 'all' ? 'border-chiya bg-chiya/5' : 'border-gray-100 hover:border-chiya/40'
              }`}
            >
              <p className="font-black text-espresso">Require both</p>
              <p className="text-xs font-bold text-gray-500 mt-1">
                Must be on café Wi-Fi <span className="text-gray-400">and</span> near the café. Strictest, but
                blocks anyone who won't share location.
              </p>
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm font-bold mb-4">{error}</p>}

      {/* How it works / caveats */}
      <div className="flex items-start gap-3 text-xs font-bold text-gray-500 bg-gray-50 rounded-2xl p-4">
        <AlertTriangle size={18} className="shrink-0 mt-0.5 text-gray-400" />
        <div className="space-y-1">
          <p>
            Staff logged in on any device can always order (counter/phone orders). These checks stop{' '}
            <span className="underline">remote</span> ordering from outside the café — they can't tell two
            guests apart on the same Wi-Fi.
          </p>
        </div>
      </div>
    </div>
  );
}

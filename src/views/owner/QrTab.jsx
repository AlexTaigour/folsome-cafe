import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Loader2, AlertTriangle } from 'lucide-react';
import { fetchTables, fetchServerInfo } from '../../api/client';
import { CAFE_NAME } from '../../utils/brand';

// The URL a table's QR points at. Customers scan it and land on the menu with
// their table already selected (CustomerView reads ?table=N on load).
//
// Base URL: prefer the origin the owner is actually viewing (window.location) —
// that's the same public HTTPS address customers use on a cloud deploy, and the
// LAN address when the dashboard is opened via the shop's LAN IP. Only fall back
// to the server-reported LAN IP when the dashboard is opened on localhost (dev),
// because a QR saying "localhost" is useless to a phone. NOTE: os.networkInterfaces()
// (the server's lanIp) is a private/container IP on a cloud host, so it must NOT
// be used as the QR base in production — hence the origin-first order here.
function pickBaseUrl(info) {
  const strip = (u) => String(u || '').replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const { origin, hostname } = window.location;
    const isLocal = ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
    if (origin && !isLocal) return strip(origin);
  }
  return strip(info?.baseUrl);
}

const tableUrl = (base, table) => `${base}/?table=${encodeURIComponent(table)}`;

function TableQr({ url, table }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 1, color: { dark: '#4a3728' } });
    }
  }, [url]);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
      <p className="handwritten text-xl font-bold text-espresso mb-1">{CAFE_NAME}</p>
      <canvas ref={canvasRef} className="mx-auto" />
      <p className="font-black text-2xl text-bean mt-2">Table {table}</p>
      <p className="text-[10px] text-gray-400 font-bold">Scan to order ☕</p>
    </div>
  );
}

// Build a standalone print document with exactly one QR per page, centered, and
// none of the dashboard chrome. Printing the SPA directly would carry the whole
// owner layout (sidebar + nav) onto the page and flow several QRs together — a
// dedicated document sidesteps both problems and gives clean table tents.
function buildPrintHtml(cards) {
  const pages = cards
    .map(
      ({ table, dataUrl }) => `
      <section class="page">
        <div class="cafe">${CAFE_NAME}</div>
        <img class="qr" src="${dataUrl}" alt="QR for table ${table}" />
        <div class="table">Table ${table}</div>
        <div class="hint">Scan with your phone camera to order &#9749;</div>
      </section>`
    )
    .join('');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Table QR Codes — ${CAFE_NAME}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 12mm;
    font-family: Georgia, 'Times New Roman', serif;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: avoid; break-after: avoid; }
  .cafe { font-size: 30px; font-weight: 700; color: #4a3728; margin-bottom: 14px; }
  .qr { width: 340px; height: 340px; }
  .table { font-size: 46px; font-weight: 800; color: #2b1d12; margin-top: 16px; }
  .hint { font-size: 15px; color: #8a7a6a; margin-top: 6px; letter-spacing: .04em; }
  @page { size: auto; margin: 0; }
</style>
</head>
<body>
  ${pages}
</body>
</html>`;
}

export default function QrTab() {
  const [tables, setTables] = useState([]);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    Promise.all([fetchTables(), fetchServerInfo()])
      .then(([t, i]) => { setTables(t); setInfo(i); })
      .catch((e) => setError(e.message));
  }, []);

  const base = useMemo(() => pickBaseUrl(info), [info]);
  const baseIsLocal = useMemo(() => {
    try { return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(new URL(base).hostname); }
    catch { return true; }
  }, [base]);

  // Render each QR to a PNG data URL, then hand a clean, self-contained document
  // to a new window for printing (one table per page).
  const printAll = async () => {
    if (printing || !tables.length) return;
    setPrinting(true);
    setError('');
    try {
      const cards = await Promise.all(
        tables.map(async (t) => ({
          table: t,
          dataUrl: await QRCode.toDataURL(tableUrl(base, t), {
            width: 600, margin: 2, color: { dark: '#4a3728' },
          }),
        }))
      );
      const w = window.open('', '_blank');
      if (!w) {
        setError('Your browser blocked the print window. Allow pop-ups for this site and try again.');
        return;
      }
      w.document.open();
      w.document.write(buildPrintHtml(cards));
      w.document.close();
      // Drive printing from the opener. The print window is an about:blank
      // document that inherits this app's CSP (script-src 'self'), so an inline
      // onload/script inside it would be blocked — calling w.print() from here
      // isn't. Small delay lets the data-URL images lay out before the dialog.
      w.focus();
      const doPrint = () => { try { w.print(); } catch { /* user closed it */ } };
      if (w.document.readyState === 'complete') setTimeout(doPrint, 300);
      else w.addEventListener('load', () => setTimeout(doPrint, 150));
    } catch (e) {
      setError(e.message || 'Could not prepare the QR codes for printing.');
    } finally {
      setPrinting(false);
    }
  };

  if (error && !info) return <p className="text-red-500 font-bold">{error}</p>;
  if (!info) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-espresso" size={40} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <div>
          <h2 className="text-3xl font-black text-bean tracking-tight">Table QR Codes</h2>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Codes point to <span className="font-mono font-bold break-all">{base || '—'}</span>
          </p>
        </div>
        <button
          onClick={printAll}
          disabled={printing || !tables.length}
          className="bg-espresso text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 disabled:opacity-50"
        >
          {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
          Print All
        </button>
      </div>

      {baseIsLocal && (
        <div className="flex items-start gap-2 mb-5 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>
            These codes currently point to <span className="font-mono">localhost</span>, which a customer's phone
            can't reach. Open this dashboard using the café's public web address (or the shop's LAN IP like{' '}
            <span className="font-mono">{info.baseUrl}</span>) and the codes will update automatically before you print.
          </span>
        </div>
      )}

      {error && <p className="text-red-500 text-sm font-bold mb-4">{error}</p>}

      <div className="grid grid-cols-3 md:grid-cols-3 gap-3">
        {tables.map((t) => (
          <TableQr key={t} table={t} url={tableUrl(base, t)} />
        ))}
      </div>
    </div>
  );
}

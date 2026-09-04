import React, { useEffect, useState } from 'react';
import { Loader2, Printer, Sunset } from 'lucide-react';
import { analytics } from '../../api/client';
import { formatRs } from '../../utils/format';
import { CAFE_NAME } from '../../utils/brand';

const METHOD_LABELS = {
  cash: 'Cash', esewa: 'eSewa', khalti: 'Khalti', fonepay: 'Fonepay', card: 'Card', credit: 'Udhaaro',
};

function Row({ label, value, accent = '' }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm font-bold text-gray-500">{label}</span>
      <span className={`font-black ${accent || 'text-bean'}`}>{value}</span>
    </div>
  );
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function buildPrintHtml(report, day) {
  const cashInDrawer = report.collectedByMethod.cash || 0;
  const digital = report.collected - cashInDrawer - (report.collectedByMethod.credit || 0);
  const paymentRows = Object.entries(report.collectedByMethod)
    .map(([method, value]) => `<tr><th>${escapeHtml(METHOD_LABELS[method] || method)}</th><td>${escapeHtml(formatRs(value))}</td></tr>`)
    .join('');
  const topItems = report.topItems.length
    ? report.topItems.map((item, index) => `<tr><th>${index + 1}. ${escapeHtml(item.name)}</th><td>${item.qty} sold / ${escapeHtml(formatRs(item.revenue))}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">No item sales recorded</td></tr>';
  const adjustments = [
    report.discounts > 0 ? `<tr><th>Discounts given</th><td>- ${escapeHtml(formatRs(report.discounts))}</td></tr>` : '',
    report.extraCharges > 0 ? `<tr><th>Extra charges</th><td>+ ${escapeHtml(formatRs(report.extraCharges))}</td></tr>` : '',
  ].join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Day Report - ${escapeHtml(day)}</title>
<style>
* { box-sizing: border-box; }
@page { size: A4 portrait; margin: 16mm 18mm; }
body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
.report { max-width: 174mm; margin: 0 auto; }
header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 21px; margin: 0 0 4px; }
.subtitle { font-size: 11px; margin: 0; }
.meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 10px; }
section { margin-top: 15px; }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #777; padding-bottom: 4px; margin: 0 0 3px; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid #d0d0d0; padding: 5px 2px; text-align: left; font-weight: normal; }
th { width: 70%; }
td { text-align: right; white-space: nowrap; }
.total th, .total td { border-top: 1px solid #111; border-bottom: 2px solid #111; font-weight: 700; padding-top: 7px; }
.muted { color: #555; text-align: left; }
.notice { border: 1px solid #555; padding: 8px; margin-top: 15px; font-weight: 700; }
.signatures { display: flex; gap: 28mm; margin-top: 35mm; }
.signature { flex: 1; border-top: 1px solid #111; padding-top: 5px; }
footer { border-top: 1px solid #777; margin-top: 20px; padding-top: 6px; color: #444; font-size: 9px; display: flex; justify-content: space-between; }
</style></head><body><main class="report">
<header><h1>${escapeHtml(CAFE_NAME)}</h1><p class="subtitle">Daily Sales and Cash Reconciliation Report</p><div class="meta"><span>Report date: <strong>${escapeHtml(day)}</strong></span><span>Currency: NPR (Rs.)</span></div></header>
<section><h2>Sales Summary</h2><table>
<tr><th>Orders completed</th><td>${report.orderCount}</td></tr>
<tr><th>Takeaway orders</th><td>${report.takeawayCount}</td></tr>
<tr><th>Cancelled orders</th><td>${report.cancelledCount}</td></tr>
<tr class="total"><th>Sales value</th><td>${escapeHtml(formatRs(report.revenue))}</td></tr>
</table></section>
<section><h2>Money Collected</h2><table>${paymentRows}${adjustments}
<tr class="total"><th>Total collected</th><td>${escapeHtml(formatRs(report.collected))}</td></tr>
<tr><th>Cash in drawer</th><td>${escapeHtml(formatRs(cashInDrawer))}</td></tr>
<tr><th>Digital payments</th><td>${escapeHtml(formatRs(digital))}</td></tr>
</table></section>
<section><h2>Credit (Udhaaro)</h2><table>
<tr><th>Credit given today</th><td>${escapeHtml(formatRs(report.creditGiven))}</td></tr>
<tr><th>Credit repaid today</th><td>${escapeHtml(formatRs(report.creditRepaid))}</td></tr>
<tr class="total"><th>Total outstanding credit</th><td>${escapeHtml(formatRs(report.creditOutstanding))}</td></tr>
</table></section>
<section><h2>Top Sellers</h2><table>${topItems}</table></section>
${report.unpaidTotal > 0 ? `<div class="notice">Unpaid open tabs: ${escapeHtml(formatRs(report.unpaidTotal))}. These tabs remain unsettled at closing.</div>` : ''}
<div class="signatures"><div class="signature">Prepared by</div><div class="signature">Verified by</div></div>
<footer><span>${escapeHtml(CAFE_NAME)} - Daily closing record</span><span>Generated ${escapeHtml(new Date().toLocaleString())}</span></footer>
</main></body></html>`;
}

// End-of-day closing report: what the owner reconciles the cash drawer
// against every night. Defaults to today; printable.
export default function DayReportTab() {
  const [day, setDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [report, setReport] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    setReport(null);
    const from = new Date(`${day}T00:00:00`);
    const to = new Date(from.getTime() + 864e5);
    analytics
      .dayReport(from.toISOString(), to.toISOString())
      .then(setReport)
      .catch(() => setReport({ error: true }));
  }, [day]);

  const printReport = () => {
    if (printing) return;
    setPrinting(true);
    setPrintError('');
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) throw new Error('Your browser blocked the print window. Allow pop-ups for this site and try again.');
      printWindow.document.open();
      printWindow.document.write(buildPrintHtml(report, day));
      printWindow.document.close();
      printWindow.focus();
      const doPrint = () => { try { printWindow.print(); } catch { /* user closed it */ } };
      if (printWindow.document.readyState === 'complete') setTimeout(doPrint, 150);
      else printWindow.addEventListener('load', () => setTimeout(doPrint, 150));
    } catch (error) {
      setPrintError(error.message || 'Could not prepare the report for printing.');
    } finally {
      setPrinting(false);
    }
  };

  if (!report) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-espresso" size={40} />
      </div>
    );
  }
  if (report.error) return <p className="text-red-500 font-bold">Failed to load the report.</p>;

  const cashInDrawer = report.collectedByMethod.cash || 0;
  const digital = report.collected - cashInDrawer - (report.collectedByMethod.credit || 0);

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3 print:hidden">
        <h2 className="text-3xl font-black text-bean tracking-tight flex items-center gap-3">
          <Sunset className="text-chiya" /> Day Report
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="bg-white p-2.5 rounded-xl shadow-sm text-sm font-bold outline-none border border-gray-100"
          />
          <button
            onClick={printReport}
            className="flex items-center gap-2 bg-espresso text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-bean transition-colors"
          >
            <Printer size={16} /> {printing ? 'Preparing...' : 'Print'}
          </button>
        </div>
      </div>
      {printError && <p className="text-red-500 font-bold text-sm mb-4">{printError}</p>}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6">
        <div className="text-center border-b border-dashed border-gray-200 pb-4">
          <h3 className="font-black text-xl text-bean">{CAFE_NAME} — {day}</h3>
          <p className="text-xs text-gray-400 font-bold">End of day closing report</p>
        </div>

        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sales</p>
          <Row label="Orders completed" value={report.orderCount} />
          <Row label="— of which takeaway" value={report.takeawayCount} />
          <Row label="Cancelled" value={report.cancelledCount} accent="text-red-400" />
          <Row label="Sales value" value={formatRs(report.revenue)} />
        </div>

        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Money collected</p>
          {Object.entries(report.collectedByMethod).map(([m, v]) => (
            <Row key={m} label={METHOD_LABELS[m] || m} value={formatRs(v)} />
          ))}
          {report.discounts > 0 && <Row label="Discounts given" value={`− ${formatRs(report.discounts)}`} accent="text-green-600" />}
          {report.extraCharges > 0 && <Row label="Extra charges" value={`+ ${formatRs(report.extraCharges)}`} />}
          <div className="mt-2 bg-cream rounded-2xl px-5 py-4 flex justify-between items-center">
            <span className="font-black text-bean uppercase text-xs tracking-widest">Cash in drawer</span>
            <span className="text-2xl font-black text-chiya">{formatRs(cashInDrawer)}</span>
          </div>
          <p className="text-[11px] text-gray-400 font-bold mt-2 text-right">Digital: {formatRs(digital)}</p>
        </div>

        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Udhaaro (credit)</p>
          <Row label="Given today" value={formatRs(report.creditGiven)} accent="text-amber-600" />
          <Row label="Repaid today" value={formatRs(report.creditRepaid)} accent="text-green-600" />
          <Row label="Total outstanding" value={formatRs(report.creditOutstanding)} accent="text-amber-600" />
        </div>

        {report.unpaidTotal > 0 && (
          <p className="bg-red-50 text-red-600 rounded-2xl px-5 py-4 text-sm font-black">
            ⚠ {formatRs(report.unpaidTotal)} in unpaid tabs is still open — settle every table before closing.
          </p>
        )}

        {report.topItems.length > 0 && (
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Top sellers today</p>
            {report.topItems.map((t, i) => (
              <Row key={t.name} label={`${i + 1}. ${t.name}`} value={`${t.qty} sold · ${formatRs(t.revenue)}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

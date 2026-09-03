import React, { useEffect, useState } from 'react';
import { Loader2, Printer, Sunset } from 'lucide-react';
import { analytics } from '../../api/client';
import { formatRs } from '../../utils/format';

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

// End-of-day closing report: what the owner reconciles the cash drawer
// against every night. Defaults to today; printable.
export default function DayReportTab() {
  const [day, setDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [report, setReport] = useState(null);

  useEffect(() => {
    setReport(null);
    const from = new Date(`${day}T00:00:00`);
    const to = new Date(from.getTime() + 864e5);
    analytics
      .dayReport(from.toISOString(), to.toISOString())
      .then(setReport)
      .catch(() => setReport({ error: true }));
  }, [day]);

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
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-espresso text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-bean transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-6">
        <div className="text-center border-b border-dashed border-gray-200 pb-4">
          <h3 className="font-black text-xl text-bean">Folsom Cafe & Resturent — {day}</h3>
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

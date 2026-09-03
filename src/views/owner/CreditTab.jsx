import React, { useEffect, useState, useCallback } from 'react';
import { NotebookPen, Loader2, ChevronDown, ChevronUp, HandCoins, X } from 'lucide-react';
import { fetchCreditLedger, fetchCreditHistory, repayCredit } from '../../api/client';
import { formatRs, formatDateTime } from '../../utils/format';

const METHODS = ['cash', 'esewa', 'khalti', 'fonepay', 'card'];

// Udhaaro (credit) ledger: outstanding balance per customer, drill-down
// history, and repayment entry.
export default function CreditTab() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null); // phone of expanded customer
  const [history, setHistory] = useState({}); // phone -> entries
  const [repay, setRepay] = useState(null); // customer being repaid
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    fetchCreditLedger().then(setData).catch(() => setData({ error: true }));
  }, []);

  useEffect(refresh, [refresh]);

  const toggleOpen = (phone) => {
    setOpen((cur) => (cur === phone ? null : phone));
    if (!history[phone]) {
      fetchCreditHistory(phone)
        .then((h) => setHistory((p) => ({ ...p, [phone]: h })))
        .catch(() => {});
    }
  };

  const submitRepay = async () => {
    const amt = Math.round(Number(amount));
    if (!repay || busy || !amt || amt <= 0) return;
    setBusy(true);
    setError('');
    try {
      await repayCredit({ phone: repay.phone, name: repay.name, amount: amt, method, note: '' });
      setRepay(null);
      setAmount('');
      setHistory({});
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-espresso" size={40} />
      </div>
    );
  }
  if (data.error) return <p className="text-red-500 font-bold">Failed to load the ledger.</p>;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
        <h2 className="text-3xl font-black text-bean tracking-tight flex items-center gap-3">
          <NotebookPen className="text-chiya" /> Udhaaro Ledger
        </h2>
        <div className="bg-white rounded-2xl px-6 py-3 shadow-sm border border-gray-100">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Outstanding</p>
          <p className="text-2xl font-black text-amber-600">{formatRs(data.totalOutstanding)}</p>
        </div>
      </div>

      {!data.customers.length ? (
        <div className="text-center text-gray-400 py-20 bg-white rounded-3xl border border-gray-100">
          <NotebookPen size={48} className="mx-auto mb-4" />
          <p className="font-bold">No credit outstanding — sabai le tireko chha 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.customers.map((c) => (
            <div key={c.phone} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => toggleOpen(c.phone)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-black text-bean">{c.name}</p>
                  <p className="text-xs text-gray-400 font-bold">{c.phone} · last {formatDateTime(c.lastAt)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <p className={`text-xl font-black ${c.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {formatRs(c.balance)}
                  </p>
                  {open === c.phone ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {open === c.phone && (
                <div className="border-t border-gray-100 px-5 py-4 bg-slate-50">
                  <button
                    onClick={() => { setRepay(c); setAmount(String(Math.max(0, c.balance))); setError(''); }}
                    className="mb-3 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-black text-sm transition-colors active:scale-95"
                  >
                    <HandCoins size={16} /> Record repayment
                  </button>
                  {!history[c.phone] ? (
                    <Loader2 className="animate-spin text-espresso mx-auto" size={20} />
                  ) : (
                    <div className="space-y-1.5">
                      {history[c.phone].map((e) => (
                        <div key={e.id} className="flex justify-between items-center text-sm bg-white rounded-xl px-4 py-2.5">
                          <div>
                            <span className={`font-black ${e.amount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {e.amount > 0 ? 'Credit taken' : `Repaid (${e.method})`}
                            </span>
                            <span className="text-gray-400 font-bold text-xs ml-2">
                              {formatDateTime(e.createdAt)}{e.takenBy ? ` · ${e.takenBy}` : ''}
                            </span>
                          </div>
                          <span className="font-black">{formatRs(Math.abs(e.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {repay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setRepay(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-bean">Repayment — {repay.name}</h3>
              <button onClick={() => setRepay(null)} className="p-2 bg-gray-100 rounded-full"><X size={14} /></button>
            </div>
            <p className="text-xs text-gray-400 font-bold mb-3">Owes {formatRs(repay.balance)}</p>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount Rs."
              className="w-full p-3 rounded-xl border-2 border-gray-200 font-bold outline-none focus:border-chiya mb-3"
            />
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-2 rounded-lg font-bold text-[10px] uppercase ${method === m ? 'bg-espresso text-white' : 'border-2 border-gray-100 text-gray-500'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            {error && <p className="text-red-500 text-xs font-bold text-center mb-3">{error}</p>}
            <button
              onClick={submitRepay}
              disabled={busy || !Number(amount)}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-black disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Record {formatRs(Number(amount) || 0)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

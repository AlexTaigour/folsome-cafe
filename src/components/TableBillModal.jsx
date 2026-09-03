import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Printer, Loader2, CheckCircle2, AlertTriangle, Banknote, Smartphone, CreditCard, Receipt,
  CheckSquare, Square, Percent, NotebookPen,
} from 'lucide-react';
import { fetchTableBill, settleTable } from '../api/client';
import { printTableBill } from '../utils/printBill';
import StatusBadge from './StatusBadge';

const METHODS = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'esewa', label: 'eSewa', icon: Smartphone },
  { key: 'khalti', label: 'Khalti', icon: Smartphone },
  { key: 'fonepay', label: 'Fonepay', icon: Smartphone },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'credit', label: 'Udhaaro', icon: NotebookPen },
];

// Combined bill for one table's tab. Default: settle everything in one
// payment. Staff can untick orders to split the bill (separate parties
// sharing a table) — only ticked orders are settled; the rest stay unpaid.
// Discount (% or Rs.) and extra charge adjust the collected amount; the
// 'Udhaaro' method books the bill as customer credit instead of cash.
export default function TableBillModal({ tableNo, onClose, onSettled }) {
  const [bill, setBill] = useState(null);
  const [selected, setSelected] = useState(null); // Set of order ids to settle
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // { payment, paidOrders, remaining } after settle
  const [showAdjust, setShowAdjust] = useState(false);
  const [discountMode, setDiscountMode] = useState('percent'); // percent | flat
  const [discountVal, setDiscountVal] = useState('');
  const [extraCharge, setExtraCharge] = useState('');
  const [creditName, setCreditName] = useState('');
  const [creditPhone, setCreditPhone] = useState('');

  useEffect(() => {
    fetchTableBill(tableNo)
      .then((b) => {
        setBill(b);
        setSelected(new Set(b.orders.map((o) => o.id))); // everything ticked by default
        // credit default: the (single) customer name on the tab
        const names = [...new Set(b.orders.map((o) => o.name))];
        if (names.length === 1) setCreditName(names[0]);
      })
      .catch((err) => setError(err.message));
  }, [tableNo]);

  const isSplit = bill && selected && selected.size < bill.orders.length;
  const selectedOrders = bill?.orders.filter((o) => selected?.has(o.id)) ?? [];
  const subtotal = selectedOrders.reduce((s, o) => s + o.total, 0);
  const unserved = selectedOrders.filter((o) => o.status !== 'served').length;

  const discountNum = Math.max(0, Number(discountVal) || 0);
  const discountAmt =
    discountMode === 'percent'
      ? Math.round((subtotal * Math.min(discountNum, 100)) / 100)
      : Math.min(discountNum, subtotal);
  const extraNum = Math.max(0, Math.round(Number(extraCharge) || 0));
  const grandTotal = subtotal - discountAmt + extraNum;
  const hasAdjustments = discountAmt > 0 || extraNum > 0;

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError('');
  };

  const settle = async () => {
    if (busy || !selectedOrders.length) return;
    if (method === 'credit' && (!creditName.trim() || creditPhone.trim().length < 4)) {
      setError('Udhaaro needs the customer name and phone number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const opts = {};
      if (isSplit) opts.orderIds = [...selected];
      if (discountAmt > 0) {
        if (discountMode === 'percent') opts.discountPercent = Math.min(discountNum, 100);
        else opts.discount = discountAmt;
      }
      if (extraNum > 0) opts.extraCharge = extraNum;
      if (method === 'credit') {
        opts.creditCustomer = { name: creditName.trim(), phone: creditPhone.trim() };
      }
      const { payment } = await settleTable(tableNo, method, opts);
      setDone({
        payment,
        paidOrders: selectedOrders,
        remaining: bill.orders.length - selectedOrders.length,
      });
      onSettled?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-black text-bean flex items-center gap-3">
            <span className="bg-cream w-12 h-12 rounded-2xl flex flex-col items-center justify-center border-2 border-chiya/20">
              <span className="text-[9px] uppercase font-black text-chiya leading-none">Table</span>
              <span className="text-lg font-black text-espresso leading-tight">{tableNo}</span>
            </span>
            Table Bill
          </h3>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <X size={16} />
          </button>
        </div>

        {!bill && !error && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-espresso" size={32} />
          </div>
        )}

        {bill && !bill.orders.length && (
          <div className="text-center py-12 text-gray-400">
            <Receipt size={40} className="mx-auto mb-3" />
            <p className="font-bold">No unpaid orders on this table</p>
          </div>
        )}

        {bill && bill.orders.length > 0 && (
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-8 text-center"
              >
                <CheckCircle2 size={56} className={`mx-auto mb-4 ${done.payment.method === 'credit' ? 'text-amber-500' : 'text-green-500'}`} />
                <p className="text-xl font-black text-bean">
                  {done.payment.method === 'credit'
                    ? `Rs. ${done.payment.total} booked as udhaaro`
                    : `Rs. ${done.payment.total} collected`}
                </p>
                <p className="text-sm text-gray-400 font-bold mt-1">
                  {METHODS.find((m) => m.key === done.payment.method)?.label} ·{' '}
                  {done.remaining > 0
                    ? `${done.remaining} ${done.remaining === 1 ? 'order' : 'orders'} still unpaid on table ${tableNo}`
                    : `Table ${tableNo} is now free`}
                </p>
                <div className="flex justify-center gap-3 mt-6">
                  <button
                    onClick={() =>
                      printTableBill(
                        { tableNo, orders: done.paidOrders, total: done.payment.total },
                        done.payment
                      )
                    }
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl font-bold flex items-center gap-2 transition-colors"
                  >
                    <Printer size={18} /> Print receipt
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-espresso hover:bg-bean text-white rounded-2xl font-black transition-colors"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="bill" exit={{ opacity: 0 }}>
                {bill.orders.length > 1 && (
                  <p className="text-xs text-gray-400 font-bold mb-2">
                    Tap an order to include / exclude it — untick to split the bill.
                  </p>
                )}
                {/* per-order breakdown — tap to toggle inclusion */}
                <div className="space-y-3 mb-4">
                  {bill.orders.map((o) => {
                    const included = selected?.has(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => bill.orders.length > 1 && toggle(o.id)}
                        className={`w-full text-left rounded-2xl p-4 transition-all ${
                          included
                            ? 'bg-slate-50'
                            : 'bg-white border-2 border-dashed border-gray-200 opacity-50'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-xs font-black text-gray-400 flex items-center gap-2">
                            {bill.orders.length > 1 &&
                              (included ? (
                                <CheckSquare size={16} className="text-green-600 shrink-0" />
                              ) : (
                                <Square size={16} className="text-gray-300 shrink-0" />
                              ))}
                            {o.publicCode} · {o.name}
                          </p>
                          <StatusBadge status={o.status} />
                        </div>
                        {o.items.map((it) => (
                          <div key={it.id} className="flex justify-between text-sm py-0.5">
                            <span className="font-bold text-bean">{it.qty}× {it.name}</span>
                            <span className="text-gray-500 font-medium">Rs. {it.qty * it.price}</span>
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </div>

                {/* totals + adjustments */}
                <div className="bg-cream rounded-2xl px-5 py-4 mb-4 space-y-1">
                  {hasAdjustments && (
                    <>
                      <div className="flex justify-between text-sm font-bold text-bean/70">
                        <span>Subtotal{isSplit ? ` · ${selectedOrders.length} of ${bill.orders.length} orders` : ''}</span>
                        <span>Rs. {subtotal}</span>
                      </div>
                      {discountAmt > 0 && (
                        <div className="flex justify-between text-sm font-bold text-green-700">
                          <span>Discount{discountMode === 'percent' ? ` (${Math.min(discountNum, 100)}%)` : ''}</span>
                          <span>− Rs. {discountAmt}</span>
                        </div>
                      )}
                      {extraNum > 0 && (
                        <div className="flex justify-between text-sm font-bold text-bean/70">
                          <span>Extra charge</span>
                          <span>+ Rs. {extraNum}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-black text-bean uppercase text-xs tracking-widest">
                      {hasAdjustments ? 'To pay' : isSplit ? `Split · ${selectedOrders.length} of ${bill.orders.length} orders` : 'Grand total'}
                    </span>
                    <span className="text-3xl font-black text-chiya">Rs. {grandTotal}</span>
                  </div>
                </div>

                {/* discount / extra charge */}
                {showAdjust ? (
                  <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-xl overflow-hidden border-2 border-gray-200">
                        <button
                          onClick={() => setDiscountMode('percent')}
                          className={`px-3 py-2 text-xs font-black ${discountMode === 'percent' ? 'bg-espresso text-white' : 'bg-white text-gray-500'}`}
                        >
                          %
                        </button>
                        <button
                          onClick={() => setDiscountMode('flat')}
                          className={`px-3 py-2 text-xs font-black ${discountMode === 'flat' ? 'bg-espresso text-white' : 'bg-white text-gray-500'}`}
                        >
                          Rs.
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={discountMode === 'percent' ? 100 : subtotal}
                        placeholder={discountMode === 'percent' ? 'Discount %' : 'Discount Rs.'}
                        value={discountVal}
                        onChange={(e) => setDiscountVal(e.target.value)}
                        className="flex-1 p-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold outline-none focus:border-chiya"
                      />
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="Extra charge Rs. (service, delivery…)"
                      value={extraCharge}
                      onChange={(e) => setExtraCharge(e.target.value)}
                      className="w-full p-2.5 rounded-xl border-2 border-gray-200 text-sm font-bold outline-none focus:border-chiya"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAdjust(true)}
                    className="flex items-center gap-1.5 text-xs font-black text-gray-400 hover:text-espresso mb-4 transition-colors"
                  >
                    <Percent size={13} /> Add discount / extra charge
                  </button>
                )}

                {unserved > 0 && (
                  <p className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-xl px-4 py-3 text-xs font-bold mb-4">
                    <AlertTriangle size={16} className="shrink-0" />
                    {unserved} selected {unserved === 1 ? 'order is' : 'orders are'} not served yet —
                    settling pays for {isSplit ? 'the selected orders' : 'everything on this table'}.
                  </p>
                )}

                <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-2">
                  Payment method
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                  {METHODS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMethod(m.key)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl font-bold text-[11px] transition-all active:scale-95 ${
                        method === m.key
                          ? m.key === 'credit'
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'bg-espresso text-white shadow-md'
                          : 'border-2 border-gray-100 text-gray-500 hover:border-espresso/40'
                      }`}
                    >
                      <m.icon size={18} />
                      {m.label}
                    </button>
                  ))}
                </div>

                {method === 'credit' && (
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 mb-4 space-y-2">
                    <p className="text-xs font-black text-amber-700">
                      📒 Udhaaro — this bill goes on the customer's credit ledger
                    </p>
                    <input
                      placeholder="Customer name"
                      maxLength={80}
                      value={creditName}
                      onChange={(e) => setCreditName(e.target.value)}
                      className="w-full p-2.5 rounded-xl border-2 border-amber-200 bg-white text-sm font-bold outline-none focus:border-amber-500"
                    />
                    <input
                      type="tel"
                      placeholder="Phone (identifies the ledger)"
                      maxLength={20}
                      value={creditPhone}
                      onChange={(e) => setCreditPhone(e.target.value)}
                      className="w-full p-2.5 rounded-xl border-2 border-amber-200 bg-white text-sm font-bold outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {error && <p className="text-red-500 text-sm font-bold text-center mb-3">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() =>
                      printTableBill({ tableNo, orders: selectedOrders, total: grandTotal })
                    }
                    disabled={!selectedOrders.length}
                    className="p-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors disabled:opacity-40"
                    title="Print bill (before payment)"
                  >
                    <Printer size={20} />
                  </button>
                  <button
                    onClick={settle}
                    disabled={busy || !selectedOrders.length}
                    className={`flex-1 text-white py-4 rounded-2xl font-black text-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2 active:scale-[0.98] ${
                      method === 'credit' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {busy && <Loader2 size={18} className="animate-spin" />}
                    {busy
                      ? 'Settling…'
                      : !selectedOrders.length
                        ? 'Select at least one order'
                        : method === 'credit'
                          ? `Book Rs. ${grandTotal} as Udhaaro`
                          : `Take Rs. ${grandTotal} · Settle${isSplit ? ' selected' : ''}`}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {error && !bill && <p className="text-red-500 font-bold text-center py-8">{error}</p>}
      </motion.div>
    </div>
  );
}

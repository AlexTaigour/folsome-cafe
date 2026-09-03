import React, { useState } from 'react';
import { Clock, Printer } from 'lucide-react';
import StatusBadge, { STATUS_META, ACTIONS } from './StatusBadge';
import { formatDateTime } from '../utils/format';
import { printBill } from '../utils/printBill';
import { setOrderStatus } from '../api/client';
import { toast } from './Toast';

// Shared order card for staff + owner views. Kitchen has its own compact KDS card.
export default function OrderCard({ order, role, onStatusLocal }) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[order.status] || STATUS_META.pending;
  const actions = ACTIONS[role]?.[order.status] || [];

  const doAction = async (to) => {
    if (busy) return;
    setBusy(true);
    // Optimistic: the card updates instantly; the save happens in the
    // background and the socket push re-confirms (idempotent re-apply).
    const undo = onStatusLocal?.(order.id, to);
    try {
      await setOrderStatus(order.id, to);
    } catch (err) {
      undo?.(); // conditional — a concurrent user's pushed status wins
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-white rounded-[2rem] shadow-sm border-2 overflow-hidden transition-all duration-500 ${meta.ring}`}>
      <div className="p-6">
        <div className="flex justify-between items-start mb-5">
          <div>
            <StatusBadge status={order.status} />
            <h3 className="text-2xl font-black text-bean mt-2">{order.name}</h3>
            <p className="text-xs text-gray-400 font-bold mt-1 flex items-center gap-1">
              <Clock size={12} /> {formatDateTime(order.createdAt)} · {order.publicCode}
              {order.source === 'staff' && <span className="ml-1 text-chiya">· staff</span>}
            </p>
          </div>
          <div className="bg-cream w-16 h-16 rounded-[1.5rem] flex flex-col items-center justify-center border-2 border-chiya/20 shrink-0">
            {order.orderType === 'takeaway' ? (
              <>
                <p className="text-[10px] uppercase font-black text-chiya">🥡 Token</p>
                <p className="text-2xl font-black text-espresso">#{order.queueNo ?? '–'}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase font-black text-chiya">Table</p>
                <p className="text-2xl font-black text-espresso">{order.table}</p>
              </>
            )}
          </div>
        </div>

        {order.note && (
          <div className="bg-slate-100 p-3 rounded-2xl mb-4">
            <p className="text-xs font-bold text-gray-500">Note:</p>
            <p className="text-sm break-words">{order.note}</p>
          </div>
        )}

        <div className="space-y-2 mb-5 bg-slate-50 p-4 rounded-2xl">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between items-center text-sm">
              <span className="font-bold text-bean">{item.qty}× {item.name}</span>
              <span className="font-medium text-gray-500">Rs. {item.price * item.qty}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total</p>
            <p className="text-2xl font-black text-chiya">Rs. {order.total}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => printBill(order)}
              className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200"
              title="Print bill"
            >
              <Printer size={20} />
            </button>
            {actions.map((a) => (
              <button
                key={a.to}
                onClick={() => doAction(a.to)}
                disabled={busy}
                className={`${a.style} text-white px-4 py-2 rounded-2xl font-black text-xs disabled:opacity-50`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

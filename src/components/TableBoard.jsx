import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Armchair } from 'lucide-react';
import { fetchTableBoard } from '../api/client';
import { getSocket } from '../api/socket';
import { minutesSince } from '../utils/format';
import TableBillModal from './TableBillModal';

const STATE_STYLES = {
  free: {
    card: 'bg-white border-gray-100 hover:border-green-300',
    chip: 'bg-green-100 text-green-700',
    label: 'Free',
  },
  dining: {
    card: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    chip: 'bg-amber-500 text-white',
    label: 'Dining',
  },
  awaiting: {
    card: 'bg-purple-50 border-purple-200 hover:border-purple-400 ring-4 ring-purple-500/10',
    chip: 'bg-purple-600 text-white animate-pulse',
    label: 'To pay',
  },
  // awaiting for too long — bill forgotten or party about to walk out
  overdue: {
    card: 'bg-red-50 border-red-400 hover:border-red-500 ring-4 ring-red-500/20',
    chip: 'bg-red-600 text-white animate-pulse',
    label: 'Unpaid!',
  },
};

const OVERDUE_MINUTES = 15;

// Live floor overview: one tile per table, click an occupied one to see the
// combined bill and take payment. Board state is server-derived, so events
// still trigger a refetch — but only events that can change the board
// (order:new, served/cancelled, settle), debounced to coalesce bursts.
export default function TableBoard() {
  const [board, setBoard] = useState(null);
  const [billTable, setBillTable] = useState(null);
  const [, forceTick] = useState(0); // re-evaluate overdue timers every 30s
  const debounceRef = useRef(null);

  const refresh = useCallback(() => {
    fetchTableBoard().then(setBoard).catch(() => {});
  }, []);

  // Trailing debounce: a settle burst (settled + status events together)
  // triggers a single fetch.
  const refreshSoon = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 300);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const socket = getSocket();
    // accepted/preparing/cooked don't change table state or totals — skip them
    const onStatus = ({ status }) => {
      if (status === 'served' || status === 'cancelled') refreshSoon();
    };
    socket.on('order:new', refreshSoon);
    socket.on('order:status', onStatus);
    socket.on('orders:settled', refreshSoon);
    socket.io.on('reconnect', refresh);
    const tick = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => {
      socket.off('order:new', refreshSoon);
      socket.off('order:status', onStatus);
      socket.off('orders:settled', refreshSoon);
      socket.io.off('reconnect', refresh);
      clearInterval(tick);
      clearTimeout(debounceRef.current);
    };
  }, [refresh, refreshSoon]);

  if (!board) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-espresso" size={40} />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {board.map((t) => {
          // escalate "awaiting" tables whose last order was served >15m ago
          const overdue =
            t.state === 'awaiting' &&
            t.tableNo !== 'TA' &&
            minutesSince(t.allServedSince || t.oldestAt) >= OVERDUE_MINUTES;
          const state = overdue ? 'overdue' : t.state;
          const s = STATE_STYLES[state];
          const occupied = t.state !== 'free';
          const isTakeaway = t.tableNo === 'TA';
          return (
            <button
              key={t.tableNo}
              onClick={() => occupied && setBillTable(t.tableNo)}
              disabled={!occupied}
              className={`text-left rounded-3xl border-2 p-5 transition-all ${s.card} ${
                occupied ? 'cursor-pointer active:scale-[0.97] shadow-sm hover:shadow-md' : 'opacity-80'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Armchair size={20} className={occupied ? 'text-espresso' : 'text-gray-300'} />
                  <span className="text-2xl font-black text-bean">{isTakeaway ? '🥡' : `T${t.tableNo}`}</span>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${s.chip}`}>
                  {isTakeaway ? 'Takeaway' : s.label}
                </span>
              </div>
              {occupied ? (
                <>
                  <p className="text-2xl font-black text-chiya">Rs. {t.total}</p>
                  <p className="text-xs text-gray-400 font-bold mt-1">
                    {t.orderCount} {t.orderCount === 1 ? 'order' : 'orders'} · {minutesSince(t.oldestAt)}m
                  </p>
                  {state === 'overdue' ? (
                    <p className="text-xs font-black text-red-600 mt-2">
                      ⚠ Unpaid for {minutesSince(t.allServedSince || t.oldestAt)}m — take payment!
                    </p>
                  ) : t.state === 'awaiting' ? (
                    <p className="text-xs font-black text-purple-600 mt-2">Tap to take payment →</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-gray-300 font-bold">Available</p>
              )}
            </button>
          );
        })}
      </div>

      {billTable && (
        <TableBillModal tableNo={billTable} onClose={() => setBillTable(null)} />
      )}
    </>
  );
}

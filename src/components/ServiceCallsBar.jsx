import React, { useEffect, useState, useCallback } from 'react';
import { ConciergeBell, ReceiptText, Check } from 'lucide-react';
import { fetchOpenCalls, resolveServiceCall } from '../api/client';
import { getSocket } from '../api/socket';
import { useSound } from '../hooks/useSound';
import { minutesSince } from '../utils/format';

// Live strip of open customer calls (waiter / bill) above the staff counter.
// Chimes on new calls; one tap resolves.
export default function ServiceCallsBar() {
  const [calls, setCalls] = useState([]);
  const { chime } = useSound();

  const refresh = useCallback(() => {
    fetchOpenCalls().then(setCalls).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const socket = getSocket();
    const onNew = (call) => {
      setCalls((prev) => (prev.some((c) => c.id === call.id) ? prev : [...prev, call]));
      chime();
    };
    const onResolved = ({ id }) => setCalls((prev) => prev.filter((c) => c.id !== id));
    socket.on('call:new', onNew);
    socket.on('call:resolved', onResolved);
    socket.io.on('reconnect', refresh);
    return () => {
      socket.off('call:new', onNew);
      socket.off('call:resolved', onResolved);
      socket.io.off('reconnect', refresh);
    };
  }, [refresh, chime]);

  if (!calls.length) return null;

  return (
    <div className="mb-6 space-y-2">
      {calls.map((c) => (
        <div
          key={c.id}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 border-2 shadow-sm animate-pulse-slow ${
            c.kind === 'bill'
              ? 'bg-purple-50 border-purple-300 text-purple-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}
        >
          {c.kind === 'bill' ? <ReceiptText size={20} /> : <ConciergeBell size={20} />}
          <p className="flex-1 font-black text-sm">
            Table {c.table} {c.kind === 'bill' ? 'is asking for the bill' : 'is calling a waiter'}
            <span className="font-bold text-xs opacity-60 ml-2">{minutesSince(c.createdAt)}m ago</span>
          </p>
          <button
            onClick={() => resolveServiceCall(c.id).catch(() => {})}
            className="flex items-center gap-1.5 bg-white px-4 py-2 rounded-xl font-black text-xs shadow-sm hover:shadow active:scale-95 transition-all"
          >
            <Check size={14} /> On it
          </button>
        </div>
      ))}
    </div>
  );
}

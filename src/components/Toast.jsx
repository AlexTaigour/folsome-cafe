import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

// Minimal module-level pub/sub — call toast('message') from anywhere; the
// single <ToastHost /> mounted in App renders an auto-dismissing stack.
// Used for optimistic-update rollbacks so failures never go unnoticed.
let listener = null;
export function toast(message) {
  listener?.(message);
}

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    listener = (message) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2 bg-red-600 text-white text-sm font-bold px-4 py-3 rounded-2xl shadow-xl max-w-[90vw]"
        >
          <AlertCircle size={16} className="shrink-0" />
          <span className="break-words">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

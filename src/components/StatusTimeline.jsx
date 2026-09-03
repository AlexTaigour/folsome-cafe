import React from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { STATUS_META, TIMELINE_STEPS } from './StatusBadge';
import { formatTime } from '../utils/format';

// Customer-facing vertical stepper. Cancelled renders as a terminal red state.
export default function StatusTimeline({ order }) {
  const cancelled = order.status === 'cancelled';
  const currentIdx = TIMELINE_STEPS.indexOf(order.status);
  const reachedAt = {};
  for (const h of order.history || []) reachedAt[h.toStatus] = h.changedAt;

  return (
    <ol className="space-y-0">
      {TIMELINE_STEPS.map((step, i) => {
        const done = !cancelled && i < currentIdx;
        const active = !cancelled && i === currentIdx;
        const meta = STATUS_META[step];
        return (
          <li key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <motion.div
                initial={false}
                animate={{
                  scale: active ? 1.15 : 1,
                  backgroundColor: done ? '#22c55e' : active ? '#c76b2a' : '#e5e7eb',
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
              >
                {done ? (
                  <Check size={18} />
                ) : (
                  <span className={`font-black text-sm ${active ? '' : 'text-gray-400'}`}>{i + 1}</span>
                )}
              </motion.div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={`w-1 h-8 rounded ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
            <div className="pt-1.5">
              <p className={`font-black ${active ? 'text-chiya' : done ? 'text-bean' : 'text-gray-400'}`}>
                {meta.label}
                {active && (
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="ml-2 inline-block w-2 h-2 rounded-full bg-chiya"
                  />
                )}
              </p>
              {reachedAt[step] && (
                <p className="text-xs text-gray-400 font-bold">{formatTime(reachedAt[step])}</p>
              )}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="flex gap-4 mt-2">
          <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0">
            <X size={18} />
          </div>
          <div className="pt-1.5">
            <p className="font-black text-red-500">Cancelled</p>
            {reachedAt.cancelled && (
              <p className="text-xs text-gray-400 font-bold">{formatTime(reachedAt.cancelled)}</p>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}

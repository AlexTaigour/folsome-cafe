import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Coffee, ArrowLeft, Timer } from 'lucide-react';
import { trackOrder } from '../api/client';
import { getSocket } from '../api/socket';
import StatusTimeline from '../components/StatusTimeline';
import ServiceCallButtons from '../components/ServiceCallButtons';
import BlurText from '../components/reactbits/BlurText';
import BrewingLoader from '../components/BrewingLoader';
import { formatRs } from '../utils/format';

// What the customer actually wants to know at each step.
const STATUS_MESSAGE = {
  pending: { emoji: '🧾', text: 'Waiting for the kitchen to confirm your order…' },
  accepted: { emoji: '👍', text: 'Order confirmed! The kitchen will start soon.' },
  preparing: { emoji: '🍳', text: 'Your chiya is being prepared right now.' },
  cooked: { emoji: '🛎️', text: 'Ready! Our staff is bringing it to your table.' },
  served: { emoji: '☕', text: 'Served — enjoy your chiya!' },
  cancelled: { emoji: '😔', text: 'This order was cancelled. Ask our staff if this seems wrong.' },
};

const TAKEAWAY_MESSAGE = {
  cooked: { emoji: '🛎️', text: 'Ready! Please collect your order at the counter.' },
  served: { emoji: '🥡', text: 'Picked up — see you again!' },
};

export default function OrderTrack() {
  const { publicCode } = useParams();
  const [order, setOrder] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      trackOrder(publicCode)
        .then((o) => live && setOrder(o))
        .catch(() => live && setNotFound(true));
    load();

    const socket = getSocket();
    socket.emit('track', publicCode);
    // refetch on status push — keeps history timestamps in sync too
    const onStatus = (p) => { if (p.publicCode === publicCode) load(); };
    const onConnect = () => { socket.emit('track', publicCode); load(); };
    socket.on('order:status', onStatus);
    socket.on('connect', onConnect);
    // the queue ahead of us moves without our own status changing
    const queueTick = setInterval(load, 60_000);
    return () => {
      live = false;
      socket.off('order:status', onStatus);
      socket.off('connect', onConnect);
      clearInterval(queueTick);
    };
  }, [publicCode]);

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <Coffee size={48} className="text-espresso" />
        <p className="font-black text-espresso">Order not found</p>
        <Link to="/" className="text-chiya font-bold underline">Back to menu</Link>
      </div>
    );
  }
  if (!order) {
    return <BrewingLoader fullscreen tone="light" label="Fetching your order" />;
  }

  const isTakeaway = order.orderType === 'takeaway';
  const message =
    (isTakeaway && TAKEAWAY_MESSAGE[order.status]) || STATUS_MESSAGE[order.status];

  return (
    <div className="min-h-screen max-w-md mx-auto px-4 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-espresso font-bold mb-6">
        <ArrowLeft size={18} /> Menu
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-xl p-8"
      >
        <div className="text-center mb-8">
          <BlurText as="h1" text="Your Order" className="text-3xl font-bold handwritten text-espresso block" />
          <p className="font-mono text-xl mt-2 text-chiya font-bold">{order.publicCode}</p>
          {isTakeaway && order.queueNo != null && (
            <p className="mt-2 inline-block bg-espresso text-cream px-4 py-1.5 rounded-full text-sm font-black">
              🥡 Pickup token #{order.queueNo}
            </p>
          )}
          <p className="text-xs text-gray-400 font-bold mt-1">
            {isTakeaway ? 'Takeaway' : `Table ${order.table}`} · {formatRs(order.total)}
          </p>
        </div>

        {message && (
          <motion.div
            key={order.status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-3 rounded-2xl p-4 mb-6 ${
              order.status === 'cancelled' ? 'bg-red-50 text-red-600' : 'bg-cream text-bean'
            }`}
          >
            <span className="text-2xl">{message.emoji}</span>
            <p className="text-sm font-bold">{message.text}</p>
          </motion.div>
        )}

        {order.queue && (
          <div className="flex items-center gap-3 bg-blue-50 text-blue-700 rounded-2xl p-4 mb-6">
            <Timer size={22} className="shrink-0" />
            <p className="text-sm font-bold">
              {order.queue.ahead === 0
                ? 'You are next in the kitchen'
                : `${order.queue.ahead} ${order.queue.ahead === 1 ? 'order' : 'orders'} ahead of you`}
              {' · '}~{order.queue.estMinutes} min
            </p>
          </div>
        )}

        <StatusTimeline order={order} />

        <div className="mt-8 bg-cream rounded-2xl p-4 space-y-2">
          {order.items.map((it) => (
            <div key={it.id} className="flex justify-between text-sm">
              <span className="font-bold text-bean">{it.qty}× {it.name}</span>
              <span className="text-gray-500 font-medium">{formatRs(it.qty * it.price)}</span>
            </div>
          ))}
          <div className="flex justify-between font-black border-t border-latte/40 pt-2 mt-2">
            <span>Total</span>
            <span>{formatRs(order.total)}</span>
          </div>
        </div>

        {!isTakeaway && order.status !== 'cancelled' && (
          <ServiceCallButtons table={order.table} />
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          This page updates live — keep it open ☕
        </p>
      </motion.div>
    </div>
  );
}

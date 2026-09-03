import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket } from '../api/socket';
import { fetchOrders } from '../api/client';

// Initial REST fetch + socket reduction. onNewOrder fires for order:new
// (sound alerts); reconnect triggers a refetch to cover missed events.
export function useOrdersLive({ onNewOrder } = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const onNewRef = useRef(onNewOrder);
  onNewRef.current = onNewOrder;

  const refetch = useCallback(() => {
    fetchOrders('active')
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Optimistically set an order's status locally so the card moves the
  // instant staff tap it. Returns an undo that only reverts if the optimistic
  // value is still what's shown — a socket push that landed in between (e.g.
  // another user's transition) is the source of truth and wins.
  const applyStatusLocal = useCallback((id, status) => {
    let prev;
    setOrders((os) =>
      os.map((o) => (o.id === id ? ((prev = o.status), { ...o, status }) : o))
    );
    return () =>
      setOrders((os) =>
        os.map((o) => (o.id === id && o.status === status ? { ...o, status: prev } : o))
      );
  }, []);

  useEffect(() => {
    refetch();
    const socket = getSocket();

    const handleNew = (order) => {
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [order, ...prev]));
      onNewRef.current?.(order);
    };
    const handleStatus = ({ id, status }) => {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    };
    // Table settled: its orders are paid and leave the active list.
    const handleSettled = ({ orderIds }) => {
      setOrders((prev) => prev.filter((o) => !orderIds.includes(o.id)));
    };

    socket.on('order:new', handleNew);
    socket.on('order:status', handleStatus);
    socket.on('orders:settled', handleSettled);
    socket.io.on('reconnect', refetch);
    return () => {
      socket.off('order:new', handleNew);
      socket.off('order:status', handleStatus);
      socket.off('orders:settled', handleSettled);
      socket.io.off('reconnect', refetch);
    };
  }, [refetch]);

  return { orders, loading, refetch, applyStatusLocal };
}

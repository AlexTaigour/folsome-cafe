import { Server } from 'socket.io';
import { userFromToken, parseCookieHeader, COOKIE_NAME } from './auth.js';
import { supabase } from './db.js';

let io = null;

const STAFF_ROOMS = ['kitchen', 'staff', 'owner'];

export function initSockets(httpServer, corsOrigins) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    // Cookie auth on the upgrade request; anonymous customers are allowed.
    try {
      const cookies = parseCookieHeader(socket.request.headers.cookie);
      socket.data.user = await userFromToken(cookies[COOKIE_NAME]);
    } catch (err) {
      console.error('socket auth failed (continuing anonymous):', err.message);
      socket.data.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user && STAFF_ROOMS.includes(user.role)) {
      socket.join(user.role);
      // owners see everything staff/kitchen see
      if (user.role === 'owner') socket.join(['staff', 'kitchen']);
    }

    // Customers track their own order by unguessable public code.
    // socket.io does not catch async listener rejections — guard everything.
    socket.on('track', async (publicCode) => {
      try {
        if (typeof publicCode !== 'string' || publicCode.length > 20) return;
        const { data, error } = await supabase
          .from('orders')
          .select('id')
          .eq('public_code', publicCode)
          .maybeSingle();
        if (error) return console.error('track lookup failed:', error.message);
        if (data) socket.join(`order:${publicCode}`);
      } catch (err) {
        console.error('track handler error:', err);
      }
    });
  });

  return io;
}

export function emitOrderNew(order) {
  if (!io) return;
  io.to(STAFF_ROOMS).emit('order:new', order);
  io.to(`order:${order.publicCode}`).emit('order:status', {
    id: order.id,
    publicCode: order.publicCode,
    status: order.status,
    changedAt: order.createdAt,
    changedBy: null,
  });
}

export function emitOrderStatus(payload) {
  if (!io) return;
  io.to(STAFF_ROOMS).to(`order:${payload.publicCode}`).emit('order:status', payload);
}

// A table's bill was paid: every unpaid order on it settled in one payment.
export function emitOrdersSettled({ tableNo, orderIds, paymentId }) {
  if (!io) return;
  io.to(STAFF_ROOMS).emit('orders:settled', { tableNo, orderIds, paymentId });
}

export function emitMenuUpdated() {
  if (!io) return;
  io.emit('menu:updated', {});
}

// Customer pressed "call waiter" / "ask for bill" — staff counter only
// (kitchen doesn't answer the floor).
export function emitServiceCall(call) {
  if (!io) return;
  io.to(['staff', 'owner']).emit('call:new', call);
}

export function emitServiceCallResolved(payload) {
  if (!io) return;
  io.to(['staff', 'owner']).emit('call:resolved', payload);
}

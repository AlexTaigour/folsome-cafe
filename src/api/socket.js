import { io } from 'socket.io-client';

// Singleton socket. Same-origin in production; in dev Vite proxies /socket.io.
// Auth rides on the httpOnly cookie during the handshake, so after login or
// logout we must reconnect() to pick up the new identity.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({ withCredentials: true });
  }
  return socket;
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}

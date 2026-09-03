// Thin fetch wrapper: same-origin /api, cookies included, JSON errors thrown
// as Error with .status so views can branch on 401/403/409.
// Every request gets an 8s timeout; GETs (idempotent) additionally retry on
// timeout / network failure / gateway errors. Writes are never retried — a
// retried settle or order-create could double-charge; server 409 guards make
// a manual staff retry safe instead.

const TIMEOUT_MS = 8000;
const RETRY_DELAYS = [500, 1500]; // GET only
const RETRIABLE_STATUS = new Set([502, 503, 504]);

async function attempt(path, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, options = {}) {
  const isGet = !options.method || options.method === 'GET';
  for (let i = 0; ; i++) {
    try {
      return await attempt(path, options);
    } catch (err) {
      const timedOut = err.name === 'AbortError';
      const netFail = err instanceof TypeError; // fetch network failure
      const retriable = timedOut || netFail || RETRIABLE_STATUS.has(err.status);
      if (isGet && retriable && i < RETRY_DELAYS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
        continue;
      }
      if (timedOut || netFail) {
        const e = new Error(
          timedOut ? 'Request timed out — check the connection' : 'Network error — check the connection'
        );
        e.status = 0;
        throw e;
      }
      throw err;
    }
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

// ---- typed helpers ----
export const login = (username, password) => api.post('/auth/login', { username, password });
export const logout = () => api.post('/auth/logout', {});
export const fetchMe = () => api.get('/auth/me');
export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

export const fetchMenu = () => api.get('/menu');
export const fetchTables = () => api.get('/tables');
export const fetchTableBoard = () => api.get('/tables/board');
export const fetchTableBill = (tableNo) => api.get(`/tables/${encodeURIComponent(tableNo)}/bill`);
// opts: { orderIds?, discount?, discountPercent?, extraCharge?, note?, creditCustomer? }
export const settleTable = (tableNo, method, opts = {}) =>
  api.post(`/tables/${encodeURIComponent(tableNo)}/settle`, { method, ...opts });
export const createMenuItem = (item) => api.post('/menu', item);
export const updateMenuItem = (id, item) => api.put(`/menu/${id}`, item);
export const setMenuItemAvailability = (id, isAvailable) =>
  api.put(`/menu/${id}/availability`, { isAvailable });
export const deleteMenuItem = (id) => api.del(`/menu/${id}`);

// service calls (call waiter / ask for bill)
export const createServiceCall = (table, kind) => api.post('/calls', { table, kind });
export const fetchOpenCalls = () => api.get('/calls');
export const resolveServiceCall = (id) => api.post(`/calls/${id}/resolve`, {});

// udhaaro (credit) ledger
export const fetchCreditLedger = () => api.get('/credit');
export const fetchCreditHistory = (phone) => api.get(`/credit/${encodeURIComponent(phone)}`);
export const repayCredit = (entry) => api.post('/credit/repay', entry);

export const placeOrder = (order) => api.post('/orders', order);
export const trackOrder = (code) => api.get(`/orders/track/${encodeURIComponent(code)}`);
export const fetchOrders = (scope = 'active') => api.get(`/orders?status=${scope}`);
export const fetchOrderHistory = (from, to) => api.get(`/orders/history${qs(from, to)}`);
export const setOrderStatus = (id, status) => api.put(`/orders/${id}/status`, { status });

export const fetchUsers = () => api.get('/users');
export const createUser = (u) => api.post('/users', u);
export const updateUser = (id, u) => api.put(`/users/${id}`, u);
export const deactivateUser = (id) => api.del(`/users/${id}`);

export const fetchServerInfo = () => api.get('/server-info');

// in-café ordering lock
export const fetchOrderGateStatus = (coords) => {
  // optional { lat, lng } feed the GPS layer so the menu knows if it may order
  const q = coords && coords.lat != null && coords.lng != null
    ? `?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`
    : '';
  return api.get(`/settings/order-gate/status${q}`);
};
export const fetchOrderGate = () => api.get('/settings/order-gate'); // owner: { enabled, ips, geo, mode, currentIp }
export const updateOrderGate = (patch) => api.put('/settings/order-gate', patch);
export const detectMyIp = () => api.get('/settings/order-gate/my-ip'); // owner: { ip, kind }

const qs = (from, to) => {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const analytics = {
  summary: (from, to) => api.get(`/analytics/summary${qs(from, to)}`),
  dayReport: (from, to) => api.get(`/analytics/day-report${qs(from, to)}`),
  salesByDay: (from, to) => api.get(`/analytics/sales-by-day${qs(from, to)}`),
  topItems: (from, to) => api.get(`/analytics/top-items${qs(from, to)}`),
  peakHours: (from, to) => api.get(`/analytics/peak-hours${qs(from, to)}`),
  prepTimes: (from, to) => api.get(`/analytics/prep-times${qs(from, to)}`),
};

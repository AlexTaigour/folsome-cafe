export const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatRs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

// minutes elapsed since an ISO timestamp
export const minutesSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));

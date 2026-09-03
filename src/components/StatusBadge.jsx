// Single source of truth for status → presentation and for which action
// buttons each role sees. The server enforces the same map — this is UI only.

export const STATUS_META = {
  pending:   { label: 'Pending',   badge: 'bg-orange-500', ring: 'border-orange-500 ring-4 ring-orange-500/10', pulse: true },
  accepted:  { label: 'Accepted',  badge: 'bg-amber-500',  ring: 'border-amber-400' },
  preparing: { label: 'Preparing', badge: 'bg-blue-500',   ring: 'border-blue-500' },
  cooked:    { label: 'Cooked',    badge: 'bg-purple-500', ring: 'border-purple-500 ring-4 ring-purple-500/10', pulse: true },
  // served-but-unpaid orders stay on the counter until the table settles —
  // keep them clearly visible, just calm.
  served:    { label: 'Served',    badge: 'bg-green-500',  ring: 'border-green-500/40' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-500',    ring: 'border-red-500/50 opacity-50' },
};

export const TIMELINE_STEPS = ['pending', 'accepted', 'preparing', 'cooked', 'served'];

// role → { status → [{to, label, style}] }
const CANCEL = { to: 'cancelled', label: 'Cancel', style: 'bg-red-500' };
export const ACTIONS = {
  kitchen: {
    pending:   [{ to: 'accepted', label: 'Accept', style: 'bg-amber-500' }, CANCEL],
    accepted:  [{ to: 'preparing', label: 'Start Cooking', style: 'bg-blue-500' }, CANCEL],
    preparing: [{ to: 'cooked', label: 'Cooked', style: 'bg-purple-500' }, CANCEL],
  },
  staff: {
    pending:   [CANCEL],
    accepted:  [CANCEL],
    preparing: [CANCEL],
    cooked:    [{ to: 'served', label: 'Serve', style: 'bg-green-600' }, CANCEL],
  },
  owner: {
    pending:   [{ to: 'accepted', label: 'Accept', style: 'bg-amber-500' }, CANCEL],
    accepted:  [{ to: 'preparing', label: 'Start Cooking', style: 'bg-blue-500' }, CANCEL],
    preparing: [{ to: 'cooked', label: 'Cooked', style: 'bg-purple-500' }, CANCEL],
    cooked:    [{ to: 'served', label: 'Serve', style: 'bg-green-600' }, CANCEL],
  },
};

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white inline-block ${meta.badge} ${meta.pulse ? 'animate-pulse' : ''}`}
    >
      {meta.label}
    </span>
  );
}

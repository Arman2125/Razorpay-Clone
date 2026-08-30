const STYLES = {
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  sent: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  processed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  expired: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  suspended: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${style}`}
    >
      {status}
    </span>
  );
}

// A customer's recovery status ('recovered' | 'pending' | 'no_payments' —
// see utils/format.js's customerRecoveryStatus) isn't a Payment/Reminder
// status, so it gets its own small label map rather than overloading the
// default export's STYLES (which is keyed on the real backend status enums).
const RECOVERY_STYLES = {
  recovered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  no_payments: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const RECOVERY_LABELS = {
  recovered: 'Recovered ✓',
  pending: 'Pending',
  no_payments: 'No Payments',
};

export function RecoveryBadge({ status }) {
  const style = RECOVERY_STYLES[status] || RECOVERY_STYLES.no_payments;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {RECOVERY_LABELS[status] || status}
    </span>
  );
}

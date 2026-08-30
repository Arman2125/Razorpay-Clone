import { useApi } from '../hooks/useApi';
import { listReminders } from '../api/reminders';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatDateTime } from '../utils/format';

export default function Reminders() {
  const { data, loading, error, reload } = useApi(() => listReminders(), []);

  if (loading) return <LoadingState label="Loading reminders..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reminders</h1>
          <p className="text-sm text-slate-500">Payment reminders sent to customers</p>
        </div>
        <button
          onClick={reload}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No reminders sent yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.reminderId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.paymentId}</td>
                  <td className="px-4 py-3 max-w-md text-slate-600">{r.message}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(r.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

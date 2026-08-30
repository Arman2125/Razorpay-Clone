import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listPendingWithPriority } from '../api/payments';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

function PriorityBar({ score }) {
  const color = score >= 60 ? 'bg-rose-500' : score >= 35 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600">{score}</span>
    </div>
  );
}

export default function PendingCollections() {
  const { data, loading, error, reload } = useApi(() => listPendingWithPriority(), []);

  if (loading) return <LoadingState label="Calculating priority..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pending Collections</h1>
        <p className="text-sm text-slate-500">
          Sorted by a deterministic priority score — overdue days, amount, and payment history.
        </p>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No pending payments" description="All caught up." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Pending Amount</th>
                <th className="px-4 py-3">Days Overdue</th>
                <th className="px-4 py-3">Reminder Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.paymentId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-800">{p.customer?.name || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.daysOverdue > 0 ? `${p.daysOverdue} day${p.daysOverdue > 1 ? 's' : ''}` : 'Not yet due'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.lastReminderAt ? `Sent ${formatDate(p.lastReminderAt)}` : 'Not sent'}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBar score={p.priorityScore} />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/payments/${p.paymentId}`} className="text-xs font-medium text-indigo-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listActivity } from '../api/activity';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatDateTime } from '../utils/format';

const ACTION_ICONS = {
  REMINDER_SENT: '📨',
  PAYMENT_VIEWED: '👁',
  PAYMENT_UPDATED: '✏️',
  CUSTOMER_CREATED: '👤',
  CUSTOMER_UPDATED: '✏️',
  SETTLEMENT_VIEWED: '💰',
};

export default function Activity() {
  const [actionFilter, setActionFilter] = useState('');
  const { data, loading, error, reload } = useApi(
    () => listActivity(actionFilter ? { action: actionFilter } : {}),
    [actionFilter]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Activity</h1>
          <p className="text-sm text-slate-500">Full audit trail — every action, by dashboard or Sugam, appears here</p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
        >
          <option value="">All actions</option>
          <option value="REMINDER_SENT">Reminder Sent</option>
          <option value="PAYMENT_VIEWED">Payment Viewed</option>
          <option value="CUSTOMER_CREATED">Customer Created</option>
          <option value="CUSTOMER_UPDATED">Customer Updated</option>
          <option value="SETTLEMENT_VIEWED">Settlement Viewed</option>
        </select>
      </div>

      {loading && <LoadingState label="Loading activity..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && data?.items?.length === 0 && <EmptyState title="No activity yet" />}

      {!loading && !error && data?.items?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-50">
            {data.items.map((a) => (
              <li key={a.activityId} className="flex items-start gap-3 px-5 py-4">
                <span className="text-lg leading-none">{ACTION_ICONS[a.action] || '•'}</span>
                <div className="flex-1">
                  <p className="text-sm text-slate-800">{a.description}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{a.action}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

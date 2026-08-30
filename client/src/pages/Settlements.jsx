import { useApi } from '../hooks/useApi';
import { listSettlements } from '../api/settlements';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

export default function Settlements() {
  const { data, loading, error, reload } = useApi(() => listSettlements(), []);

  if (loading) return <LoadingState label="Loading settlements..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { items, summary } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settlements</h1>
        <p className="text-sm text-slate-500">Funds settled to your bank account</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Total Settled" value={formatCurrency(summary.totalSettled)} accent="emerald" />
        <Card title="Pending Settlement" value={formatCurrency(summary.pendingSettlement)} accent="amber" />
        <Card
          title="Latest Settlement"
          value={summary.latestSettlement ? formatCurrency(summary.latestSettlement.amount) : '—'}
          sub={summary.latestSettlement ? formatDate(summary.latestSettlement.settlementDate) : undefined}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title="No settlements yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Settlement ID</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Settlement Date</th>
                <th className="px-4 py-3">UTR</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.settlementId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.settlementId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(s.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(s.settlementDate)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.utr || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/useApi';
import { getAnalyticsSummary } from '../api/analytics';
import { LoadingState, ErrorState } from '../components/States';
import { formatCurrency } from '../utils/format';

export default function Analytics() {
  const { data, loading, error, reload } = useApi(() => getAnalyticsSummary(), []);

  if (loading) return <LoadingState label="Loading analytics..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { statusBreakdown, methodBreakdown, volumeOverTime } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">Deeper look at payment volume and breakdowns</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Volume by day</h2>
        {volumeOverTime.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No payment data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={volumeOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">By status</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-2">Status</th>
                <th className="pb-2">Count</th>
                <th className="pb-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {statusBreakdown.map((s) => (
                <tr key={s.status} className="border-t border-slate-50">
                  <td className="py-2 capitalize text-slate-700">{s.status}</td>
                  <td className="py-2 text-slate-600">{s.count}</td>
                  <td className="py-2 text-slate-600">{formatCurrency(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">By payment method</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-2">Method</th>
                <th className="pb-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {methodBreakdown.map((m) => (
                <tr key={m.method} className="border-t border-slate-50">
                  <td className="py-2 text-slate-700">{m.method}</td>
                  <td className="py-2 text-slate-600">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

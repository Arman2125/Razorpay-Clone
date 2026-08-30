import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { getAnalyticsSummary } from '../api/analytics';
import { listActivity } from '../api/activity';
import Card from '../components/Card';
import { LoadingState, ErrorState } from '../components/States';
import { formatCurrency, timeAgo } from '../utils/format';

const STATUS_COLORS = { paid: '#10b981', pending: '#f59e0b', failed: '#f43f5e', expired: '#94a3b8' };
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#f43f5e'];

export default function Dashboard() {
  const { data, loading, error, reload } = useApi(() => getAnalyticsSummary(), []);
  const { data: activity } = useApi(() => listActivity({ limit: 6 }), []);

  if (loading) return <LoadingState label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const { overview, statusBreakdown, methodBreakdown, volumeOverTime } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of your payment operations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Payments" value={overview.totalPayments} sub={formatCurrency(overview.totalVolume)} />
        <Card title="Pending Amount" value={formatCurrency(overview.pendingAmount)} accent="amber" sub={`${overview.pendingCount} payments`} />
        <Card title="Successful Payments" value={overview.successfulCount} accent="emerald" />
        <Card title="Failed Payments" value={overview.failedCount} accent="rose" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Payment volume over time</h2>
          {volumeOverTime.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No payment data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={volumeOverTime}>
                <defs>
                  <linearGradient id="volume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Area type="monotone" dataKey="amount" stroke="#6366f1" fill="url(#volume)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Paid vs Pending vs Failed</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={statusBreakdown}
                dataKey="count"
                nameKey="status"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {statusBreakdown.map((entry, i) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Payment method distribution</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={methodBreakdown} dataKey="count" nameKey="method" outerRadius={80} paddingAngle={2}>
                {methodBreakdown.map((entry, i) => (
                  <Cell key={entry.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend verticalAlign="bottom" height={24} iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent activity</h2>
            <Link to="/activity" className="text-xs font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {!activity?.items?.length ? (
            <p className="py-10 text-center text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activity.items.map((a) => (
                <li key={a.activityId} className="flex items-start justify-between border-b border-slate-50 pb-3 last:border-0">
                  <div>
                    <p className="text-sm text-slate-800">{a.description}</p>
                    <p className="text-xs text-slate-400">{a.action}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

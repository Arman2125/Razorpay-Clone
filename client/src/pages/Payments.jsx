import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listPayments } from '../api/payments';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

export default function Payments() {
  const [filters, setFilters] = useState({ customer: '', status: '', minAmount: '', maxAmount: '' });
  const [applied, setApplied] = useState({});

  const { data, loading, error, reload } = useApi(() => listPayments(applied), [JSON.stringify(applied)]);

  function submitFilters(e) {
    e.preventDefault();
    const cleaned = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    setApplied(cleaned);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
        <p className="text-sm text-slate-500">All payments across your customers</p>
      </div>

      <form onSubmit={submitFilters} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
          <input
            value={filters.customer}
            onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value }))}
            placeholder="Search by name"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Min amount</label>
          <input
            type="number"
            value={filters.minAmount}
            onChange={(e) => setFilters((f) => ({ ...f, minAmount: e.target.value }))}
            className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Max amount</label>
          <input
            type="number"
            value={filters.maxAmount}
            onChange={(e) => setFilters((f) => ({ ...f, maxAmount: e.target.value }))}
            className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          Apply
        </button>
      </form>

      {loading && <LoadingState label="Loading payments..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && data?.items?.length === 0 && (
        <EmptyState title="No payments found" description="Try adjusting your filters." />
      )}

      {!loading && !error && data?.items?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Payment ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.paymentId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.paymentId}</td>
                  <td className="px-4 py-3 text-slate-800">{p.customer?.name || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.paymentMethod}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.dueDate)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/payments/${p.paymentId}`} className="text-xs font-medium text-indigo-600 hover:underline">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Showing {data.items.length} of {data.total} payments
          </div>
        </div>
      )}
    </div>
  );
}

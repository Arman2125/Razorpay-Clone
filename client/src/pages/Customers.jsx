import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listCustomers } from '../api/customers';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

export default function Customers() {
  const { data, loading, error, reload } = useApi(() => listCustomers(), []);

  if (loading) return <LoadingState label="Loading customers..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <p className="text-sm text-slate-500">Everyone you've done business with</p>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No customers yet" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Total Payments</th>
                <th className="px-4 py-3">Paid Amount</th>
                <th className="px-4 py-3">Pending Amount</th>
                <th className="px-4 py-3">Last Payment</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.customerId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.company}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{c.totalPayments}</td>
                  <td className="px-4 py-3 text-emerald-700">{formatCurrency(c.paidAmount)}</td>
                  <td className="px-4 py-3 text-amber-700">{formatCurrency(c.pendingAmount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.lastPayment ? formatDate(c.lastPayment.createdAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/customers/${c.customerId}`} className="text-xs font-medium text-indigo-600 hover:underline">
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

import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listCustomers } from '../api/customers';
import { RecoveryBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate, customerTotalAmount, customerRecoveryStatus } from '../utils/format';

// Separate from Customers.jsx (basic customer list/management) — this is the
// merchant-side revenue-recovery view: same underlying customer/payment data,
// but enriched with recovery-specific fields (pendingCount, recovery status)
// and linking to CustomerDashboardDetail.jsx instead of CustomerDetail.jsx.
export default function CustomerDashboard() {
  const { data, loading, error, reload } = useApi(() => listCustomers(), []);

  if (loading) return <LoadingState label="Loading customers..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Customer Dashboard</h1>
        <p className="text-sm text-slate-500">Revenue recovery, per customer — only your own customers</p>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No customers yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Pending Payments</th>
                <th className="px-4 py-3">Last Payment</th>
                <th className="px-4 py-3">Status</th>
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
                  <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(customerTotalAmount(c))}</td>
                  <td className="px-4 py-3 text-emerald-700">{formatCurrency(c.paidAmount)}</td>
                  <td className="px-4 py-3 text-amber-700">{formatCurrency(c.pendingAmount)}</td>
                  <td className="px-4 py-3 text-slate-600">{c.pendingCount}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.lastPayment ? formatDate(c.lastPayment.createdAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RecoveryBadge status={customerRecoveryStatus(c)} />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/customer-dashboard/${c.customerId}`} className="text-xs font-medium text-indigo-600 hover:underline">
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

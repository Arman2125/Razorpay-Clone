import { Link, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getCustomer, getCustomerPayments } from '../api/customers';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate } from '../utils/format';

export default function CustomerDetail() {
  const { customerId } = useParams();
  const { data: customer, loading, error, reload } = useApi(() => getCustomer(customerId), [customerId]);
  const { data: payments, loading: paymentsLoading } = useApi(() => getCustomerPayments(customerId), [customerId]);

  if (loading) return <LoadingState label="Loading customer..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!customer) return null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/customers" className="text-xs font-medium text-indigo-600 hover:underline">
          ← Back to Customers
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{customer.name}</h1>
        <p className="text-sm text-slate-500">{customer.company}</p>
        <p className="mt-1 text-sm text-slate-500">{customer.phone}</p>

        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs text-slate-400">Total Payments</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{customer.totalPayments}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Paid</p>
            <p className="mt-1 text-lg font-semibold text-emerald-600">{formatCurrency(customer.paidAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Pending</p>
            <p className="mt-1 text-lg font-semibold text-amber-600">{formatCurrency(customer.pendingAmount)}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Payment history</h2>
        {paymentsLoading && <LoadingState label="Loading payments..." />}
        {!paymentsLoading && payments?.length === 0 && <EmptyState title="No payments yet" />}
        {!paymentsLoading && payments?.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.paymentId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.paymentId}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.createdAt)}</td>
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
    </div>
  );
}

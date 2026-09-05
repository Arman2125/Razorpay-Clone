import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listOrders, createOrder, updateOrderStatus } from '../api/orders';
import { listCustomers } from '../api/customers';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDateTime } from '../utils/format';

const NEXT_STATUS = {
  created: ['attempted', 'cancelled'],
  attempted: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export default function Orders() {
  const { data: orders, loading, error, reload } = useApi(() => listOrders(), []);
  const { data: customers } = useApi(() => listCustomers(), []);
  const { push } = useToast();

  const customerNameById = Object.fromEntries((customers || []).map((c) => [c.customerId, c.name]));

  const [form, setForm] = useState({ customerId: '', amount: '', receipt: '' });
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.customerId || !form.amount) {
      push('Select a customer and enter an amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createOrder({ customerId: form.customerId, amount: Number(form.amount), receipt: form.receipt || undefined });
      push('Order created.', 'success');
      setForm({ customerId: '', amount: '', receipt: '' });
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create order.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(orderId, status) {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      push(`Order marked ${status}.`, 'success');
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to update order.', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">Track a receivable from creation through fulfillment.</p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
          <select
            value={form.customerId}
            onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
            className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Select a customer</option>
            {(customers || []).map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Amount (₹)</label>
          <input
            type="number"
            min="1"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="15000"
            className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Receipt (optional)</label>
          <input
            value={form.receipt}
            onChange={(e) => setForm((f) => ({ ...f, receipt: e.target.value }))}
            placeholder="ORD-1001"
            className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Order'}
        </button>
      </form>

      {loading && <LoadingState label="Loading orders..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && orders?.items?.length === 0 && (
        <EmptyState title="No orders yet" description="Create one above." />
      )}

      {!loading && !error && orders?.items?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.items.map((o) => (
                <tr key={o.orderId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{o.orderId}</td>
                  <td className="px-4 py-3 text-slate-800">{customerNameById[o.customerId] || o.customerId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(o.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(o.createdAt)}</td>
                  <td className="px-4 py-3 space-x-2">
                    {(NEXT_STATUS[o.status] || []).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleTransition(o.orderId, status)}
                        disabled={updatingId === o.orderId}
                        className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        Mark {status}
                      </button>
                    ))}
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

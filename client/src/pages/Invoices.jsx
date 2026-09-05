import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listInvoices, createInvoice, updateInvoiceStatus } from '../api/invoices';
import { listCustomers } from '../api/customers';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';

const NEXT_STATUS = {
  draft: ['issued', 'cancelled'],
  issued: ['paid', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export default function Invoices() {
  const { data: invoices, loading, error, reload } = useApi(() => listInvoices(), []);
  const { data: customers } = useApi(() => listCustomers(), []);
  const { push } = useToast();

  const [form, setForm] = useState({ customerId: '', amount: '', description: '', dueDate: '' });
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
      await createInvoice({
        customerId: form.customerId,
        amount: Number(form.amount),
        description: form.description || undefined,
        dueDate: form.dueDate || undefined,
      });
      push('Invoice created as draft.', 'success');
      setForm({ customerId: '', amount: '', description: '', dueDate: '' });
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create invoice.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(invoiceId, status) {
    setUpdatingId(invoiceId);
    try {
      await updateInvoiceStatus(invoiceId, status);
      push(`Invoice marked ${status}.`, 'success');
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to update invoice.', 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <p className="text-sm text-slate-500">Draft, issue, and track billing documents through to payment.</p>
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
            placeholder="8000"
            className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Due date (optional)</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Description (optional)</label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Consulting — March"
            className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Draft'}
        </button>
      </form>

      {loading && <LoadingState label="Loading invoices..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && invoices?.items?.length === 0 && (
        <EmptyState title="No invoices yet" description="Create a draft above." />
      )}

      {!loading && !error && invoices?.items?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice ID</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.items.map((inv) => (
                <tr key={inv.invoiceId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{inv.invoiceId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(inv.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(inv.createdAt)}</td>
                  <td className="px-4 py-3 space-x-2">
                    {(NEXT_STATUS[inv.status] || []).map((status) => (
                      <button
                        key={status}
                        onClick={() => handleTransition(inv.invoiceId, status)}
                        disabled={updatingId === inv.invoiceId}
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

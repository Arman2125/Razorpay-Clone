import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listPaymentLinks, createPaymentLink, cancelPaymentLink } from '../api/paymentLinks';
import { listCustomers } from '../api/customers';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDateTime } from '../utils/format';

export default function PaymentLinks() {
  const { data: links, loading, error, reload } = useApi(() => listPaymentLinks(), []);
  const { data: customers } = useApi(() => listCustomers(), []);
  const { push } = useToast();

  const [form, setForm] = useState({ customerId: '', amount: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.customerId || !form.amount) {
      push('Select a customer and enter an amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const link = await createPaymentLink({
        customerId: form.customerId,
        amount: Number(form.amount),
        description: form.description || undefined,
      });
      push(`Payment link created: ${link.shortUrl}`, 'success');
      setForm({ customerId: '', amount: '', description: '' });
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create payment link.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(paymentLinkId) {
    setCancellingId(paymentLinkId);
    try {
      await cancelPaymentLink(paymentLinkId);
      push('Payment link cancelled.', 'success');
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to cancel link.', 'error');
    } finally {
      setCancellingId(null);
    }
  }

  function copyLink(url) {
    navigator.clipboard?.writeText(url);
    push('Link copied.', 'success');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Payment Links</h1>
        <p className="text-sm text-slate-500">
          Create a shareable link to collect a payment — the same API Sugam will call.
        </p>
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
            placeholder="5000"
            className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Description (optional)</label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Order #1"
            className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Link'}
        </button>
      </form>

      {loading && <LoadingState label="Loading payment links..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && links?.length === 0 && (
        <EmptyState title="No payment links yet" description="Create one above." />
      )}

      {!loading && !error && links?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Link ID</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Link</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.paymentLinkId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.paymentLinkId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(l.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copyLink(l.shortUrl)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Copy link
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === 'active' && (
                      <button
                        onClick={() => handleCancel(l.paymentLinkId)}
                        disabled={cancellingId === l.paymentLinkId}
                        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
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

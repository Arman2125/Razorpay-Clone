import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { listRefunds, createRefund, getRefundableAmount } from '../api/refunds';
import { listPayments } from '../api/payments';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { formatCurrency, formatDateTime } from '../utils/format';

export default function Refunds() {
  const { data: refunds, loading, error, reload } = useApi(() => listRefunds(), []);
  const { data: paidPayments } = useApi(() => listPayments({ status: 'paid', limit: 100 }), []);
  const { push } = useToast();

  const [form, setForm] = useState({ paymentId: '', amount: '', reason: '' });
  const [refundable, setRefundable] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePaymentChange(paymentId) {
    setForm((f) => ({ ...f, paymentId }));
    setRefundable(null);
    if (!paymentId) return;
    try {
      const result = await getRefundableAmount(paymentId);
      setRefundable(result);
    } catch {
      setRefundable(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.paymentId || !form.amount) {
      push('Select a payment and enter an amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createRefund({ paymentId: form.paymentId, amount: Number(form.amount), reason: form.reason || undefined });
      push('Refund created.', 'success');
      setForm({ paymentId: '', amount: '', reason: '' });
      setRefundable(null);
      reload();
    } catch (err) {
      push(err.response?.data?.error?.message || 'Failed to create refund.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Refunds</h1>
        <p className="text-sm text-slate-500">
          Refund a paid payment, partially or in full. A payment's own status never changes — refunds are tracked in a
          separate ledger against it.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Paid payment</label>
          <select
            value={form.paymentId}
            onChange={(e) => handlePaymentChange(e.target.value)}
            className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Select a paid payment</option>
            {(paidPayments?.items || []).map((p) => (
              <option key={p.paymentId} value={p.paymentId}>
                {p.customer?.name || p.customerId} — {formatCurrency(p.amount)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Amount (₹){refundable && ` — refundable: ${formatCurrency(refundable.refundableAmount)}`}
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="1000"
            className="w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
          <input
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Customer request"
            className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Refunding...' : 'Create Refund'}
        </button>
      </form>

      {loading && <LoadingState label="Loading refunds..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && refunds?.items?.length === 0 && (
        <EmptyState title="No refunds yet" description="Refund a paid payment above." />
      )}

      {!loading && !error && refunds?.items?.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Refund ID</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {refunds.items.map((r) => (
                <tr key={r.refundId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.refundId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.paymentId}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.reason || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

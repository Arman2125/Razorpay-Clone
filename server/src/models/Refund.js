import mongoose from 'mongoose';

// A Refund is a separate ledger entry, never a mutation of Payment.status —
// see refundService.js. A "paid" Payment stays "paid" forever; how much of
// it remains refundable is always derived on demand from this collection.
const refundSchema = new mongoose.Schema(
  {
    refundId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    paymentId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    // This demo has no real payment gateway, so a validated refund always
    // simulates instant success — "failed" exists for schema completeness
    // (mirrors Settlement's status enum) but createRefund never produces it.
    status: { type: String, enum: ['refunded', 'failed'], default: 'refunded', index: true },
    reason: { type: String },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

refundSchema.index({ merchantId: 1, status: 1 });
refundSchema.index({ merchantId: 1, paymentId: 1 });
refundSchema.index({ merchantId: 1, customerId: 1 });
refundSchema.index({ merchantId: 1, createdAt: -1 });
// Idempotency keys are only unique within a merchant — see PaymentLink/Reminder
// for why a partial filter (not plain `sparse`) is required here.
refundSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('Refund', refundSchema);

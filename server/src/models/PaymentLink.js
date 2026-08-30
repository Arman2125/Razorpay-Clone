import mongoose from 'mongoose';

const paymentLinkSchema = new mongoose.Schema(
  {
    paymentLinkId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    description: { type: String },
    status: {
      type: String,
      enum: ['active', 'paid', 'cancelled', 'expired'],
      default: 'active',
      index: true,
    },
    shortUrl: { type: String, required: true },
    idempotencyKey: { type: String },
    expiresAt: { type: Date },
    paidAt: { type: Date },
    // Set only once the link is paid — the receivable that payment actually created
    // (or, if existingPaymentId was set at creation, that same existing paymentId).
    paymentId: { type: String },
    // Optional: when this link exists to collect an already-existing pending
    // Payment (e.g. from the Customer Dashboard's "Get Payment Link" action on
    // a specific due payment) rather than a brand-new ad-hoc receivable, this
    // holds that Payment's paymentId. payPaymentLink() then marks THAT payment
    // paid (via the existing paymentService.updatePaymentStatus state machine)
    // instead of creating a new one — see paymentLinkService.js. Left unset,
    // behavior is 100% unchanged from before this field existed (a new Payment
    // is created on payment, exactly as Sugam's create_payment_link tool
    // already relies on).
    existingPaymentId: { type: String },
  },
  { timestamps: true }
);

paymentLinkSchema.index({ merchantId: 1, status: 1 });
paymentLinkSchema.index({ merchantId: 1, customerId: 1 });
// Idempotency keys are only unique within a merchant — two different
// merchants independently choosing the same key must not collide. A plain
// `sparse` compound index would still collide docs that share merchantId
// but both lack idempotencyKey (sparse only excludes docs missing *every*
// indexed field), so this uses an explicit partial filter instead.
paymentLinkSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('PaymentLink', paymentLinkSchema);

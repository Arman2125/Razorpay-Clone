import mongoose from 'mongoose';

// An Invoice is a billing document with its own draft/issue/pay/overdue/cancel
// lifecycle — additive to (and never a rename of) Payment or Order. See
// invoiceService.js for the state machine and the lazy overdue flip (same
// pattern as PaymentLink's lazy expiry flip).
const invoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    orderId: { type: String },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['draft', 'issued', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
      index: true,
    },
    description: { type: String },
    dueDate: { type: Date },
    issuedAt: { type: Date },
    paidAt: { type: Date },
    paymentId: { type: String },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

invoiceSchema.index({ merchantId: 1, status: 1 });
invoiceSchema.index({ merchantId: 1, customerId: 1 });
invoiceSchema.index({ merchantId: 1, createdAt: -1 });
invoiceSchema.index({ merchantId: 1, dueDate: 1 });
invoiceSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('Invoice', invoiceSchema);

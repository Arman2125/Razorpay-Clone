import mongoose from 'mongoose';

// An Order is a receivable a merchant intends to collect, distinct from a
// Payment (an actual completed/attempted transaction record) — same
// separation of concerns as real Razorpay. Marking an order "paid" here is
// a status flag reflecting fulfillment; it never fabricates money movement
// itself. If a real Payment settles the order, its id is stored in
// `paymentId` as an additive link — see orderService.js.
const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'attempted', 'paid', 'cancelled'],
      default: 'created',
      index: true,
    },
    receipt: { type: String },
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    paymentId: { type: String },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ merchantId: 1, status: 1 });
orderSchema.index({ merchantId: 1, customerId: 1 });
orderSchema.index({ merchantId: 1, createdAt: -1 });
orderSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('Order', orderSchema);

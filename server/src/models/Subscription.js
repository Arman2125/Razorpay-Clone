import mongoose from 'mongoose';

// Recurring billing schedule + lifecycle only — no in-process cron lives
// here. `nextBillingAt` is advanced exclusively by the deterministic,
// idempotent processDueSubscriptions() service function (see
// subscriptionService.js), never by a timer, so a server restart can never
// cause a duplicate or skipped charge.
const subscriptionSchema = new mongoose.Schema(
  {
    subscriptionId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    planId: { type: String },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'INR' },
    interval: { type: String, enum: ['day', 'week', 'month', 'year'], required: true },
    intervalCount: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ['created', 'active', 'paused', 'cancelled', 'completed'],
      default: 'created',
      index: true,
    },
    startAt: { type: Date, required: true },
    nextBillingAt: { type: Date, required: true, index: true },
    // Set when cancellation is scheduled for the end of the current cycle
    // rather than immediately — see subscriptionService.cancelSubscription.
    cancelAt: { type: Date },
    cancelledAt: { type: Date },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

subscriptionSchema.index({ merchantId: 1, status: 1 });
subscriptionSchema.index({ merchantId: 1, customerId: 1 });
subscriptionSchema.index({ merchantId: 1, nextBillingAt: 1 });
subscriptionSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('Subscription', subscriptionSchema);

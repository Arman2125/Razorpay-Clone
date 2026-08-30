import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema(
  {
    reminderId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    paymentId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'sent' },
    idempotencyKey: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

// Idempotency keys are only unique within a merchant — two different
// merchants independently choosing the same key must not collide. A plain
// `sparse` compound index would still collide docs that share merchantId
// but both lack idempotencyKey (sparse only excludes docs missing *every*
// indexed field), so this uses an explicit partial filter instead.
reminderSchema.index(
  { merchantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);

export default mongoose.model('Reminder', reminderSchema);

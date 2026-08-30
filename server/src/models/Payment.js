import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    customerId: { type: String, index: true, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Card', 'Net Banking', 'Cash'],
      required: true,
    },
    description: { type: String },
    dueDate: { type: Date },
    paidAt: { type: Date },
    lastReminderAt: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.index({ merchantId: 1, status: 1 });
paymentSchema.index({ merchantId: 1, customerId: 1 });

export default mongoose.model('Payment', paymentSchema);

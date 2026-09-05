import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    activityId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: [
        'payment',
        'customer',
        'reminder',
        'settlement',
        'paymentLink',
        'refund',
        'order',
        'invoice',
        'subscription',
      ],
      required: true,
    },
    entityId: { type: String, required: true },
    description: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ merchantId: 1, createdAt: -1 });

export default mongoose.model('Activity', activitySchema);

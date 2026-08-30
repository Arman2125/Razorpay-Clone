import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema(
  {
    settlementId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['processed', 'pending', 'failed'], default: 'pending' },
    settlementDate: { type: Date, required: true },
    utr: { type: String },
  },
  { timestamps: true }
);

settlementSchema.index({ merchantId: 1, settlementDate: -1 });

export default mongoose.model('Settlement', settlementSchema);

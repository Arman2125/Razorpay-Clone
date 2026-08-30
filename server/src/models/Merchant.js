import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema(
  {
    merchantId: { type: String, unique: true, index: true, required: true },
    businessName: { type: String, required: true },
    ownerName: { type: String, required: true },
    phoneNumber: { type: String, required: true, unique: true },
    email: { type: String },
    businessType: { type: String, default: 'General' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  },
  { timestamps: true }
);

export default mongoose.model('Merchant', merchantSchema);

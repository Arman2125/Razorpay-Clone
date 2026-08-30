import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, unique: true, index: true, required: true },
    merchantId: { type: String, index: true, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    company: { type: String },
  },
  { timestamps: true }
);

customerSchema.index({ merchantId: 1, name: 1 });

export default mongoose.model('Customer', customerSchema);

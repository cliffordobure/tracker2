import mongoose from 'mongoose';

const platformInvoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceNo: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '', trim: true },
    plan: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES', trim: true },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'void'],
      default: 'sent',
      index: true,
    },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

platformInvoiceSchema.index({ createdAt: -1 });

export const PlatformInvoice = mongoose.model('PlatformInvoice', platformInvoiceSchema);

import mongoose from 'mongoose';

const feeLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    total: { type: Number, required: true, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const feePaymentSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    description: { type: String, required: true, trim: true },
    method: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const feeUpcomingSchema = new mongoose.Schema(
  {
    dueDate: { type: Date, required: true },
    description: { type: String, required: true, trim: true },
    subtitle: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const feeStatementSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null },
    termLabel: { type: String, default: '', trim: true },
    year: { type: Number, default: null },
    currency: { type: String, default: 'KES', trim: true },
    nextDueDate: { type: Date, default: null },
    lines: { type: [feeLineSchema], default: [] },
    payments: { type: [feePaymentSchema], default: [] },
    upcoming: { type: [feeUpcomingSchema], default: [] },
    note: { type: String, default: '', trim: true },
    statementUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

feeStatementSchema.index({ kidId: 1, termId: 1 });

export const FeeStatement = mongoose.model('FeeStatement', feeStatementSchema);

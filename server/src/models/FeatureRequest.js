import mongoose from 'mongoose';

const featureRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ['open', 'planned', 'done', 'declined'],
      default: 'open',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

featureRequestSchema.index({ createdAt: -1 });

export const FeatureRequest = mongoose.model('FeatureRequest', featureRequestSchema);

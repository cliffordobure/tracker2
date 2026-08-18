import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'raw' },
    originalName: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    format: { type: String, default: '' },
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    subject: { type: String, default: '', trim: true },
    grade: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    dueDate: { type: Date, default: null },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    media: { type: [mediaSchema], default: [] },
    allowLateSubmission: { type: Boolean, default: true },
    showMarks: { type: Boolean, default: true },
    rubric: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: '', trim: true, maxlength: 160 },
      body: { type: String, default: '', trim: true, maxlength: 2000 },
    },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Assignment = mongoose.model('Assignment', assignmentSchema);

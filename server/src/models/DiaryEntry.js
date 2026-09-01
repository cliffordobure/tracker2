import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    originalName: { type: String, default: '' },
    bytes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const diaryCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: 'Parent', trim: true },
    authorRole: { type: String, default: 'Parent', trim: true },
    authorPhotoUrl: { type: String, default: '' },
    body: { type: String, default: '', trim: true, maxlength: 800 },
    media: { type: [mediaSchema], default: [] },
  },
  { timestamps: true }
);

const parentSignatureSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true },
    parentName: { type: String, default: 'Parent', trim: true },
    signedAt: { type: Date, default: Date.now },
    device: { type: String, default: '', trim: true, maxlength: 80 },
  },
  { timestamps: false }
);

const diaryEntrySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 4000 },
    label: {
      type: String,
      enum: [
        'general',
        'class',
        'activity',
        'meal',
        'academic',
        'health',
        'lesson',
        'behaviour',
        'homework',
        'observation',
        'achievement',
        'communication',
        'notice',
        'reminder',
        'incident',
      ],
      default: 'general',
    },
    topic: { type: String, default: '', trim: true, maxlength: 160 },
    lessonSummary: { type: String, default: '', trim: true, maxlength: 2000 },
    learningActivity: { type: String, default: '', trim: true, maxlength: 2000 },
    teacherObservation: { type: String, default: '', trim: true, maxlength: 2000 },
    category: { type: String, default: '', trim: true, maxlength: 60 },
    severity: { type: String, enum: ['', 'low', 'medium', 'high'], default: '' },
    actionTaken: { type: String, default: '', trim: true, maxlength: 400 },
    visibilityParents: { type: Boolean, default: true },
    visibilityStudents: { type: Boolean, default: true },
    notifyParent: { type: Boolean, default: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
    grade: { type: String, default: '', trim: true },
    kidIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Kid' }],
    media: { type: [mediaSchema], default: [] },
    private: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    learningObjectives: { type: String, default: '', trim: true, maxlength: 500 },
    subjects: { type: [String], default: [] },
    durationMinutes: { type: Number, default: 0, min: 0, max: 240 },
    engagement: { type: Number, default: 0, min: 0, max: 5 },
    time: { type: String, default: '', trim: true, maxlength: 8 },
    homework: {
      enabled: { type: Boolean, default: false },
      title: { type: String, default: '', trim: true, maxlength: 160 },
      dueDate: { type: Date, default: null },
      assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    },
    homeworkItems: { type: [String], default: [] },
    highlights: {
      participation: { type: String, default: '', trim: true, maxlength: 40 },
      academic: { type: String, default: '', trim: true, maxlength: 40 },
      behaviour: { type: String, default: '', trim: true, maxlength: 40 },
    },
    comments: { type: [diaryCommentSchema], default: [] },
    parentSignatures: { type: [parentSignatureSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

diaryEntrySchema.index({ schoolId: 1, date: -1, createdAt: -1 });

export const DiaryEntry = mongoose.model('DiaryEntry', diaryEntrySchema);

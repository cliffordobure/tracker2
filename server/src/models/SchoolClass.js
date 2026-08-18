import mongoose from 'mongoose';

const classNoteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },
    date: { type: Date, default: Date.now },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    teacherName: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

const timetableSlotSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true,
    },
    startTime: { type: String, default: '08:00' },
    endTime: { type: String, default: '08:40' },
    subject: { type: String, default: '', trim: true },
    room: { type: String, default: '', trim: true },
    kind: { type: String, enum: ['lesson', 'break', 'lunch'], default: 'lesson' },
    periodLabel: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const classSubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    teacherName: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const schoolClassSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    grade: { type: String, required: true, trim: true },
    classCode: { type: String, default: '', trim: true },
    classroom: { type: String, default: '', trim: true },
    section: { type: String, default: '', trim: true },
    academicYear: { type: String, default: '', trim: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assistantName: { type: String, default: '', trim: true },
    capacity: { type: Number, default: 30, min: 1, max: 80 },
    description: { type: String, default: '', trim: true, maxlength: 1200 },
    subjects: { type: [classSubjectSchema], default: [] },
    timetable: { type: [timetableSlotSchema], default: [] },
    timetableNotes: { type: [String], default: [] },
    notes: { type: [classNoteSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

schoolClassSchema.index({ schoolId: 1, grade: 1 }, { unique: true });

export const SchoolClass = mongoose.model('SchoolClass', schoolClassSchema);

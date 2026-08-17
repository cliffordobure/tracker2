import mongoose from 'mongoose';

const attendanceRecordSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    kidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kid', required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      required: true,
    },
    note: { type: String, default: '', trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

attendanceRecordSchema.index({ kidId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ schoolId: 1, date: 1 });

export const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);

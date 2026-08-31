import mongoose from 'mongoose';

const kidSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },
    parentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    homeStopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stop' },
    grade: { type: String, default: '' },
    house: { type: String, default: '' },
    section: { type: String, default: '', trim: true },
    academicYear: { type: String, default: '', trim: true },
    yearOfAdmission: { type: String, default: '', trim: true },
    admissionNo: { type: String, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['', 'male', 'female', 'other'], default: '' },
    bloodGroup: { type: String, default: '', trim: true, maxlength: 8 },
    rollNo: { type: String, default: '', trim: true, maxlength: 20 },
    relationship: { type: String, default: '', trim: true },
    allergies: { type: String, default: '', trim: true, maxlength: 200 },
    schoolEmail: { type: String, default: '', trim: true },
    schoolPhone: { type: String, default: '', trim: true },
    schoolAddress: { type: String, default: '', trim: true, maxlength: 200 },
    term: { type: String, default: '', trim: true },
    stream: { type: String, default: '', trim: true },
    subjects: { type: [String], default: [] },
    extracurricular: { type: String, default: '', trim: true, maxlength: 200 },
    achievements: { type: String, default: '', trim: true, maxlength: 200 },
    documents: {
      type: [
        {
          url: { type: String, default: '' },
          publicId: { type: String, default: '' },
          originalName: { type: String, default: '' },
          mimeType: { type: String, default: '' },
          kind: { type: String, default: '', trim: true, maxlength: 40 },
          bytes: { type: Number, default: 0, min: 0 },
          uploadedBy: { type: String, enum: ['school', 'parent'], default: 'school' },
        },
      ],
      default: [],
    },
    health: {
      conditions: { type: String, default: '', trim: true, maxlength: 200 },
      medication: { type: String, default: '', trim: true, maxlength: 200 },
      doctor: { type: String, default: '', trim: true, maxlength: 80 },
      hospital: { type: String, default: '', trim: true, maxlength: 120 },
      insurance: { type: String, default: '', trim: true, maxlength: 80 },
      policyNumber: { type: String, default: '', trim: true, maxlength: 40 },
      notes: { type: String, default: '', trim: true, maxlength: 800 },
      immunizations: {
        type: [
          {
            name: { type: String, required: true, trim: true, maxlength: 120 },
            date: { type: Date, default: null },
            status: { type: String, default: 'up_to_date', trim: true, maxlength: 40 },
          },
        ],
        default: [],
      },
    },
    about: { type: String, default: '', trim: true, maxlength: 800 },
    photoUrl: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Kid = mongoose.model('Kid', kidSchema);

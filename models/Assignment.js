const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    assignedTo: {
      name: { type: String, required: true, trim: true },
      email: { type: String, trim: true, lowercase: true },
      department: { type: String, trim: true },
    },
    assignedDate: { type: Date, default: Date.now },
    returnDate: { type: Date, default: null },
    status: { type: String, enum: ['active', 'returned'], default: 'active', index: true },
    conditionOnAssign: { type: String, trim: true },
    conditionOnReturn: { type: String, trim: true },
    notes: { type: String, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Assignment', assignmentSchema);

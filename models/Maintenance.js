const mongoose = require('mongoose');

/**
 * ASSUMPTIONS — adjust to match your real schema:
 * - Asset model at '../models/Asset' with a `status` field (see assignmentController for the
 *   same assumption). This module sets it to 'In Repair' while a maintenance record is open.
 * - Auth middleware attaches req.user with at least { _id, name }
 */

const maintenanceSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['Repair', 'Scheduled Service', 'Inspection', 'Upgrade', 'Other'],
      default: 'Repair',
    },
    title: { type: String, required: true, trim: true }, // e.g. "Screen replacement"
    description: { type: String, trim: true },
    vendor: { type: String, trim: true }, // service provider / internal team
    cost: { type: Number, min: 0 },
    startDate: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date }, // for Scheduled/Inspection types
    completedDate: { type: Date },
    status: {
      type: String,
      enum: ['Open', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Open',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

maintenanceSchema.methods.computeStatus = function () {
  if (['Completed', 'Cancelled'].includes(this.status)) return this.status;
  if (this.dueDate && new Date() > this.dueDate) return 'Overdue';
  return this.status;
};

maintenanceSchema.index({ title: 'text', vendor: 'text' });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
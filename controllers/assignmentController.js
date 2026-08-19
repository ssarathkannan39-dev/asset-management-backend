const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { recordAudit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/assignments?status=active&page=&limit=
const list = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Assignment.find(filter)
      .sort('-assignedDate')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({ path: 'asset', select: 'assetTag name category status' }),
    Assignment.countDocuments(filter),
  ]);

  res.json({ items, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});

// Assign an available asset to a person
const create = asyncHandler(async (req, res) => {
  const { asset: assetId, assignedTo, conditionOnAssign, notes } = req.body;

  const asset = await Asset.findById(assetId);
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status !== 'available') {
    throw new ConflictError(`Asset is currently "${asset.status}" and cannot be assigned`);
  }

  const assignment = await Assignment.create({
    asset: asset._id,
    assignedTo,
    conditionOnAssign,
    notes,
    assignedBy: req.user._id, 
  });

  asset.status = 'assigned';
  asset.currentAssignment = assignment._id;
  await asset.save();

  await recordAudit({
    req,
    action: 'assign',
    entityType: 'Assignment',
    entityId: assignment._id,
    entityLabel: `${asset.assetTag} -> ${assignedTo.name}`,
    changes: { after: assignment.toObject() },
  });

  res.status(201).json({ assignment });
});

// Mark an active assignment as returned and free up the asset
const markReturned = asyncHandler(async (req, res) => {
  const { conditionOnReturn, notes } = req.body;

  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) throw new NotFoundError('Assignment not found');
  if (assignment.status === 'returned') throw new ConflictError('This assignment was already returned');

  assignment.status = 'returned';
  assignment.returnDate = new Date();
  assignment.conditionOnReturn = conditionOnReturn;
  if (notes) assignment.notes = `${assignment.notes ? assignment.notes + '\n' : ''}${notes}`;
  assignment.returnedBy = req.user._id;
  await assignment.save();

  const asset = await Asset.findById(assignment.asset);
  if (asset) {
    asset.status = 'available';
    asset.currentAssignment = null;
    await asset.save();
  }

  await recordAudit({
    req,
    action: 'return',
    entityType: 'Assignment',
    entityId: assignment._id,
    entityLabel: asset ? asset.assetTag : String(assignment.asset),
    changes: { after: assignment.toObject() },
  });

  res.json({ assignment });
});

module.exports = { list, create, markReturned };

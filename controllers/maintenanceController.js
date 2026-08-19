const MaintenanceRecord = require('../models/MaintenanceRecord');
const Asset = require('../models/Asset');
const { NotFoundError } = require('../utils/errors');
const { recordAudit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { status, asset, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (asset) filter.asset = asset;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    MaintenanceRecord.find(filter)
      .sort('-createdAt')
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({ path: 'asset', select: 'assetTag name category status' }),
    MaintenanceRecord.countDocuments(filter),
  ]);

  res.json({ items, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
});

const create = asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.body.asset);
  if (!asset) throw new NotFoundError('Asset not found');

  const record = await MaintenanceRecord.create({ ...req.body, createdBy: req.user._id });

  // Put the asset into maintenance if the work is active/scheduled.
  if (['scheduled', 'in_progress'].includes(record.status) && asset.status !== 'assigned') {
    asset.status = 'in_maintenance';
    await asset.save();
  }

  await recordAudit({
    req,
    action: 'maintenance_add',
    entityType: 'MaintenanceRecord',
    entityId: record._id,
    entityLabel: asset.assetTag,
    changes: { after: record.toObject() },
  });

  res.status(201).json({ record });
});

const update = asyncHandler(async (req, res) => {
  const record = await MaintenanceRecord.findById(req.params.id);
  if (!record) throw new NotFoundError('Maintenance record not found');

  const before = record.toObject();
  Object.assign(record, req.body);  
  await record.save();

  // If work just completed, return the asset to available (unless it's assigned elsewhere).
  if (record.status === 'completed') {
    const asset = await Asset.findById(record.asset);
    if (asset && asset.status === 'in_maintenance') {
      asset.status = 'available';
      await asset.save();
    }
  }

  await recordAudit({
    req,  
    action: 'maintenance_update',
    entityType: 'MaintenanceRecord',
    entityId: record._id,
    changes: { before, after: record.toObject() },
  });

  res.json({ record });
});

module.exports = { list, create, update };

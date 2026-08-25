const Maintenance = require('../models/Maintenance');
const Asset = require('../models/Asset'); // ASSUMPTION: path/name of your Asset model
const { notifyCurrentAssignee, notifySafely } = require('../utils/notifications');

// GET /api/maintenance?status=Open&search=screen&page=1&limit=20
exports.getMaintenanceRecords = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      if (status === 'overdue') {
        query.status = { $nin: ['Completed', 'Cancelled'] };
        query.dueDate = { $lt: new Date() };
      } else {
        query.status = status;
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { vendor: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Maintenance.find(query)
        .populate('asset', 'name assetTag category status')
        .populate('createdBy', 'name')
        .populate('completedBy', 'name')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Maintenance.countDocuments(query),
    ]);

    const data = items.map((doc) => {
      const obj = doc.toObject();
      obj.status = doc.computeStatus();
      return obj;
    });

    res.json({
      data,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/maintenance/:id
exports.getMaintenanceRecord = async (req, res, next) => {
  try {
    const record = await Maintenance.findById(req.params.id)
      .populate('asset')
      .populate('createdBy', 'name')
      .populate('completedBy', 'name');

    if (!record) return res.status(404).json({ message: 'Maintenance record not found' });
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// POST /api/maintenance
// body: { assetId, type, title, description, vendor, cost, startDate, dueDate, status }
exports.createMaintenanceRecord = async (req, res, next) => {
  try {
    const { assetId, type, title, description, vendor, cost, startDate, dueDate, status } = req.body;

    if (!assetId || !title) {
      return res.status(400).json({ message: 'assetId and title are required' });
    }

    const asset = await Asset.findById(assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const record = await Maintenance.create({
      asset: assetId,
      type,
      title,
      description,
      vendor,
      cost,
      startDate: startDate || undefined,
      dueDate: dueDate || undefined,
      status: status || 'Open',
      createdBy: req.user?._id,
    });

    // Reflect an active repair on the asset itself; leave 'Scheduled'/future inspections alone.
    if (['Open', 'In Progress'].includes(record.status)) {
      asset.status = 'in_maintenance';
      await asset.save();
    }

    const populated = await record.populate('asset', 'name assetTag category status');
    await notifySafely(() => notifyCurrentAssignee({
      assetId,
      type: 'maintenance',
      title: 'Maintenance logged for your asset',
      message: `${populated.asset?.assetTag || 'Your asset'} has a new maintenance record: ${record.title}.`,
      entityType: 'Maintenance',
      entityId: record._id,
    }));
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/maintenance/:id
// body: any updatable field, typically { status, notes, cost, completedDate }
exports.updateMaintenanceRecord = async (req, res, next) => {
  try {
    const record = await Maintenance.findById(req.params.id).populate('asset');
    if (!record) return res.status(404).json({ message: 'Maintenance record not found' });

    const editable = ['type', 'title', 'description', 'vendor', 'cost', 'dueDate', 'status', 'notes'];
    editable.forEach((field) => {
      if (req.body[field] !== undefined) record[field] = req.body[field];
    });

    if (req.body.status === 'Completed' && !record.completedDate) {
      record.completedDate = new Date();
      record.completedBy = req.user?._id;
    }

    await record.save();

    // Sync asset status: back to Available once the last open repair is resolved.
    if (record.asset && ['Completed', 'Cancelled'].includes(record.status)) {
      const stillOpen = await Maintenance.exists({
        asset: record.asset._id,
        status: { $in: ['Open', 'In Progress'] },
        _id: { $ne: record._id },
      });
      if (!stillOpen && record.asset.status === 'in_maintenance') {
        record.asset.status = 'available';
        await record.asset.save();
      }
    } else if (record.asset && ['Open', 'In Progress'].includes(record.status)) {
      record.asset.status = 'in_maintenance';
      await record.asset.save();
    }

    if (['Completed', 'Cancelled'].includes(record.status)) {
      await notifySafely(() => notifyCurrentAssignee({
        assetId: record.asset?._id,
        type: 'maintenance',
        title: `Maintenance ${record.status.toLowerCase()}`,
        message: `${record.title} for ${record.asset?.assetTag || 'your asset'} was ${record.status.toLowerCase()} by ${req.user.name}.`,
        entityType: 'Maintenance',
        entityId: record._id,
      }));
    }
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/maintenance/:id
exports.deleteMaintenanceRecord = async (req, res, next) => {
  try {
    const record = await Maintenance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Maintenance record not found' });
    res.json({ message: 'Maintenance record deleted' });
  } catch (err) {
    next(err);
  }
};
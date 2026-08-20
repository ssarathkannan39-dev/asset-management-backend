const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset'); // ASSUMPTION: path/name of your Asset model

// GET /api/assignments?status=assigned&search=john&page=1&limit=20
exports.getAssignments = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      if (status === 'overdue') {
        query.status = { $ne: 'returned' };
        query.dueDate = { $lt: new Date() };
      } else {
        query.status = status;
      }
    }

    if (search) {
      query.$or = [
        { 'assignedTo.name': { $regex: search, $options: 'i' } },
        { 'assignedTo.email': { $regex: search, $options: 'i' } },
        { 'assignedTo.department': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Assignment.find(query)
        .populate('asset', 'name assetTag category status')
        .populate('checkedOutBy', 'name')
        .populate('checkedInBy', 'name')
        .sort({ checkoutDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Assignment.countDocuments(query),
    ]);

    // Normalize computed "overdue" status for display without mutating stale docs.
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

// GET /api/assignments/:id
exports.getAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('asset')
      .populate('checkedOutBy', 'name')
      .populate('checkedInBy', 'name');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    next(err);
  }
};

// POST /api/assignments/checkout
// body: { assetId, assignedTo: { name, email, department }, dueDate, conditionOut, notes }
exports.checkoutAsset = async (req, res, next) => {
  try {
    const { assetId, assignedTo, dueDate, conditionOut, notes } = req.body;

    if (!assetId || !assignedTo?.name) {
      return res.status(400).json({ message: 'assetId and assignedTo.name are required' });
    }

    const asset = await Asset.findById(assetId);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    if (asset.status && asset.status !== 'available') {
      return res.status(409).json({ message: `Asset is currently "${asset.status}" and cannot be checked out` });
    }

    const assignment = await Assignment.create({
      asset: assetId,
      assignedTo,
      checkedOutBy: req.user?._id,
      dueDate: dueDate || undefined,
      conditionOut,
      notes,
      status: 'assigned',
    });

    // Reflect the checkout on the asset itself.
    asset.status = 'assigned';
    asset.currentAssignment = assignment._id;
    await asset.save();

    const populated = await assignment.populate('asset', 'name assetTag category status');
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/assignments/:id/checkin
// body: { conditionIn, notes }
exports.checkinAsset = async (req, res, next) => {
  try {
    const { conditionIn, notes } = req.body;

    const assignment = await Assignment.findById(req.params.id).populate('asset');
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.status === 'returned') {
      return res.status(409).json({ message: 'This assignment has already been checked in' });
    }

    assignment.status = 'returned';
    assignment.checkinDate = new Date();
    assignment.checkedInBy = req.user?._id;
    if (conditionIn) assignment.conditionIn = conditionIn;
    if (notes) assignment.notes = notes;
    await assignment.save();

    if (assignment.asset) {
      assignment.asset.status = 'available';
      assignment.asset.currentAssignment = null;
      await assignment.asset.save();
    }

    res.json(assignment);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/assignments/:id  (correcting a mis-logged entry, not a normal check-in)
exports.deleteAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    next(err);
  }
};
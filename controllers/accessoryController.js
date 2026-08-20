const Accessory = require('../models/Accessory');

// GET /api/accessories?status=Low Stock&search=dock&page=1&limit=20
exports.getAccessories = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Accessory.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)),
      Accessory.countDocuments(query),
    ]);

    let data = items.map((doc) => {
      const obj = doc.toObject({ virtuals: true });
      obj.status = doc.computeStatus();
      return obj;
    });

    if (status && status !== 'all') {
      data = data.filter((a) => a.status === status);
    }

    res.json({
      data,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/accessories/:id
exports.getAccessory = async (req, res, next) => {
  try {
    const accessory = await Accessory.findById(req.params.id);
    if (!accessory) return res.status(404).json({ message: 'Accessory not found' });
    res.json(accessory);
  } catch (err) {
    next(err);
  }
};

// POST /api/accessories
exports.createAccessory = async (req, res, next) => {
  try {
    const { name, category, manufacturer, modelNumber, totalQty, minQty, purchaseDate, cost, notes } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });

    const accessory = await Accessory.create({
      name,
      category,
      manufacturer,
      modelNumber,
      totalQty: totalQty ?? 0,
      minQty: minQty ?? 0,
      purchaseDate: purchaseDate || undefined,
      cost,
      notes,
    });

    res.status(201).json(accessory);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/accessories/:id
exports.updateAccessory = async (req, res, next) => {
  try {
    const editable = ['name', 'category', 'manufacturer', 'modelNumber', 'totalQty', 'minQty', 'purchaseDate', 'cost', 'notes'];
    const updates = {};
    editable.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const accessory = await Accessory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!accessory) return res.status(404).json({ message: 'Accessory not found' });
    res.json(accessory);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/accessories/:id
exports.deleteAccessory = async (req, res, next) => {
  try {
    const accessory = await Accessory.findByIdAndDelete(req.params.id);
    if (!accessory) return res.status(404).json({ message: 'Accessory not found' });
    res.json({ message: 'Accessory deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/accessories/:id/checkout
// body: { name, email, department, quantity, notes }
exports.checkoutAccessory = async (req, res, next) => {
  try {
    const { name, email, department, quantity, notes } = req.body;
    const qty = Number(quantity) || 1;

    if (!name) return res.status(400).json({ message: 'assignedTo.name is required' });

    const accessory = await Accessory.findById(req.params.id);
    if (!accessory) return res.status(404).json({ message: 'Accessory not found' });

    const checkedOut = accessory.checkouts
      .filter((c) => !c.checkinDate)
      .reduce((sum, c) => sum + c.quantity, 0);

    if (qty > accessory.totalQty - checkedOut) {
      return res.status(409).json({ message: 'Not enough stock available for that quantity' });
    }

    accessory.checkouts.push({
      assignedTo: { name, email, department },
      quantity: qty,
      checkedOutBy: req.user?._id,
      notes,
    });
    await accessory.save();

    res.status(201).json(accessory);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/accessories/:id/checkouts/:checkoutId/checkin
exports.checkinAccessory = async (req, res, next) => {
  try {
    const accessory = await Accessory.findById(req.params.id);
    if (!accessory) return res.status(404).json({ message: 'Accessory not found' });

    const checkout = accessory.checkouts.id(req.params.checkoutId);
    if (!checkout) return res.status(404).json({ message: 'Checkout record not found' });
    if (checkout.checkinDate) {
      return res.status(409).json({ message: 'This checkout has already been returned' });
    }

    checkout.checkinDate = new Date();
    checkout.checkedInBy = req.user?._id;
    await accessory.save();

    res.json(accessory);
  } catch (err) {
    next(err);
  }
};
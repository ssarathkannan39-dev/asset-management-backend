const Consumable = require('../models/Consumable');

// GET /api/consumables?status=Low Stock&search=toner&page=1&limit=20
exports.getConsumables = async (req, res, next) => {
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
      Consumable.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)),
      Consumable.countDocuments(query),
    ]);

    let data = items.map((doc) => {
      const obj = doc.toObject({ virtuals: true });
      obj.status = doc.computeStatus();
      return obj;
    });

    if (status && status !== 'all') {
      data = data.filter((c) => c.status === status);
    }

    res.json({
      data,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/consumables/:id
exports.getConsumable = async (req, res, next) => {
  try {
    const consumable = await Consumable.findById(req.params.id);
    if (!consumable) return res.status(404).json({ message: 'Consumable not found' });
    res.json(consumable);
  } catch (err) {
    next(err);
  }
};

// POST /api/consumables
exports.createConsumable = async (req, res, next) => {
  try {
    const { name, category, manufacturer, modelNumber, totalQty, minQty, purchaseDate, cost, notes } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });

    const consumable = await Consumable.create({
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

    res.status(201).json(consumable);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/consumables/:id
// Also used to restock — pass a higher totalQty.
exports.updateConsumable = async (req, res, next) => {
  try {
    const editable = ['name', 'category', 'manufacturer', 'modelNumber', 'totalQty', 'minQty', 'purchaseDate', 'cost', 'notes'];
    const updates = {};
    editable.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const consumable = await Consumable.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!consumable) return res.status(404).json({ message: 'Consumable not found' });
    res.json(consumable);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/consumables/:id
exports.deleteConsumable = async (req, res, next) => {
  try {
    const consumable = await Consumable.findByIdAndDelete(req.params.id);
    if (!consumable) return res.status(404).json({ message: 'Consumable not found' });
    res.json({ message: 'Consumable deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/consumables/:id/issue
// body: { name, email, department, quantity, notes }
exports.issueConsumable = async (req, res, next) => {
  try {
    const { name, email, department, quantity, notes } = req.body;
    const qty = Number(quantity) || 1;

    if (!name) return res.status(400).json({ message: 'assignedTo.name is required' });

    const consumable = await Consumable.findById(req.params.id);
    if (!consumable) return res.status(404).json({ message: 'Consumable not found' });

    const issued = consumable.issues.reduce((sum, i) => sum + i.quantity, 0);
    if (qty > consumable.totalQty - issued) {
      return res.status(409).json({ message: 'Not enough stock available for that quantity' });
    }

    consumable.issues.push({
      assignedTo: { name, email, department },
      quantity: qty,
      issuedBy: req.user?._id,
      notes,
    });
    await consumable.save();

    res.status(201).json(consumable);
  } catch (err) {
    next(err);
  }
};
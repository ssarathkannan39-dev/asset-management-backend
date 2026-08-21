const User = require('../models/User');
const { ValidationError, ConflictError, NotFoundError } = require('../utils/errors');

function safeUser(user) {
  return user.toSafeJSON();
}

exports.list = async (req, res, next) => {
  try {
    const { search, role, active } = req.query;
    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (active !== undefined && active !== 'all') filter.active = active === 'true';
    if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json({ users: users.map(safeUser), total: users.length });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, email, password, role = 'asset_user' } = req.body;
    if (!name || name.trim().length < 2) throw new ValidationError('Name must be at least 2 characters');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('A valid email is required');
    if (!password || password.length < 8) throw new ValidationError('Password must be at least 8 characters');
    if (!['asset_user', 'admin', 'superadmin'].includes(role)) throw new ValidationError('Invalid user role');
    if (await User.exists({ email: email.toLowerCase().trim() })) throw new ConflictError('An account with this email already exists');
    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password, role });
    res.status(201).json({ user: safeUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) throw new NotFoundError('User not found');
    if (user._id.equals(req.user._id) && req.body.active === false) throw new ValidationError('You cannot disable your own account');
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2) throw new ValidationError('Name must be at least 2 characters');
      user.name = req.body.name.trim();
    }
    if (req.body.email !== undefined) {
      const email = req.body.email.toLowerCase().trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('A valid email is required');
      const duplicate = await User.findOne({ email, _id: { $ne: user._id } });
      if (duplicate) throw new ConflictError('An account with this email already exists');
      user.email = email;
    }
    if (req.body.role !== undefined) {
      if (!['asset_user', 'admin', 'superadmin'].includes(req.body.role)) throw new ValidationError('Invalid user role');
      if (user._id.equals(req.user._id) && req.body.role !== 'superadmin') throw new ValidationError('You cannot remove your own superadmin role');
      user.role = req.body.role;
    }
    if (req.body.active !== undefined) user.active = Boolean(req.body.active);
    if (req.body.password !== undefined) {
      if (req.body.password.length < 8) throw new ValidationError('Password must be at least 8 characters');
      user.password = req.body.password;
      user.refreshTokenVersion += 1;
    }
    await user.save();
    res.json({ user: safeUser(user) });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) throw new ValidationError('You cannot delete your own account');
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw new NotFoundError('User not found');
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

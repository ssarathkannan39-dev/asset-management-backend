const User = require('../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/tokens');
const { UnauthorizedError, ConflictError } = require('../utils/errors');
const { recordAudit } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');

const REFRESH_COOKIE = 'refresh_token';
const cookieOpts = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth',
});

// Only intended for bootstrapping the very first admin account.
// In production, gate this behind an existing-superadmin check or disable it after setup.
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw new ConflictError('An account with this email already exists');

  const userCount = await User.countDocuments();
  // First user in the system becomes superadmin automatically.
  const assignedRole = userCount === 0 ? 'superadmin' : role || 'admin';

  const user = await User.create({ name, email, password, role: assignedRole });

  await recordAudit({ req: { ...req, user }, action: 'create', entityType: 'User', entityId: user._id, entityLabel: user.email });

  res.status(201).json({ user: user.toSafeJSON() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    await recordAudit({ req, action: 'login_failed', entityType: 'Auth', entityLabel: email });
    throw new UnauthorizedError('Invalid email or password');
  }
  if (!user.active) throw new UnauthorizedError('Account is disabled'); 

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
  await recordAudit({ req: { ...req, user }, action: 'login', entityType: 'Auth', entityId: user._id, entityLabel: user.email });

  res.json({ accessToken, user: user.toSafeJSON() });
});


const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new UnauthorizedError('Missing refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);  
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active || user.refreshTokenVersion !== payload.v) {
    throw new UnauthorizedError('Refresh token no longer valid');
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  res.cookie(REFRESH_COOKIE, newRefreshToken, cookieOpts());

  res.json({ accessToken, user: user.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  if (req.user) {
    await recordAudit({ req, action: 'logout', entityType: 'Auth', entityId: req.user._id, entityLabel: req.user.email });
  }
  res.status(204).send();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = { register, login, refresh, logout, me };

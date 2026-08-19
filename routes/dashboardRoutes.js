const express = require('express');
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const MaintenanceRecord = require('../models/MaintenanceRecord');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [byStatus, byCategory, totalValueAgg, activeAssignments, upcomingMaintenance, expiringWarranties] = await Promise.all([
      Asset.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Asset.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Asset.aggregate([{ $group: { _id: null, total: { $sum: '$purchaseCost' } } }]),
      Assignment.countDocuments({ status: 'active' }),
      MaintenanceRecord.countDocuments({ status: { $in: ['scheduled', 'in_progress'] } }),
      Asset.countDocuments({ warrantyExpiry: { $ne: null, $lte: thirtyDaysFromNow, $gte: new Date() } }),
    ]);

    res.json({
      byStatus,
      byCategory,
      totalAssetValue: totalValueAgg[0]?.total || 0,
      activeAssignments,
      upcomingMaintenance,
      expiringWarranties,
      totalAssets: byStatus.reduce((sum, s) => sum + s.count, 0),
    });
  })
);

module.exports = router;

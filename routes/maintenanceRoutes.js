const express = require('express');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { createMaintenanceSchema, updateMaintenanceSchema } = require('../utils/schemas');
const maintenanceController = require('../controllers/maintenanceController');

const router = express.Router();

router.use(requireAuth);

router.get('/', maintenanceController.list);
router.post('/', validate(createMaintenanceSchema), maintenanceController.create);
router.put('/:id', validate(updateMaintenanceSchema), maintenanceController.update);

module.exports = router;

const express = require('express');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { createAssignmentSchema, returnAssignmentSchema } = require('../utils/schemas');
const assignmentController = require('../controllers/assignmentController');

const router = express.Router();

router.use(requireAuth);

router.get('/', assignmentController.list);
router.post('/', validate(createAssignmentSchema), assignmentController.create);
router.put('/:id/return', validate(returnAssignmentSchema), assignmentController.markReturned);

module.exports = router;

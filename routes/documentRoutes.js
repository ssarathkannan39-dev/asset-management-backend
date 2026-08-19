const express = require('express');
const { requireAuth } = require('../middleware/auth');
const documentController = require('../controllers/documentController');

const router = express.Router();

router.use(requireAuth);

// GET /api/documents?category=&search=&page=&limit=
router.get('/', documentController.listAll);

module.exports = router;
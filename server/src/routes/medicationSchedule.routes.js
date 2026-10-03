const express = require('express');
const controller = require('../controllers/lichUongThuoc.controller');
const authMiddleware = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authMiddleware);
router.patch('/:id/confirm', controller.confirmMine);

module.exports = router;

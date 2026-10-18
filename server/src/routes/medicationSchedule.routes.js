const express = require('express');
const controller = require('../controllers/lichUongThuoc.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { loadMobileScope } = require('../middlewares/mobile-scope.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(loadMobileScope);
router.patch('/:id/confirm', controller.confirmMine);

module.exports = router;

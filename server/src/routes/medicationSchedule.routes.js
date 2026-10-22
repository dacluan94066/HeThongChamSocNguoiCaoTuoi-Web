const express = require('express');
const controller = require('../controllers/lichUongThuoc.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const { supplement } = require('../controllers/medicationSupplement.controller');

const router = express.Router();

router.use(authMiddleware);
router.patch('/:id/confirm', checkPermission('QLLICHUONGTHUOC','sua'), controller.confirmMine);
router.patch('/:id/supplement', checkPermission('QLLICHUONGTHUOC','sua'), supplement);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/chiSoSucKhoe.controller');
const { checkPermission } = require('../middlewares/permission.middleware');

router.get('/', auth, checkPermission('QLCHISOSK', 'xem'), controller.getMetricTypes);

module.exports = router;

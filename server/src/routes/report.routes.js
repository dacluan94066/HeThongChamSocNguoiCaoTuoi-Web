const express = require('express');
const auth = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const { getHealthSummary } = require('../controllers/report.controller');

const router = express.Router();

router.use(auth);
router.get('/health-summary', checkPermission('QLBAOCAO', 'xem'), getHealthSummary);

module.exports = router;

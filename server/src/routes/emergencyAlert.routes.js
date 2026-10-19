const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/emergencyAlert.controller');
const {loadMobileScope,guardResource,caregiverOnlyWrite}=require('../middlewares/mobile-scope.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');

const router = express.Router();
router.get('/',auth,loadMobileScope,checkPermission('QLCANHBAO','xem'),controller.getMine);
router.post('/',auth,checkPermission('QLCANHBAO','them'),controller.create);
router.patch('/:id/seen',auth,loadMobileScope,caregiverOnlyWrite,checkPermission('QLCANHBAO','sua'),guardResource('CanhBaoKhanCap','CanhBaoKhanCapID'),controller.markSeen);
router.patch('/:id/resolve',auth,loadMobileScope,caregiverOnlyWrite,checkPermission('QLCANHBAO','sua'),guardResource('CanhBaoKhanCap','CanhBaoKhanCapID'),controller.resolve);
module.exports = router;

const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/emergencyAlert.controller');
const {loadMobileScope,guardResource,caregiverOnlyWrite}=require('../middlewares/mobile-scope.middleware');

const router = express.Router();
router.get('/',auth,loadMobileScope,controller.getMine);
router.post('/', auth, controller.create);
router.patch('/:id/seen',auth,loadMobileScope,caregiverOnlyWrite,guardResource('CanhBaoKhanCap','CanhBaoKhanCapID'),controller.markSeen);
router.patch('/:id/resolve',auth,loadMobileScope,caregiverOnlyWrite,guardResource('CanhBaoKhanCap','CanhBaoKhanCapID'),controller.resolve);
module.exports = router;

// routes/nguoiChamSoc.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiChamSoc.controller');
const auth = require('../middlewares/auth.middleware');
const { loadMobileScope, webOnlyWrite } = require('../middlewares/mobile-scope.middleware');
const adminOnly = require('../middlewares/admin.middleware');
const accountProfile = require('../controllers/accountProfile.controller');

router.use(auth);
router.use(loadMobileScope);

router.patch('/:id/link-user', adminOnly, accountProfile.linkCaregiver);
router.post('/:id/user', adminOnly, accountProfile.createCaregiverUser);

router.get('/me/elderly', ctrl.getMyElderly);
router.get('/',    ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/',   webOnlyWrite, ctrl.create);
router.put('/:id', webOnlyWrite, ctrl.update);

module.exports = router;

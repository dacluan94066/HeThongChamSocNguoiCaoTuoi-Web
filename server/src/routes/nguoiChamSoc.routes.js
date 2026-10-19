// routes/nguoiChamSoc.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiChamSoc.controller');
const auth = require('../middlewares/auth.middleware');
const { loadMobileScope, webOnlyWrite } = require('../middlewares/mobile-scope.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const careAssistant = require('../controllers/careAssistant.controller');
const account = require('../controllers/caregiverAccount.controller');

router.use(auth);
router.use(loadMobileScope);
router.get('/me/elderly', checkPermission('QLHOSONCT','xem'), careAssistant.protect, careAssistant.assignedProfiles);
router.get('/',    checkPermission('QLNGUOICHAMSOC', 'xem'), ctrl.getAll);
router.post('/:id/account', webOnlyWrite, checkPermission('QLNGUOIDUNG','them'), account.createWebAccount);
router.post('/:id/account/reset-password', webOnlyWrite, checkPermission('QLNGUOIDUNG','sua'), account.resetWebPassword);
router.get('/:id', checkPermission('QLNGUOICHAMSOC', 'xem'), ctrl.getById);
router.post('/',   webOnlyWrite, checkPermission('QLNGUOICHAMSOC', 'them'), ctrl.create);
router.put('/:id', webOnlyWrite, checkPermission('QLNGUOICHAMSOC', 'sua'), ctrl.update);

module.exports = router;

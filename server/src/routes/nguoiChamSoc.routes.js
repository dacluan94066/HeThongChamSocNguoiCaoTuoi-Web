// routes/nguoiChamSoc.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiChamSoc.controller');
const auth = require('../middlewares/auth.middleware');
const { loadMobileScope, webOnlyWrite } = require('../middlewares/mobile-scope.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const careAssistant = require('../controllers/careAssistant.controller');

router.use(auth);
router.use(loadMobileScope);
router.get('/me/elderly', careAssistant.protect, careAssistant.assignedProfiles);

router.get('/me/elderly', ctrl.getMyElderly);
router.get('/',    checkPermission('QLNGUOICHAMSOC', 'xem'), ctrl.getAll);
router.get('/:id', checkPermission('QLNGUOICHAMSOC', 'xem'), ctrl.getById);
router.post('/',   webOnlyWrite, checkPermission('QLNGUOICHAMSOC', 'them'), ctrl.create);
router.put('/:id', webOnlyWrite, checkPermission('QLNGUOICHAMSOC', 'sua'), ctrl.update);

module.exports = router;

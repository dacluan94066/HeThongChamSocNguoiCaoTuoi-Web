const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/lichKhamBenh.controller');
const auth = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const { loadMobileScope, guardResource, webOnlyWrite } = require('../middlewares/mobile-scope.middleware');
router.use(auth);
router.use(loadMobileScope);
router.get('/', checkPermission('QLLICHKHAM', 'xem'), ctrl.getAll);
router.post('/', webOnlyWrite, checkPermission('QLLICHKHAM', 'them'), ctrl.create);
router.put(
  '/:id',
  webOnlyWrite,
  guardResource('LichKhamBenh', 'LichKhamID'),
  checkPermission('QLLICHKHAM', 'sua'),
  ctrl.update
);
router.patch(
  '/:id/cancel',
  webOnlyWrite,
  guardResource('LichKhamBenh', 'LichKhamID'),
  checkPermission('QLLICHKHAM', 'xoa'),
  ctrl.cancel
);
router.patch(
  '/:id/result',
  webOnlyWrite,
  guardResource('LichKhamBenh', 'LichKhamID'),
  checkPermission('QLLICHKHAM', 'sua'),
  ctrl.recordResult
);
module.exports = router;

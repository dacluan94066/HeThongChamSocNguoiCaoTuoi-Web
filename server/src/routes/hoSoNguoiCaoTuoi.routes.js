// routes/hoSoNguoiCaoTuoi.routes.js - CRUD ho so nguoi cao tuoi
// Tat ca route deu can dang nhap (authMiddleware) va kiem tra quyen (checkPermission)
const express = require('express');
const router = express.Router();
const controller = require('../controllers/hoSoNguoiCaoTuoi.controller');
const healthMetricController = require('../controllers/chiSoSucKhoe.controller');
const medicationScheduleController = require('../controllers/lichUongThuoc.controller');
const prescriptionController = require('../controllers/donThuoc.controller');
const appointmentController = require('../controllers/lichKhamBenh.controller');
const caregiverController = require('../controllers/nguoiChamSoc.controller');
const alertController = require('../controllers/canhBao.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const scope = require('../middlewares/mobile-scope.middleware');

// Mobile roles are already restricted to their own/assigned elderly records by
// guardResource. Web roles continue to use the normal permission matrix.
const checkScopedReadPermission = (req, res, next) => {
  if (scope.isMobileRole(req)) return next();
  return checkPermission('QLHOSONCT', 'xem')(req, res, next);
};

// Tat ca route duoi day deu can xac thuc JWT truoc
router.use(authMiddleware);
router.use(scope.loadMobileScope);

router.get('/me', controller.getMe);
router.put('/me', controller.updateMe);
router.get('/me/caregivers', caregiverController.getMine);
router.get('/me/health-metrics', healthMetricController.getMine);
router.post('/me/health-metrics', healthMetricController.createMine);
router.get('/me/medication-schedule', medicationScheduleController.getMine);
router.get('/me/appointments/upcoming', appointmentController.getUpcomingMine);
router.get('/me/appointments', appointmentController.getMine);
router.get('/me/alerts', alertController.getMine);
router.get(
  '/:id/medication-schedule',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  medicationScheduleController.getByElderly
);
router.get(
  '/:id/health-metrics',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  healthMetricController.getByElderly
);
router.get(
  '/:id/appointments/upcoming',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  appointmentController.getUpcomingByElderly
);
router.get(
  '/:id/alerts',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkScopedReadPermission,
  alertController.getByElderly
);
router.get(
  '/:id/prescriptions',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkPermission('QLLICHUONGTHUOC', 'xem'),
  prescriptionController.getByElderly
);
router.post(
  '/:id/prescriptions',
  scope.webOnlyWrite,
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkPermission('QLLICHUONGTHUOC', 'them'),
  prescriptionController.create
);

// GET /api/elderly         - Lay danh sach (can quyen xem)
router.get(
  '/',
  checkPermission('QLHOSONCT', 'xem'),
  controller.getAll
);

// GET /api/elderly/:id     - Lay chi tiet 1 ho so (can quyen xem)
router.get(
  '/:id',
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkScopedReadPermission,
  controller.getById
);

// POST /api/elderly        - Tao ho so moi (can quyen them)
router.post(
  '/',
  scope.webOnlyWrite,
  checkPermission('QLHOSONCT', 'them'),
  controller.create
);

// PUT /api/elderly/:id/caregiver - Gan nguoi cham soc chinh
router.put(
  '/:id/caregiver',
  scope.webOnlyWrite,
  checkPermission('QLHOSONCT', 'sua'),
  controller.assignCaregiver
);

// PUT /api/elderly/:id     - Cap nhat ho so (can quyen sua)
router.put(
  '/:id',
  scope.caregiverOnlyWrite,
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkPermission('QLHOSONCT', 'sua'),
  controller.update
);

// DELETE /api/elderly/:id  - Xoa mem ho so (can quyen xoa)
router.delete(
  '/:id',
  scope.webOnlyWrite,
  checkPermission('QLHOSONCT', 'xoa'),
  controller.remove
);

module.exports = router;

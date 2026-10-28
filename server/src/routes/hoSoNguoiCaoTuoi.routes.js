// routes/hoSoNguoiCaoTuoi.routes.js - CRUD ho so nguoi cao tuoi
// Tat ca route deu can dang nhap (authMiddleware) va kiem tra quyen (checkPermission)
const express = require('express');
const router = express.Router();
const controller = require('../controllers/hoSoNguoiCaoTuoi.controller');
const healthMetricController = require('../controllers/chiSoSucKhoe.controller');
const medicationScheduleController = require('../controllers/lichUongThuoc.controller');
const prescriptionController = require('../controllers/donThuoc.controller');
const appointmentController = require('../controllers/lichKhamBenh.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const { fail } = require('../utils/response');
const scope = require('../middlewares/mobile-scope.middleware');
const careAssistant = require('../controllers/careAssistant.controller');
const mobileProfile = require('../controllers/mobileProfile.controller');
const mobileOnboarding = require('../controllers/mobileOnboarding.controller');
const ownRelatives = require('../controllers/ownRelatives.controller');

// Mobile roles are already restricted to their own/assigned elderly records by
// guardResource. Web roles continue to use the normal permission matrix.
// Tat ca route duoi day deu can xac thuc JWT truoc
router.use(authMiddleware);
router.use(scope.loadMobileScope);

router.get('/me', checkPermission('QLHOSONCT','xem'), controller.getMe);
router.get('/me/relatives', checkPermission('QLHOSONCT','xem'), ownRelatives.getMine);
// Completing one's own profile is covered by the existing self-edit permission;
// this never grants Mobile permission to create arbitrary elderly records.
router.post('/me', checkPermission('QLHOSONCT','sua'), mobileOnboarding.createMine);
router.get('/me/caregivers', checkPermission('QLNGUOICHAMSOC','xem'), careAssistant.protect, careAssistant.ownCaregivers);
router.get('/me/alerts', checkPermission('QLCANHBAO','xem'), mobileProfile.read('alerts'));
router.get('/me/appointments', checkPermission('QLLICHKHAM','xem'), mobileProfile.read('allAppointments'));
router.get('/me/appointments/upcoming', checkPermission('QLLICHKHAM','xem'), mobileProfile.read('appointments'));
router.put('/me', checkPermission('QLHOSONCT','sua'), controller.updateMe);
router.get('/me/health-metrics', checkPermission('QLCHISOSK','xem'), healthMetricController.getMine);
router.post('/me/health-metrics', checkPermission('QLCHISOSK','them'), healthMetricController.createMine);
router.get('/me/medication-schedule', checkPermission('QLLICHUONGTHUOC','xem'), medicationScheduleController.getMine);
for(const [suffix,section,feature] of [['medication-schedule','medications','QLLICHUONGTHUOC'],['health-metrics','health','QLCHISOSK'],['appointments/upcoming','appointments','QLLICHKHAM'],['alerts','alerts','QLCANHBAO']]){
 router.get('/:id/'+suffix,checkPermission(feature,'xem'),scope.guardResource('HoSoNguoiCaoTuoi','NguoiCaoTuoiID'),mobileProfile.read(section));
}
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
  checkPermission('QLHOSONCT', 'xem'),
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
  (req, res, next) => req.user.tenVaiTro === 'QuanTriVien'
    ? next()
    : fail(res, 'Chi quan tri vien duoc phan cong nguoi cham soc', 'FORBIDDEN', 403),
  scope.guardResource('HoSoNguoiCaoTuoi', 'NguoiCaoTuoiID'),
  checkPermission('QLHOSONCT', 'sua'),
  controller.assignCaregiver
);

// POST /api/elderly/:id/reset-password — controller additionally enforces Admin.
router.post(
  '/:id/reset-password',
  scope.webOnlyWrite,
  checkPermission('QLHOSONCT', 'sua'),
  controller.resetMobilePassword
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

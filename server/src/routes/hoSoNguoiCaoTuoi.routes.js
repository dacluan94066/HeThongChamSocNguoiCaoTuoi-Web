// routes/hoSoNguoiCaoTuoi.routes.js - CRUD ho so nguoi cao tuoi
// Tat ca route deu can dang nhap (authMiddleware) va kiem tra quyen (checkPermission)
const express = require('express');
const router = express.Router();
const controller = require('../controllers/hoSoNguoiCaoTuoi.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const scope = require('../middlewares/mobile-scope.middleware');

// Tat ca route duoi day deu can xac thuc JWT truoc
router.use(authMiddleware);
router.use(scope.loadMobileScope);

router.get('/me', controller.getMe);

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

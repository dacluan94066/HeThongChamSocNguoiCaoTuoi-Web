// routes/nguoiDung.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiDung.controller');
const auth = require('../middlewares/auth.middleware');
const { fail } = require('../utils/response');
const { checkPermission } = require('../middlewares/permission.middleware');

router.use(auth); // Tat ca route nay can dang nhap
router.put('/me/password', checkPermission('QLHOSONCT','sua'), ctrl.changeMyPassword);
router.use((req, res, next) => req.user?.tenVaiTro !== 'QuanTriVien'
  ? fail(res, 'Khong co quyen quan ly nguoi dung', 'FORBIDDEN', 403)
  : next());

router.get('/', checkPermission('QLNGUOIDUNG','xem'), ctrl.getAll);
router.get('/:id', checkPermission('QLNGUOIDUNG','xem'), ctrl.getById);
router.post('/', checkPermission('QLNGUOIDUNG','them'), ctrl.create);
router.put('/:id', checkPermission('QLNGUOIDUNG','sua'), ctrl.update);
router.patch('/:id/toggle-status', checkPermission('QLNGUOIDUNG','sua'), ctrl.toggleStatus);

module.exports = router;

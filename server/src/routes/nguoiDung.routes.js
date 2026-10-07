// routes/nguoiDung.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiDung.controller');
const auth = require('../middlewares/auth.middleware');
const { isMobileRole } = require('../middlewares/mobile-scope.middleware');
const { fail } = require('../utils/response');

router.use(auth); // Tat ca route nay can dang nhap
router.put('/me/password', ctrl.changeMyPassword);
router.use((req, res, next) => isMobileRole(req)
  ? fail(res, 'Khong co quyen quan ly nguoi dung', 'FORBIDDEN', 403)
  : next());

router.get('/',           ctrl.getAll);
router.get('/:id',        ctrl.getById);
router.post('/',          ctrl.create);
router.put('/:id',        ctrl.update);
router.patch('/:id/toggle-status', ctrl.toggleStatus);

module.exports = router;

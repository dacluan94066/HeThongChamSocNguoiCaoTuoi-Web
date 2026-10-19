const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');

router.use(authMiddleware);
router.get('/me', checkPermission('QLHOSONCT','xem'), permissionController.getMyPermissions);
router.get('/matrix', checkPermission('QLNGUOIDUNG','xem'), permissionController.getPermissionMatrix);
router.put('/matrix', checkPermission('QLNGUOIDUNG','sua'), permissionController.updatePermissionMatrix);

module.exports = router;

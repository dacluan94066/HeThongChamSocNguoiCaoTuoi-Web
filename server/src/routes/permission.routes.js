const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);
router.get('/me', permissionController.getMyPermissions);
router.get('/matrix', permissionController.getPermissionMatrix);
router.put('/matrix', permissionController.updatePermissionMatrix);

module.exports = router;

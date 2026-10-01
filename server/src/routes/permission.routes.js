const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.get('/me', authMiddleware, permissionController.getMyPermissions);

module.exports = router;

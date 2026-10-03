// routes/auth.routes.js - Cac endpoint xac thuc nguoi dung
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// POST /api/auth/register - Dang ky tai khoan moi (public)
router.post('/register', authController.register);

// POST /api/auth/login - Dang nhap lay token (public)
router.post('/login', authController.login);

// GET /api/auth/me - Lay thong tin ca nhan (can dang nhap)
router.get('/me', authMiddleware, authController.me);

// Cap nhat thong tin tai khoan dang dang nhap
router.put('/me', authMiddleware, authController.updateMe);

// Doi mat khau va xem lich su dang nhap
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/login-history', authMiddleware, authController.getLoginHistory);

module.exports = router;

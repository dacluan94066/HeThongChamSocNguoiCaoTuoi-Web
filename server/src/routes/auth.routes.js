// routes/auth.routes.js - Cac endpoint xac thuc nguoi dung
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');

// POST /api/auth/register - Dang ky tai khoan moi (public)
router.post('/register', authController.register);
router.post('/register-caregiver', authController.registerCaregiver);

// POST /api/auth/login - Dang nhap lay token (public)
router.post('/login', authController.login);

// Google ID token duoc backend xac minh; chi phat JWT CareSenior cho Mobile.
router.post('/google', authController.googleLogin);

// Dat lai mat khau qua ma OTP gui email (public)
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password-with-token', authController.resetPasswordWithToken);

// GET /api/auth/me - Lay thong tin ca nhan (can dang nhap)
router.get('/me', authMiddleware, checkPermission('QLHOSONCT','xem'), authController.me);

// Cap nhat thong tin tai khoan dang dang nhap
router.put('/me', authMiddleware, checkPermission('QLHOSONCT','sua'), authController.updateMe);

// Doi mat khau va xem lich su dang nhap
router.post('/change-password', authMiddleware, checkPermission('QLHOSONCT','sua'), authController.changePassword);
router.get('/login-history', authMiddleware, checkPermission('QLHOSONCT','xem'), authController.getLoginHistory);

module.exports = router;

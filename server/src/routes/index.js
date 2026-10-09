// routes/index.js - Gop tat ca router con, mount vao tien to /api
const express = require('express');
const router = express.Router();

// Import tat ca routes
const authRoutes           = require('./auth.routes');
const hoSoNguoiCaoTuoiRoutes = require('./hoSoNguoiCaoTuoi.routes');
const nguoiDungRoutes      = require('./nguoiDung.routes');
const nguoiChamSocRoutes   = require('./nguoiChamSoc.routes');
const thuocRoutes          = require('./thuoc.routes');
const lichUongThuocRoutes  = require('./lichUongThuoc.routes');
const medicationScheduleRoutes = require('./medicationSchedule.routes');
const lichKhamBenhRoutes   = require('./lichKhamBenh.routes');
const chiSoSucKhoeRoutes   = require('./chiSoSucKhoe.routes');
const healthMetricTypeRoutes = require('./healthMetricType.routes');
const canhBaoRoutes        = require('./canhBao.routes');
const lienHeKhanCapRoutes  = require('./lienHeKhanCap.routes');
const nhatKyChamSocRoutes  = require('./nhatKyChamSoc.routes');
const permissionRoutes     = require('./permission.routes');
const emergencyAlertRoutes = require('./emergencyAlert.routes');
const notificationRoutes = require('./notification.routes');
const careAssistantRoutes = require('./careAssistant.routes');

// Mount cac nhom route (phai khop voi axiosClient goi ben frontend)
router.use('/auth',                  authRoutes);
router.use('/elderly',               hoSoNguoiCaoTuoiRoutes);
router.use('/users',                 nguoiDungRoutes);
router.use('/caregivers',            nguoiChamSocRoutes);
router.use('/medications',           thuocRoutes);
router.use('/medication-schedules',  lichUongThuocRoutes);
router.use('/medication-schedule',   medicationScheduleRoutes);
router.use('/appointments',          lichKhamBenhRoutes);
router.use('/health-metrics',        chiSoSucKhoeRoutes);
router.use('/health-metric-types',   healthMetricTypeRoutes);
router.use('/alerts',                canhBaoRoutes);
router.use('/emergency-contacts',    lienHeKhanCapRoutes);
router.use('/care-notes',            nhatKyChamSocRoutes);
router.use('/permissions',           permissionRoutes);
router.use('/emergency-alerts',      emergencyAlertRoutes);
router.use('/notifications',         notificationRoutes);
router.use('/care-assistant',        careAssistantRoutes);

module.exports = router;

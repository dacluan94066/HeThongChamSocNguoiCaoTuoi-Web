const express = require('express');
const auth = require('../middlewares/auth.middleware');
const { checkPermission } = require('../middlewares/permission.middleware');
const { fail } = require('../utils/response');
const ctrl = require('../controllers/relative.controller');
const router=express.Router();
router.use(auth);
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const admin=(req,res,next)=>req.user.tenVaiTro==='QuanTriVien' ? next()
  : fail(res,'Chỉ Admin được quản lý liên kết Người thân.','FORBIDDEN',403);
const relative=(req,res,next)=>req.user.tenVaiTro==='NguoiThan' ? next()
  : fail(res,'Đường dẫn chỉ dành cho Người thân.','FORBIDDEN',403);
router.get('/links',admin,checkPermission('QLNGUOIDUNG','xem'),ctrl.listLinks);
router.post('/links',admin,checkPermission('QLNGUOIDUNG','them'),ctrl.grant);
router.put('/links/:id',admin,checkPermission('QLNGUOIDUNG','sua'),ctrl.update);
router.post('/links/:id/revoke',admin,checkPermission('QLNGUOIDUNG','sua'),ctrl.revoke);
router.get('/links/:id/history',admin,checkPermission('QLNGUOIDUNG','xem'),ctrl.history);
router.get('/me/elderly',relative,checkPermission('QLHOSONCT','xem'),ctrl.elderly);
router.get('/me/notifications',relative,checkPermission('QLCANHBAO','xem'),ctrl.notifications);
router.get('/me/elderly/:id',relative,checkPermission('QLHOSONCT','xem'),ctrl.read('profile'));
for(const [path,section,feature] of [
  ['health-metrics','health','QLCHISOSK'],['medication-schedules','medications','QLLICHUONGTHUOC'],
  ['appointments','appointments','QLLICHKHAM'],['alerts','alerts','QLCANHBAO'],['sos','sos','QLCANHBAO'],
]) router.get(`/me/elderly/:id/${path}`,relative,checkPermission(feature,'xem'),ctrl.read(section));
module.exports=router;

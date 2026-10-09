const express = require('express');
const auth = require('../middlewares/auth.middleware');
const { loadMobileScope } = require('../middlewares/mobile-scope.middleware');
const controller = require('../controllers/careAssistant.controller');
const { fail } = require('../utils/response');
const router=express.Router();
router.use(auth,controller.protect);
router.use((req,res,next) => {
  const limit = req.path === '/chat' ? 26000 : 4096;
  if ((req.get('content-length') && Number(req.get('content-length')) > limit) ||
      (req.body && Buffer.byteLength(JSON.stringify(req.body),'utf8') > limit))
    return fail(res,'Yêu cầu quá lớn.','PAYLOAD_TOO_LARGE',413);
  next();
});
// Avoid leaking DB errors through the project's general error logger.
router.use((req,res,next) => {
  loadMobileScope(req,res,error => error
    ? fail(res,'Không kiểm tra được quyền truy cập. Vui lòng thử lại.','DATA_UNAVAILABLE',503)
    : next());
});
router.get('/profiles',controller.profiles);
router.get('/status',controller.status);
router.post('/query',controller.query);
router.post('/chat',controller.query);
module.exports=router;

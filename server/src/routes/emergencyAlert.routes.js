const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/emergencyAlert.controller');
const { loadMobileScope, guardResource, caregiverOnlyWrite } = require('../middlewares/mobile-scope.middleware');

const router = express.Router();
router.use(auth);
router.use(loadMobileScope);
router.get('/', controller.getAll);
router.post('/', controller.create);
router.patch(
  '/:id/handle',
  caregiverOnlyWrite,
  guardResource('CanhBaoKhanCap', 'CanhBaoKhanCapID'),
  controller.handle
);
module.exports = router;

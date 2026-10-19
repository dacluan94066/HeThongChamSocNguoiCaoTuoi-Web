const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/notification.controller');
const { checkPermission } = require('../middlewares/permission.middleware');

const router = express.Router();
router.use(auth);
router.get('/me', checkPermission('QLCANHBAO','xem'), controller.getMine);
router.patch('/:id/read', checkPermission('QLCANHBAO','xem'), controller.markRead);
module.exports = router;

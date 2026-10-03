const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/notification.controller');

const router = express.Router();
router.use(auth);
router.get('/me', controller.getMine);
router.patch('/:id/read', controller.markRead);
module.exports = router;

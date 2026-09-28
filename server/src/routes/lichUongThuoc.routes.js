const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/lichUongThuoc.controller');
const auth = require('../middlewares/auth.middleware');
router.use(auth);
router.get('/',                   ctrl.getAll);
router.patch('/:id/status',       ctrl.updateStatus);
module.exports = router;

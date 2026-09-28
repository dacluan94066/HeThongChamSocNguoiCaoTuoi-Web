// routes/nguoiDung.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiDung.controller');
const auth = require('../middlewares/auth.middleware');

router.use(auth); // Tat ca route nay can dang nhap

router.get('/',           ctrl.getAll);
router.get('/:id',        ctrl.getById);
router.post('/',          ctrl.create);
router.put('/:id',        ctrl.update);
router.patch('/:id/toggle-status', ctrl.toggleStatus);

module.exports = router;

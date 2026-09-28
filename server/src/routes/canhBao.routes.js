const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/canhBao.controller');
const auth = require('../middlewares/auth.middleware');
router.use(auth);
router.get('/',                ctrl.getAll);
router.patch('/:id/seen',      ctrl.markSeen);
router.patch('/:id/resolve',   ctrl.resolve);
module.exports = router;

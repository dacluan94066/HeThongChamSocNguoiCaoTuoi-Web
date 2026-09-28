// routes/nguoiChamSoc.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiChamSoc.controller');
const auth = require('../middlewares/auth.middleware');

router.use(auth);

router.get('/',    ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/',   ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/chiSoSucKhoe.controller');

router.get('/', auth, controller.getMetricTypes);

module.exports = router;

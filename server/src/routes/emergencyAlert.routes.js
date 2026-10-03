const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/emergencyAlert.controller');

const router = express.Router();
router.post('/', auth, controller.create);
module.exports = router;

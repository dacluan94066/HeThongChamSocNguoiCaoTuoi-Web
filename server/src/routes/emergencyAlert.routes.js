const express = require('express');
const auth = require('../middlewares/auth.middleware');
const controller = require('../controllers/emergencyAlert.controller');
const {loadMobileScope}=require('../middlewares/mobile-scope.middleware');

const router = express.Router();
router.get('/',auth,loadMobileScope,controller.getMine);
router.post('/', auth, controller.create);
module.exports = router;

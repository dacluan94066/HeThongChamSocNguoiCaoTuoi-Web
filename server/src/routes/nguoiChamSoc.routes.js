// routes/nguoiChamSoc.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/nguoiChamSoc.controller');
const auth = require('../middlewares/auth.middleware');
const { loadMobileScope, webOnlyWrite } = require('../middlewares/mobile-scope.middleware');
const careAssistant = require('../controllers/careAssistant.controller');

router.use(auth);
router.use(loadMobileScope);
router.get('/me/elderly', careAssistant.protect, careAssistant.assignedProfiles);

router.get('/',    ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/',   webOnlyWrite, ctrl.create);
router.put('/:id', webOnlyWrite, ctrl.update);

module.exports = router;

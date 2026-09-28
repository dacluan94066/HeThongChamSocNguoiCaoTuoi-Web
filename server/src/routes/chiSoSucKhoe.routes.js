const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/chiSoSucKhoe.controller');
const auth = require('../middlewares/auth.middleware');
router.use(auth);
router.get('/',  ctrl.getAll);
router.post('/', ctrl.create);
module.exports = router;

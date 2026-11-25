const express = require('express');
const router = express.Router();
const { updateLocation, toggleOnline } = require('../controllers/driverController');

router.put('/location', updateLocation);
router.put('/toggle', toggleOnline);

module.exports = router;

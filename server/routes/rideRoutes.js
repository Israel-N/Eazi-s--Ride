const express = require('express');
const router = express.Router();
const { createRide, getRideById } = require('../controllers/rideController');
// Middleware for auth would go here
router.post('/', createRide);
router.get('/:id', getRideById);

module.exports = router;

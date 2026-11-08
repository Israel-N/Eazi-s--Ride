const Ride = require('../models/Ride');

const createRide = async (req, res) => {
  try {
    const { pickupLocation, destinationLocation, fare, distance, duration } = req.body;
    const ride = await Ride.create({
      user: req.user._id,
      pickupLocation,
      destinationLocation,
      fare,
      distance,
      duration
    });
    res.status(201).json(ride);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate('user driver');
    if (ride) res.json(ride);
    else res.status(404).json({ message: 'Ride not found' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { createRide, getRideById };

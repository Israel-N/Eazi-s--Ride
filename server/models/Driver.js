const mongoose = require('mongoose');

const driverSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleModel: { type: String, required: true },
  vehiclePlate: { type: String, required: true },
  isOnline: { type: Boolean, default: false },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  rating: { type: Number, default: 5.0 },
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);

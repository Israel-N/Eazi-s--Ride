const Driver = require('../models/Driver');

const updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { user: req.user._id },
      { currentLocation: { lat, lng } },
      { new: true }
    );
    res.json(driver);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const toggleOnline = async (req, res) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id });
    driver.isOnline = !driver.isOnline;
    await driver.save();
    res.json(driver);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = { updateLocation, toggleOnline };

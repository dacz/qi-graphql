module.exports.updateOk = {
  id: '7ce31418-ae93-44f5-8f46-3a327a41a5d8',
  spaceshipUpdateInput: {
    speed: 'superFast',
    name: 'superFast spaceship',
  },
};

// should not update because I cannot update the foreign spaceship
module.exports.shouldNotUpdate = {
  id: '65cbf34a-77be-41a5-95d4-c58216556e6d',
  spaceshipUpdateInput: {
    speed: 'slow',
    name: 'foreign spaceship',
  },
};

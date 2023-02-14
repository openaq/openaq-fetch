/**
 * A collection of source configurations
 @exports Source[]
 */

/**
 * @typedef {Object} Deployment
 *
 * @property {string} name
 * @property {boolean} source (optional)
 * @property {string} source (optional)
 * @property {string} adapter (optional)
 * @property {number} offset (optional)
 */

/** @type {Deployment[]} */
module.exports = [
  // Main deployment that will grab everything
  // based on how the source is set up
  {
    "name": "realtime",
  },
  // AirNow clean up.
  {
    "name": "airnow",
    "source": 'AirNow',
    "offset": 24,
  },
  // For some reason the london source works better when alone
  {
    "name": "london",
    "source": 'London Air Quality Network',
  },
  // The eea provider has a lag and so we need to use the offset
  {
    "name": "eea",
    "adapter": 'eea-direct',
    "offset": 24,
  }
];

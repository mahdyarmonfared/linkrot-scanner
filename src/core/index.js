/**
 * LinkRot-Scanner - Core Index Module
 */

const extractor = require('./extractor');
const checker = require('./checker');
const cleaner = require('./cleaner');

module.exports = {
  ...extractor,
  ...checker,
  ...cleaner
};

const IOTACrypto = require('iota.crypto.js');
const multisig   = require('./multisig');
const transfer   = require('./transfer');
const constants  = require('./const');

/**
 * @constructor Flash
 * @param {object} options
 */
function Flash(options) {
  if (!options) {
    options = {};
  }
  if (!(this instanceof Flash)) {
    return new Flash(options);
  } 
  this.state = {
    'index': 0,
    'balance': 0,
    'deposit': [],
    'stake': [],
    'outputs': {},
    'transfers': [],
    'remainderAddress': ''
  };
  const provider = 'provider' in options ? options.provider : constants.IRI_PROVIDER;
}

module.exports = (() => {
  for (const x in transfer) {
    Flash.prototype[x] = transfer[x];
  }
  return Flash;
})();

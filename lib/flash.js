const transfer  = require('./transfer');
const constants = require('./const');
const IOTA      = require('iota.lib.js');

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
  this.iota = provider instanceof IOTA ? provider : new IOTA({'provider': provider});
}

module.exports = (() => {
  for (const x in transfer) {
    Flash.prototype[x] = transfer[x];
  }
  return Flash;
})();

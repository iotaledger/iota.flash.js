const IOTACrypto = require('iota.crypto.js');
const multisig   = require('./multisig');
const transfer   = require('./transfer');

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
  this.signersCount = 'signersCount' in options ? options.signersCount : 2;
  this.state = {
    'index': 0,
    'security': 'security' in options ? options.security : 2,
    'balance': 'balance' in options ? options.balance : 0,
    'deposit': 'deposit' in options ? options.deposit : Array(this.signersCount).fill(0),
    'stakes': 'stakes' in options ? options.stakes : Array(this.signersCount).fill(0.5),
    'outputs': 'outputs' in options ? options.outputs : {},
    'transfers': 'transfers' in options ? options.transfers : [],
    'remainderAddress': 'remainderAddress' in options ? options.remainderAddress : ''
  };
}

Flash.multisig = multisig;
Flash.transfer = transfer;

module.exports = Flash;

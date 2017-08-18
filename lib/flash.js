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
    'balance': 'balance' in options ? options.balance : 0,
    'deposit': 'deposit' in options ? options.deposit : Array(signersCount).fill(0),
    'stakes': 'stakes' in options ? options.stakes : Array(signersCount).fill(0.5),
    'outputs': {},
    'transfers': [],
    'proposedTransfers': {},
    'root': 'depth' in options ? initializeTree(options.depth) : multisig.initTreeWithCount(options.count),
    'remainderAddress': 'remainderAddress' in options ? options.remainderAddress : ''
  };
}

module.exports = Flash;

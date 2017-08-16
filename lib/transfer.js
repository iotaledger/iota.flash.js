const IOTACrypto = require('iota.crypto.js');
const MAX_USES = require('./const').MAX_USES;

/**
 * Composes a Transfer
 *
 * @method composeTransfer 
 * @param {array} multisig
 * @param {int} fromIndex
 * @param {array} transfers
 */
function composeTransfer(multisigs, fromIndex, transfers) {
  const valueTransfersLength = transfers.filter( transfer => transfer.value < 0 ).length; 
  if (valueTransfersLength != 0 && valueTransfersLength > this.state.stakes.length) {
    throw new Error("Invalid transfer object");
  }
  const amount = transfers.map( transfer => transfer.value).reduce((a,b) => a + b, 0);
  if(this.state.deposit[fromIndex] < amount && this.state.deposit.reduce((a,b) => a + b, 0) > 1) {
    throw new Error("Insufficient funds");
  }
  for(let i = 0; i < this.state.stakes.length; i++) {
    this.state.deposit[i] -= amount * this.state.stakes[i];
  }
  transfers = transfers.map( transfer => {
    if (!(transfer.address in this.state.outputs)) {
      this.state.outputs[transfer.address] = 0;
    }
    const addedValue = transfer.value;
    transfer.value += this.state.outputs[transfer.address];
    this.state.outputs[transfer.address] += addedValue;
    return transfer;
  });
  const bundles = [];
  for(let i = 0; i < multisigs.length - 1; i++) {
    const multisig = multisigs[i];
    const input = {
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: this.state.balance
    };
    const remainderAddress = this.state.remainderAddress;
    const transfers = [{
      address: multisigs[i + 1].address,
      value: this.state.balance,
    }];
    bundles.push(
      IOTACrypto.multisig.initiateTransfer(
        input,
        remainderAddress, 
        transfers
      )
    );
  }
  const multisig = multisigs[multisigs.length - 1];
  const input = {
    address: multisig.address,
    securitySum: multisig.securitySum,
    balance: this.state.balance
  };
  bundles.push(
    IOTACrypto.multisig.initiateTransfer( 
      input,
      this.state.remainderAddress, 
      transfers
    )
  );
  const stateCopy = Object.assign({}, this.state);
  this.onStateChange(stateCopy);
  return bundles;
}

function signTransfer(seed, index, security, multisigs, fromIndex, bundles) {
  const signedBundles = bundles.map((bundle, i) => {
    const multisig = multisigs[i + fromIndex];
    return IOTACrypto.multisig.addSignature(
      bundle, 
      multisig.address, 
      IOTACrypto.multisig.getKey(seed, index, security) 
    );
  });
  return signedBundles;
}

function getTransferDiff(multisigs, bundles) {
  const initialInputTransaction = bundles[0].filter(bundle => bundle.value < 0)[0];
  if (typeof initialInputTransaction === undefined) {
    throw new Error("No input transaction");
  }
  if (bundles.length > multisigs.length) {
    throw new Error("Too many bundles.");
  }
  const initialIndex = multisigs.filter(m => m.address == initialInputTransaction.address).map((m,i) => i)[0];
  for(let i = initialIndex; i < multisigs.length - 1 && (i - initialIndex) < bundles.length - 1; i++) {
    const bundle = bundles[i - initialIndex];
    const inputTransaction = bundle.filter(tx => tx.value < 0)[0];
    if(typeof inputTransaction === undefined || inputTransaction.address != multisigs[i].address) {
      throw new Error("Invalid bundle input");
    }
    // TODO
    // Check if entire amount is being passed to next multisig
    if(bundle.filter(tx => tx.value > 0 && tx.address != multisigs[i + 1].address)) {
      throw new Error("Bundle does not pass entire amount down the tree.");
    }
  }
  const previousTransferIndex = this.state.transfers.length - 1;
  let previousTransfer;
  if (this.state.transfers.indexOf(previousTransferIndex) !== -1) {
    previousTransfer = this.state.transfers[previousTransferIndex];
  }
  else {
    return {};
  }
  const lastTransfer = bundles[bundles.length - 1];
  const previousRemainder = previousTransfer.filter(tx => tx.address == this.state.remainderAddress && tx.value > 0)[0];
  const newRemainder = lastTransfer.filter(tx => tx.address == this.state.remainderAddress && tx.value > 0)[0];
  if(newRemainder.value > previousRemainder.value) {
    throw new Error("Remainder should not increase");
  }
  const newCopy = (function _deepClone(from) {
    let copy;
    if (Object.prototype.toString.call(from) === '[object Object]') {
      copy = {};
      for(const x in from) {
        copy[x] = _deepClone(from[x]);
      }
    }
    else if (Array.isArray(from)) {
      let i = -1;
      copy = [];
      while (++i < from.length) {
        copy[i] = _deepClone(from[i]);
      }
    }
    else {
      copy = from;
    }
    return copy;
  })(lastTransfer);
  previousTransfer.filter(tx => tx.value > 0).map(tx => {
    const existing = newCopy.filter(t => t.address == tx.address);
    if(existing.length != 0) {
      existing[0].value -= tx.value;
    } else {
      newCopy.push(tx);
    }
  });
  const negatives = newCopy.filter(tx => tx.value < 0);
  if(negatives.length > 0 ) {
    throw new Error("Output diffs must be greater than zero except for remainder");
  }
  return newCopy;
}

/*
function getStateDiff(multisigs, fromIndex, bundles) {
  const initialInputTransaction = bundles[0].filter(bundle => bundle.value < 0)[0];
  if (typeof initialInputTransaction === undefined) {
    return Promise.reject("No input transaction");
  }
  if (bundles.length > multisigs.length) {
    return Promise.reject("Too many bundles.");
  }
  const initialIndex = multisigs.filter(m => m.address == initialInputTransaction.address).map((m,i) => i)[0];
  for(var i = initialIndex; i < multisigs.length - 1 && (i - initialIndex) < bundles.length - 1; i++) {
    const bundle = bundles[i - initialIndex];
    const inputTransaction = bundle.filter(tx => tx.value < 0)[0];
    if(typeof inputTransaction === undefined || inputTransaction.address != multisigs[i].address) {
      return Promise.reject("Invalid bundle input");
    }
    // TODO
    // Check if entire amount is being passed to next multisig
    if(bundle.filter(tx => tx.value > 0 && tx.address != multisigs[i+1].address)) {
      return Promise.reject("Bundle does not pass entire amount down the tree.");
    }
  }
  // TODO 
  // Check if the modification of the this.state is consistent with deposits 
  const transferBundle = bundles[bundles.length];
  const remainderTransaction = transferBundle.filter(tx => tx.address == this.state.remainderAddress)[0];
  const diffFromPreviousTransfer = (previousTransfer => {
    transferBundle.filter(tx => tx.value > 0).map(tx => {
      let transaction = previousTransfer.filter(t => t.address == tx.address)[0];
      if(typeof transaction === undefined) {
        return {
          address: tx.address,
          value: tx.value
        };
      } else {
        return {
          address: tx.address,
          value: tx.value - transaction.value
        };
      }
    })
  })(this.state.transfers[this.state.transfers.length]);
  let comparisonIndex = this.state.outputAddresses.indexOf(diffFromPreviousTransfer[0]);
  // check that each deposit keeps the same proportion
  if(typeof remainderTransaction === undefined) {
    // Then deposits must be correctly split between participants
  } else {
    // Then the spending amount must not exceed deposit remainder for participant
  }
}
*/

module.exports = {
  'composeTransfer' : composeTransfer,
  'signTransfer'    : signTransfer,
  'getTransferDiff' : getTransferDiff
}

const MAX_USES = require('./const').MAX_USES;

/**
 * Composes a Transfer
 *
 * @method composeTransfer 
 * @param {array} multisig
 * @param {int} fromIndex
 * @param {array} transfers
 *
 */
function composeTransfer(multisigs, fromIndex, transfers) {
  const iota = this.iota;
  if (transfers.filter( transfer => transfer.value < 0 ).length != 0) {
    return Promise.reject("Invalid transfer object", transfer);
  }
  let amount = transfers.map( transfer => transfer.value).reduce((a,b) => a+b, 0);
  if(this.state.deposit[fromIndex] < amount && this.state.deposit.reduce((a,b) => a+b, 0) > 1) {
    return Promise.reject("Insufficient funds");
  }
  for(let i = 0; i < this.state.stakes.length; i++) {
    this.state.deposit[i] -= amount * this.state.stake[i];
  }
  transfers = transfers.map( transfer => {
    transfer.value += this.state.outputs[transfer.address];
    return transfer;
  });
  let promises = [];
  for(let i = 0; i < multisigs.length - 1; i++) {
    promises.push(new Promise((resolve, reject) => {
      const multisig = multisigs[i];
      iota.multisig.initiateTransfer({
        address: multisig.address,
        securitySum: multisig.securitySum,
        balance: this.state.balance
      }, this.state.remainderAddress, [{
        address: multisigs[i + 1].address,
        value: this.state.balance,
      }], resolveBundle(resolve, reject, multisig.address))
    }));
  }
  promises.push(new Promise((resolve, reject) => {
    const multisig = multisigs[multisigs.length];
    iota.multisig.initiateTransfer({
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: this.state.balance
    }, 
      this.state.remainderAddress, 
      transfers, 
      resolveBundle(resolve, reject, multisig.address));
  }));
  return Promise.all(promises);
}

function resolveBundle(resolve, reject, address) {
  return (err, bundle) => {
    if (err) {
      reject(err);
    }
    else {
      resolve(bundle, address);
    }
  }
}

function signTransfer(multisigs, fromIndex, bundles) {
  let promises = bundles.map((bundle, i) => {
    return new Promise( (resolve, reject) => {
      let multisig = multisigs[i + fromIndex];
      iota.multisig.addSignature(
        bundle, 
        multisig.address, 
        iota.multisig.getKey(seed, multisig.index, multisig.security), 
        resolveBundle(resolve, reject, multisig.address)
      );
    });
  });
  return Promise.all(promises);
}

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

module.exports = {
  'composeTransfer': composeTransfer,
  'signTransfer'   : signTransfer,
  'getStateDiff'   : getStateDiff
}

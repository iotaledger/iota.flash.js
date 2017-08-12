const MAX_USES = 3;

/**
 * Composes a Transfer
 *
 **/
function composeTransfer(state, multisigs, fromIndex, transfers) {
  if (transfers.filter( transfer => transfer.value < 0 ).length != 0) {
    return Promise.reject("Invalid transfer object", transfer);
  }
  let amount = transfers.map( transfer => transfer.value).reduce((a,b) => a+b, 0);
  if(state.deposit[fromIndex] < amount && state.deposit.reduce((a,b) => a+b, 0) > 1) {
    return Promise.reject("Insufficient funds");
  }
  for(let i = 0; i < state.stakes.length; i++) {
    state.deposit[i] -= amount * state.stake[i];
  }
  transfers = transfers.map( transfer => {
    transfer.value += state.outputs[transfer.address];
    return transfer;
  });
  let promises = [];
  for(let i = 0; i < multisigs.length - 1; i++) {
    promises.push(new Promise((resolve, reject) => {
      const multisig = multisigs[i];
      iota.multisig.initiateTransfer({
        address: multisig.address,
        securitySum: multisig.securitySum,
        balance: state.balance
      }, state.remainderAddress, [{
        address: multisigs[i + 1].address,
        value: state.balance,
      }], resolveBundle(resolve, reject, multisig.address))
    });
  }
  promises.push(new Promise((resolve, reject) => {
    const multisig = multisigs[multisigs.length];
    iota.multisig.initiateTransfer({
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: state.balance
    }, 
      state.remainderAddress, 
      transfers, 
      resolveBundle(resolve, reject, multisig.address))
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

function signTransfer(state, multisigs, fromIndex, bundles) {
  /*
   *
   */
  const rootBundleAddress = bundles[0].filter();
  for(const multisig of multisigs) {
  }
  // Check Transfers
  const preparedTransfers = bundles.map((bundle, index)=> {
    // bundle must pass entire balance down the tree
    // else must only modify the state by allowed amounts
  });
  // Sign Transfers
  let promises = preparedTransfers.map(preparedTransfer => {
    return new Promise( (resolve, reject) => {
      let multisig = preparedTransfer.multisig;
      let bundle = preparedTransfer.bundle;
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

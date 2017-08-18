const IOTACrypto = require('iota.crypto.js');
const MAX_USES = require('./const').MAX_USES;
const helpers = require('./helpers');

/**
 * Composes a Transfer
 *
 * @method composeTransfer 
 * @param {array} multisig
 * @param {int} fromIndex
 * @param {array} transfers
 */
function composeTransfer(state, multisigs, fromIndex, transfers, onStateChange) {
  const valueTransfersLength = transfers.filter( transfer => transfer.value < 0 ).length; 
  let stateCopy = {
    deposit: helpers.deepClone(state.deposit),
    outputs: helpers.deepClone(state.outputs),
    stakes: helpers.deepClone(state.stakes),
  };
  if (valueTransfersLength != 0 && valueTransfersLength > stateCopy.stakes.length) {
    throw new Error("Invalid transfer object");
  }
  const amount = transfers.map( transfer => transfer.value).reduce((a,b) => a + b, 0);
  if(stateCopy.deposit[fromIndex] < amount && stateCopy.deposit.reduce((a,b) => a + b, 0) > 1) {
    throw new Error("Insufficient funds");
  }
  for(let i = 0; i < stateCopy.stakes.length; i++) {
    stateCopy.deposit[i] -= amount * stateCopy.stakes[i];
  }
  transfers = transfers.map( transfer => {
    if (!(transfer.address in stateCopy.outputs)) {
      stateCopy.outputs[transfer.address] = 0;
    }
    const addedValue = transfer.value;
    transfer.value += stateCopy.outputs[transfer.address];
    stateCopy.outputs[transfer.address] += addedValue;
    return transfer;
  });
  const bundles = [];
  for(let i = 0; i < multisigs.length - 1; i++) {
    const multisig = multisigs[i];
    const input = {
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: state.balance
    };
    const remainderAddress = state.remainderAddress;
    const transfers = [{
      address: multisigs[i + 1].address,
      value: state.balance,
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
    balance: state.balance
  };
  bundles.push(
    IOTACrypto.multisig.initiateTransfer( 
      input,
      state.remainderAddress, 
      transfers
    )
  );
  //onStateChange(stateCopy);
  return bundles;
}

function applyTransfers(state, transfers) {
  let proposedState = state.proposedTransfers[transfers[transfers.length].bundle.bundle];
  // TODO: Check that state transfers didn't have some race condition
  // TODO: Checks
  //    - deposits - diff >= 0
  // Traverse to first address of transfers
  let node;
  for(node = state.root; node.address != transfers[0].address && node.children.length != 0; node = node.children[node.children.length - 1]) {}
  // Organize into multisig tree
  let multisigs = [];
  for(let i = 0; i < transfers.length && node.address == transfers[i].address; i++) {
    multisigs.push(node);
    node = node.children[node.children.length - 1];
  }
  if(node.bundles.length == 3) {
    throw new Error("Address overuse");
  }
  if(multisigs.length != transfers.length ) {
    throw new Error("Couldn't find all addresses");
  }
  try {
    // getTransferDiff doesn't fail (because negative output diff)
    let diff = getTransferDiff(state, multisigs, transfers);
    // get the total amount of increase in outputs
    let total = diff.filter(v => v.value > 0).reduce((a,b) => a+b, 0);
    // get the total amount of remaining deposits
    let remaining = state.deposit.reduce((a,b) => a+b, 0); 
    // You can't spend more than you have in deposits
    if (total > remaining) {
      throw new Error("Not enough balance");
    }
    // subtract this from teposits
    for(let i = 0; i < state.deposit.length; i++) {
      state.deposit[i] -= state.stakes[i] * total;
    }
    // add to outputs
    for(let i = 0; i < diff.length; i++) {
      if(diff[i].address in state.outputs) {
        state.outputs[diff[i].address] += diff[i].value;
      } else {
        state.outputs[diff[i].address] = diff[i].value;
      }
    }
    // append transfers to multisigs' bundles
    transfers.map((transfer, i) => {
      multisigs[i].bundles.push(transfer);
    });
    // and add the output transfer to the state transfers (for ease of use later);
    state.transfers.push(transfers[transfers.length - 1]);
  } catch (e) {
    throw e;
  }
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

function getTransferDiff(state, multisigs, bundles) {
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
  const previousTransferIndex = state.transfers.length - 1;
  let previousTransfer;
  if (state.transfers.indexOf(previousTransferIndex) !== -1) {
    previousTransfer = state.transfers[previousTransferIndex];
  }
  else {
    return {};
  }
  const lastTransfer = bundles[bundles.length - 1];
  const previousRemainder = previousTransfer.filter(tx => tx.address == state.remainderAddress && tx.value > 0)[0];
  const newRemainder = lastTransfer.filter(tx => tx.address == state.remainderAddress && tx.value > 0)[0];
  if(newRemainder.value > previousRemainder.value) {
    throw new Error("Remainder should not increase");
  }
  const newCopy = helpers.deepClone(lastTransfer);
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

module.exports = {
  'composeTransfer' : composeTransfer,
  'signTransfer'    : signTransfer,
  'getTransferDiff' : getTransferDiff
}

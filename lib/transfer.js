const IOTACrypto = require('iota.crypto.js');
const MAX_USES = require('./constants').MAX_USES;
const helpers = require('./helpers');

const TransferErrors = {
  REMAINDER_INCREASED: 0,
  INVALID_TRANSFER_OBJECT: 1,
  INSUFFICIENT_FUNDS: 2,
  INVALID_TRANSFERS_ARRAY: 3,
  INVALID_SIGNATURES: 4,
  ADDRESS_OVERUSE: 5,
  ADDRESS_NOT_FOUND: 6,
  INPUT_UNDEFINED: 7,
  INVALID_INPUT: 8,
  BALANCE_NOT_PASSED: 9,
};

function getLastBranch(root) {
  let multisigs = [];
  let node = root
  multisigs.push(node)

  while (node.children.length != 0) {
    node = node.children[node.children.length - 1]    
    multisigs.push(node);
  }
  return multisigs;
}

/**
 * Composes a Transfer
 *
 * @method compose
 * @param {array} multisig
 * @param {array} transfers
 */
function compose(state, transfers) {
  const valueTransfersLength = transfers.filter( transfer => transfer.value < 0 ).length; 
  let stateCopy = {
    deposit: helpers.deepClone(state.deposit),
    outputs: helpers.deepClone(state.outputs),
    stakes: helpers.deepClone(state.stakes),
  };
  if (valueTransfersLength != 0 && valueTransfersLength > stateCopy.stakes.length) {
    throw new Error(TransferErrors.INVALID_TRANSFER_OBJECT);
  }
  const amount = transfers.reduce((a,b) => a + b.value, 0);
  if( amount > stateCopy.deposit.reduce((a,b) => a + b, 0) > 1) {
    throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
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
  let multisigs = getLastBranch(state.root);
  if(multisigs[0].bundles.length == MAX_USES) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  for(let i = 0; i < multisigs.length; i++) {
    if(multisigs[i].bundles.length != 0 && i < multisigs.length - 1) {
      multisigs = multisigs.slice(0,i+2);
      break;
    }
  }
  multisigs.slice(0,multisigs.length-1).map((multisig, i) => {  
    const input = {
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: state.balance
    };
    const remainderAddress = state.remainderAddress.address
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
  })
  const multisig = multisigs[multisigs.length - 1];
  const input = {
    address: multisig.address,
    securitySum: multisig.securitySum,
    balance: state.balance
  };
  bundles.push(
    IOTACrypto.multisig.initiateTransfer( 
      input,
      state.remainderAddress.address, 
      transfers
    )
  );
  return bundles;
}

/**
 * Applies Transfers to State
 *
 * @method apply
 * @param {object} state
 * @param {array} transfers
 */
function applyTransfers(state, transfers) {
  // Validate the transfers array
  if(!IOTACrypto.utils.inputValidator.isTransfersArray(transfers)) {
    throw new Error(TransferErrors.INVALID_TRANSFERS_ARRAY);
  }
  // validate the signatures
  if(transfers
    .filter(tx => tx.value < 0)
    .filter(tx => !IOTACrypto.utils.validateSignatures(transfers, tx.address))
    .length != 0) {
  
    throw new Error(TransferErrors.INVALID_SIGNATURES);
  }
  let multisigs = getMultisigs(state.root, transfers);
  if(node.bundles.length == 3) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  if(multisigs.length != transfers.length ) {
    throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
  }
  try {
    // getDiff doesn't fail (because negative output diff)
    let diff = getDiff(state, multisigs, transfers);
    // get the total amount of increase in outputs
    let total = diff.filter(v => v.value > 0).reduce((a,b) => a+b, 0);
    // get the total amount of remaining deposits
    let remaining = state.deposit.reduce((a,b) => a+b, 0); 
    // You can't spend more than you have in deposits
    if (total > remaining) {
      throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
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

function getMultisigs(root, transfers) {
  // Traverse to first address of transfers
  let node = root;
  console.log(transfers[0])
  let transferAddress = transfers[0].find(tx => tx.value < 0)
  while(node.address != transferAddress.address && node.children.length != 0) {
    node = node.children[node.children.length - 1];
  }
  // Organize into multisig tree
  return getLastBranch(node);
}

function sign(root, seed, bundles) {
  const multisigs = getMultisigs(root, bundles);
  return bundles.map((bundle, i) => {
    const multisig = multisigs[i];
    return IOTACrypto.multisig.addSignature(
      bundle, 
      multisig.address, 
      IOTACrypto.multisig.getKey(IOTACrypto.converter.trits(seed), multisig.index, multisig.security) 
    );
  });
}

function getDiff(state, bundles) {
  const initialInputTransaction = bundles[0].filter(bundle => bundle.value < 0)[0];
  if (typeof initialInputTransaction === undefined) {
    throw new Error(TransferErrors.INPUT_UNDEFINED);
  }
  const multisigs = getMultisigs(state.root, bundles);
  if (bundles.length > multisigs.length) {
    throw new Error(TransferErrors.TOO_MANY_BUNDLES);
  }
  const initialIndex = multisigs.filter(m => m.address == initialInputTransaction.address).map((m,i) => i)[0];
  for(let i = initialIndex; i < multisigs.length - 1 && (i - initialIndex) < bundles.length - 1; i++) {
    const bundle = bundles[i - initialIndex];
    const inputTransaction = bundle.filter(tx => tx.value < 0)[0];
    if(typeof inputTransaction === undefined || inputTransaction.address != multisigs[i].address) {
      throw new Error(TransferErrors.INVALID_INPUT);
    }
    // TODO
    // Check if entire amount is being passed to next multisig
    if(bundle.filter(tx => tx.value > 0 && tx.address != multisigs[i + 1].address)) {
      throw new Error(TransferErrors.BALANCE_NOT_PASSED);
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
    throw new Error(TransferErrors.REMAINDER_INCREASED);
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
    throw new Error(TransferErrors.INVALID_INPUT);
  }
  return newCopy;
}

//var Transfer = require('iota.flash.js').transfer;
//Transfer.apply();
//var bundles = transfer.compose(flash.state, ...);
//var diff = transfer.diff(flash.state, bundles);
//if the diff is good...
//var signedBundles = transfer.sign(flash.state, bundles);
//transfer.apply(flash.state, bundles);

module.exports = {
  'compose'        : compose,
  'getDiff'        : getDiff,
  'sign'           : sign,
  'applyTransfers' : applyTransfers,
  'TransferErrors' : TransferErrors
}

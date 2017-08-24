const IOTACrypto = require('iota.crypto.js');
const MAX_USES = require('./constants').MAX_USES;
const helpers = require('./helpers');
const getLastBranch = require('./multisig').getLastBranch;
const getMinimumBranch = require('./multisig').getMinimumBranch;

const TransferErrors = {
  NULL_VALUE: -1,
  REMAINDER_INCREASED: 0,
  INVALID_TRANSFER_OBJECT: 1,
  INSUFFICIENT_FUNDS: 2,
  INVALID_TRANSFERS_ARRAY: 3,
  INVALID_SIGNATURES: 4,
  ADDRESS_OVERUSE: 5,
  ADDRESS_NOT_FOUND: 6,
  INPUT_UNDEFINED: 7,
  INVALID_INPUT: 8,
  BALANCE_NOT_PASSED: 9
};

/**
 * Prepare transfers object
 *
 * @method prepare
 * @param {array} settlement the settlement addresses for each user
 * @param {array} stakes the percentage stake of each user
 * @param {array} deposits the amount each user can still spend
 * @param {number} fromIndex the index of the user used as an input
 * @param {destinations} the `{value, address}` destination of the output bundle (excluding remainder)
 * @returns {array} transfers
 */
function prepare(settlement, stakes, deposits, fromIndex, destinations) {
  // total amount transacted this round
  const total = destinations.reduce((acc, tx) => acc + tx.value, 0);
  // reject if there isn't enough deposit for user
  if(total > deposits[fromIndex]) {
    throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
  }
  // copy destinations
  const transfer = helpers.deepClone(destinations);
  // add deposit release to outputs
  settlement.filter(tx => tx).map((s, i) => {
    const current = transfer.find(tx => tx.address == s);
    const stake = stakes[i] * total;
    if(current) {
      current.value += stake;
    } else {
      transfer.push({ address: s, value: stake})
    }
  });
  // remove that amount from the sender
  transfer.find(tx => tx.address == settlement[fromIndex]).value -= stakes[fromIndex] * total;
  // return the positive ones
  return transfer.filter(tx => tx.value > 0);
}

/**
 * Composes a Transfer
 *
 * @method compose
 * @param {number} balance The total amount of iotas in the channel
 * @param {array<number>} deposit the amount of iotas still available to each user to spend from
 * @param {array<string>} outputs the accrued outputs through the channel
 * @param {array<float>} stakes the float-mapped percentage of stakes
 * @param {array<bundles>} history the leaf bundles
 * @param {array<{addy, val}>} transfers the array of outputs for the transfer
 * @param {bool} close whether to use the minimum tree or not
 * @return {array<bundle>} prepared bundles
 */
function compose(balance, deposit, outputs, stakes, root, remainder, history, transfers, close) {
  const valueTransfersLength = transfers.filter( transfer => transfer.value < 0 ).length; 
  let stateCopy = {
    deposit: helpers.deepClone(deposit),
    outputs: helpers.deepClone(outputs),
    stakes: helpers.deepClone(stakes),
  };
  if (valueTransfersLength != 0 && valueTransfersLength > stateCopy.stakes.length) {
    throw new Error(TransferErrors.INVALID_TRANSFER_OBJECT);
  }
  const amount = transfers.reduce((a,b) => a + b.value, 0);

  const deposits = stateCopy.deposit.reduce((a,b) => a + b, 0);
  if( amount > deposits || deposits < 1) {
    throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
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
  // get the multisigs to use to generate the bundles
  let multisigs = close ? getMinimumBranch(root) : getLastBranch(root);
  if(multisigs[0].bundles.length == MAX_USES) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  // Find highest parent multisig that hasn't passed to child
  for(let i = 0; i < multisigs.length - 1; i++) {
    if(multisigs[i].bundles.find(bundle => bundle.find(tx => tx.value > 0 && tx.address == remainder))) {
      multisigs = multisigs.slice(i+1);
    } else {
      break;
    }
  }
  // If there are no multisigs left, throw error
  if(multisigs.length == 0) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  multisigs.slice(0,multisigs.length-1).map((multisig, i) => {  
    const input = {
      address: multisig.address,
      securitySum: multisig.securitySum,
      balance: balance
    };
    const remainderAddress = remainder.address
    const transfers = [{
      address: multisigs[i + 1].address,
      value: balance,
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
    balance: balance
  };
  bundles.push(
    IOTACrypto.multisig.initiateTransfer( 
      input,
      remainder.address, 
      transfers
    )
  );
  return bundles;
}

/**
 * creates transactions to close the channel
 *
 * @method close
 * @param {array} settlement the settlement addresses for each user
 * @param {array} deposits the amount each user can still spend
 * @returns {array} transfers
 */
function close(settlement, deposits) {
  // add deposit release to outputs
  return settlement.filter(tx => tx).map((s, i) => {
    return { address: s, value: deposits[i] };
  }).filter(tx => tx.value > 0);
}

/**
 * Applies Transfers to State
 *
 * @method apply
 * @param {object} state
 * @param {array} transfers
 */
function applyTransfers(root, deposit, stakes, outputs, remainder, history, transfers) {
  // Validate the transfers array
  /*
  for(const transfer of transfers) {
    if(!IOTACrypto.utils.inputValidator.isTransfersArray(transfer)) {
      throw new Error(TransferErrors.INVALID_TRANSFERS_ARRAY);
    }
  }
  */
  // validate the signatures
  if (transfers.filter(transfer => 
      transfer.filter(tx => tx.value < 0)
      .filter(tx => !IOTACrypto.utils.validateSignatures(transfer, tx.address))
      .length != 0).length != 0) {
    throw new Error(TransferErrors.INVALID_SIGNATURES);
  }
  let multisigs = getMultisigs(root, transfers);
  if(multisigs.filter(node => node.bundles.length == 3).length != 0) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  if(multisigs.length != transfers.length ) {
    throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
  }
  try {
    // getDiff doesn't fail (because negative output diff)
    let diff = getDiff(root, remainder, history, transfers);
    // get the total amount of remaining deposits
    let remaining = deposit.reduce((a,b) => a+b, 0); 
    // get the total amount of increase in outputs
    let total = diff.filter(v => v.value > 0 && v.value != remaining).reduce((acc,tx) => acc+tx.value, 0);
    // You can't spend more than you have in deposits
    if (total > remaining) {
      throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
    }
    // subtract this from teposits
    for(let i = 0; i < deposit.length; i++) {
      deposit[i] -= stakes[i] * total;
    }
    // add to outputs
    for(let i = 0; i < diff.length; i++) {
      if(diff[i].address in outputs) {
        outputs[diff[i].address] += diff[i].value;
      } else {
        outputs[diff[i].address] = diff[i].value;
      }
    }
    // append transfers to multisigs' bundles
    transfers.map((transfer, i) => {
      multisigs[i].bundles.push(transfer);
    });
    // and add the output transfer to the state transfers (for ease of use later);
    history.push(transfers[transfers.length - 1]);
  } catch (e) {
    throw e;
  }
}

function getMultisigs(root, transfers) {
  // Traverse to first address of transfers
  let node = root;
  let firstTransfer = transfers[0].find(tx => tx.value < 0)
  while(node.address != firstTransfer.address && node.children.length != 0) {
    node = node.children[node.children.length - 1];
  }
  if(node.address != firstTransfer.address) {
    throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
  }
  // Organize into multisig tree
  let multisigs = [];
  let i = 0;
  multisigs.push(node)
  while (node.children.length != 0 && ++i < transfers.length) {
    node = node.children.find(m => m.address == transfers[i].find(tx => tx.value < 0).address);
    if(node.bundles.length == MAX_USES) {
      throw new Error(TransferErrors.ADDRESS_OVERUSE);
    }
    if(typeof node == undefined) {
      throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
    }
    multisigs.push(node);
  }
  return multisigs;
}

function sign(root, seed, bundles) {
  const multisigs = getMultisigs(root, bundles);
  return bundles.map((bundle, i) => {
    const multisig = multisigs[i];
    return IOTACrypto.multisig.addSignature(
      bundle, 
      multisig.address, 
      IOTACrypto.multisig.getKey(seed, multisig.index, multisig.security) 
    );
  });
}

function getDiff(root, remainder, history, bundles) {
  if(typeof root === undefined ) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(typeof remainder === undefined ) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(typeof history === undefined ) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(typeof bundles === undefined ) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  const initialInputTransaction = bundles[0].filter(bundle => bundle.value < 0)[0];
  if (typeof initialInputTransaction === undefined) {
    throw new Error(TransferErrors.INPUT_UNDEFINED);
  }
  const multisigs = getMultisigs(root, bundles);
  if (bundles.length != multisigs.length) {
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
    if(bundle.find(tx => tx.value > 0 && tx.address != multisigs[i + 1].address)) {
      throw new Error(TransferErrors.BALANCE_NOT_PASSED);
    }
  }
  let previousTransfer = history.length == 0 ? []: history[history.length - 1];
  const lastTransfer = bundles[bundles.length - 1];
  const previousRemainder = previousTransfer.filter(tx => tx.address == remainder.address && tx.value > 0).reduce((acc, v) => acc + v, 0);
  const newRemainder = lastTransfer.filter(tx => tx.address == remainder.address)
    .map(tx => tx.value )
    .reduce((acc, v) => acc + v, 0)
  if(newRemainder.value > previousRemainder.value) {
    throw new Error(TransferErrors.REMAINDER_INCREASED);
  }
  const newCopy = helpers.deepClone(lastTransfer
    .filter(tx => tx.value > 0)
    .map(tx => Object({address: tx.address, value: tx.value}))
    .filter(tx => tx.address != remainder.address));
  previousTransfer.filter(tx => tx.value > 0).map(tx => {
    const existing = newCopy.find(t => t.address == tx.address);
    if(existing) {
      existing.value -= tx.value;
    } else {
      newCopy.push({address: tx.address, value: tx.value});
    }
  });
  const negatives = newCopy.filter(tx => tx.value < 0);
  if(negatives.length != 0 ) {
    throw new Error(TransferErrors.INVALID_INPUT);
  }
  return newCopy;
}

module.exports = {
  'prepare'        : prepare,
  'compose'        : compose,
  'close'          : close,
  'getDiff'        : getDiff,
  'sign'           : sign,
  'applyTransfers' : applyTransfers,
  'TransferErrors' : TransferErrors
}

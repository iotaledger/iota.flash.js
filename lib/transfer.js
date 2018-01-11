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
 * @param {array} deposits the amount each user can still spend
 * @param {number} fromIndex the index of the user used as an input
 * @param {array} destinations `{value, address}` destination of the output bundle (excluding remainder)
 * @returns {array} transfers
 */
function prepare(settlement, deposits, fromIndex, destinations) {
  const total = destinations.reduce((acc, tx) => acc + tx.value, 0);
  if(total > deposits[fromIndex]) {
    throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
  }
  const transfer = helpers.deepClone(destinations);
  settlement.map((s,i) => {
      if(i !== fromIndex) {
        const current = transfer.find(tx => tx.address === s);
        let stake = 0;
        if( deposits[i] > 0)
          stake = total * deposits[i] / deposits.filter((e,i) => i !== fromIndex).reduce((acc, s) => acc + s, 0);
        if(current) {
          current.value += stake;
          current.obsoleteTag = ''          
        } else {
          transfer.push({ address: s, value: stake, obsoleteTag: ''
        })
        }
      }
  })
  return transfer.filter(tx => tx.value > 0);
}

/**
 * Composes a Transfer
 *
 * @method compose
 * @param {number} balance The total amount of iotas in the channel
 * @param {array<number>} deposit the amount of iotas still available to each user to spend from
 * @param {array<string>} outputs the accrued outputs through the channel
 * @param {array<bundles>} history the leaf bundles
 * @param {array<{addy, val}>} transfers the array of outputs for the transfer
 * @param {bool} close whether to use the minimum tree or not
 * @return {array<bundle>} prepared bundles
 */
function compose(balance, deposit, outputs, root, remainder, history, transfers, close) {
  const valueTransfersLength = transfers.filter( transfer => transfer.value < 0 ).length; 
  if (valueTransfersLength != 0 && valueTransfersLength > deposit.length) {
    throw new Error(TransferErrors.INVALID_TRANSFER_OBJECT);
  }
  const amount = transfers.reduce((a,b) => a + b.value, 0);

  const deposits = deposit.reduce((a,b) => a + b, 0);
  if( amount > deposits || deposits < 0) {
    throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
  }

  transfers = transfers.map( transfer => {
    if (transfer.address in outputs) {
      transfer.value += outputs[transfer.address];
    }
    return transfer;
  });
  for(const addy in outputs) {
    if (!transfers.find(tx => tx.address == addy)) {
      transfers.push ({address: addy, value: outputs[addy]});
    }
  }
  const bundles = [];
  let multisigs = close ? getMinimumBranch(root) : getLastBranch(root);
  if(multisigs[0].bundles.length == MAX_USES) {
    throw new Error(TransferErrors.ADDRESS_OVERUSE);
  }
  for(let i = 0; i < multisigs.length - 1; i++) {
    if(multisigs[i].bundles.find(bundle => bundle.find(tx => tx.value > 0 && tx.address == remainder))) {
      multisigs = multisigs.slice(i+1);
    } else {
      break;
    }
  }
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
      obsoleteTag: ''      
    }];
    
    IOTACrypto.multisig.initiateTransfer( 
      input,
      remainder.address, 
      transfers,
      (err, success) => {
        bundles.push(success)
      }
    )
  })
  const multisig = multisigs[multisigs.length - 1];
  const input = {
    address: multisig.address,
    securitySum: multisig.securitySum,
    balance: balance
  };
  IOTACrypto.multisig.initiateTransfer( 
    input,
    remainder.address, 
    transfers,
    (err, success) => {
      bundles.push(success)
    }
  )
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
function applyTransfers(root, deposit, outputs, remainder, history, transfers) {
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
    let diff = getDiff(root, remainder, history, transfers);
    let remaining = deposit.reduce((a,b) => a+b, 0); 
    let total = diff.filter(v => v.value > 0).reduce((acc,tx) => acc + tx.value, 0);
    if (total > remaining) {
      throw new Error(TransferErrors.INSUFFICIENT_FUNDS);
    }
    const depositTotal = deposit.reduce((acc, d) => acc + d, 0);
    const depositDiff = deposit.map((d) => total * d / depositTotal);
    for(const i in deposit) {
      deposit[i] -= depositDiff[i];
    }
    for(let i = 0; i < diff.length; i++) {
      if(diff[i].address in outputs) {
        outputs[diff[i].address] += diff[i].value;
      } else {
        outputs[diff[i].address] = diff[i].value;
      }
    }
    transfers.map((transfer, i) => {
      multisigs[i].bundles.push(transfer);
    });
    history.push(transfers[transfers.length - 1]);
  } catch (e) {
    throw e;
  }
}

function getMultisigs(root, transfers) {
  let node = root;
  let firstTransfer = transfers[0].find(tx => tx.value < 0)
  while(node.address != firstTransfer.address && node.children.length != 0) {
    node = node.children[node.children.length - 1];
  }
  if(node.address != firstTransfer.address) {
    throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
  }
  let multisigs = [];
  let i = 0;
  multisigs.push(node)
  while (node.children.length != 0 && ++i < transfers.length) {
    node = node.children.find(m => m.address == transfers[i].find(tx => tx.value < 0).address);
    if(node.bundles.length == MAX_USES) {
      throw new Error(TransferErrors.ADDRESS_OVERUSE);
    }
    if(!node) {
      throw new Error(TransferErrors.ADDRESS_NOT_FOUND);
    }
    multisigs.push(node);
  }
  return multisigs;
}

/**
 *
 * @return {[{object}]} signatures
 */
function sign(root, seed, bundles) {
  const multisigs = getMultisigs(root, bundles);
  return helpers.deepClone(bundles).map((bundle, i) => {
    const multisig = multisigs[i];
    // multisig has member signingIndex
    bundle
      .filter(tx => tx.address == multisig.address)
      .slice(0,multisig.signingIndex)
      .map(tx => {
        if(
          IOTACrypto
          .utils
          .inputValidator
          .isNinesTrytes(tx.signatureMessageFragment)
        ) {
          tx.signatureMessageFragment = 
            tx.signatureMessageFragment.replace(/^9/,'A');
        }
      });

      var sigs = []
      IOTACrypto.multisig.addSignature(bundle, multisig.address, IOTACrypto.multisig.getKey(seed, multisig.index, multisig.security), (err, suc) => {
        sigs = { bundle: bundle[0].bundle,
          address: multisig.address,
          index: multisig.signingIndex,
          signatureFragments: suc
          .filter(tx => tx.address == multisig.address)
          .map(tx => tx.signatureMessageFragment)
          .slice(multisig.signingIndex, multisig.signingIndex + multisig.security)
        }
      }) 
      return sigs
  });
}

/**
 * signatures is an array of signatures for this bundle
 */
function appliedSignatures(bundles, signatures) {
  return helpers.deepClone(bundles).map((bundle, i) => {
    let userSignature = signatures[i];//.find(s => s.bundle == bundle[0].bundle);
    if (userSignature) {
      let addy = bundle.find(tx => tx.value < 0 ).address;
      bundle
        .filter(tx => tx.address == addy)
        .slice(userSignature.index, userSignature.index + userSignature.signatureFragments.length)
        .map((tx,j) => tx.signatureMessageFragment = userSignature.signatureFragments[j]);
      // add signature
    }
    return bundle;
  });
}

/**
 * Adds signatures to bundles
 *
 * @param {object} bundle the bundle to add signatures to
 * @param {string} address the address for the signatures
 * @param {array} signatures a 2d array of signatures for each bundle
 *
 * example usage:
 * bundles.map((bundle, i) => 
 *   addSignatures(
   *   bundle, 
   *   bundle.find(tx => tx.value < 0).address, 
   *   signatures[i]
 *   )
 * )
 */
function addSignatures(bundle, address, signatures) {
  bundle.filter(tx => tx.address == address).map((tx, i) => {
    tx.signatureMessageFragment = signatures[i];
  });
}

function getDiff(root, remainder, history, bundles) {
  if(!root) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(!remainder) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(!history) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  if(!bundles) {
    throw new Error(TransferErrors.NULL_VALUE);
  }
  const initialInputTransaction = bundles[0].filter(bundle => bundle.value < 0)[0];
  if (!initialInputTransaction) {
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
    if(!inputTransaction || inputTransaction.address != multisigs[i].address) {
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
  const previousRemainder = previousTransfer.filter(tx => tx.address == remainder.address && tx.value > 0).reduce((acc, v) => acc + v.value, 0);
  const newRemainder = lastTransfer.filter(tx => tx.address == remainder.address)
    .map(tx => tx.value )
    .reduce((acc, v) => acc + v, 0)
  if(newRemainder.value > previousRemainder.value) {
    throw new Error(TransferErrors.REMAINDER_INCREASED);
  }
  const newCopy = helpers.deepClone(lastTransfer
    .filter(tx => tx.value > 0)
    .map(tx => Object({address: tx.address, value: tx.value})))
    .filter(tx => tx.address !== remainder.address)
  for(const tx of previousTransfer.filter(tx => tx.value > 0)) {
    const existing = newCopy.find(t => t.address == tx.address);
    if(existing) {
      existing.value -= tx.value;
    } else {
      newCopy.push({address: tx.address, value: tx.value});
    }
  }
  const negatives = newCopy.filter(tx => tx.value < 0);
  if(negatives.length != 0 ) {
    throw new Error(TransferErrors.INVALID_INPUT);
  }

  var minusRemainder = newCopy.filter(tx => tx.address !== remainder.address)

  return minusRemainder;
}

module.exports = {
  'prepare'        : prepare,
  'compose'        : compose,
  'close'          : close,
  'getDiff'        : getDiff,
  'sign'           : sign,
  'appliedSignatures': appliedSignatures,  
  'applyTransfers' : applyTransfers,
  'TransferErrors' : TransferErrors
}

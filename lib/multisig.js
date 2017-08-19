const IOTACrypto = require('iota.crypto.js');
const constants = require('./const');

function getDigest(seed, index, security) {
  return {
    'digest': IOTACrypto.multisig.getDigest(seed, index, security),
    'security': security,
    'index': index
  };
}

function composeAddress(digests) {
  const multisig = initializeAddress(digests);
  return finalizeAddress(multisig);
}

function initializeAddress(digests) {
  const address = new IOTACrypto.multisig.address();
  const multisig = {
    'address': address,
    'securitySum': 0,
    'children': [],
    'bundles': [],
  }
  if (digests) {
    return absorbAddressDigests(multisig, digests);
  }
  return multisig;
}

function absorbAddressDigests(multisig, digests) { 
  const toAbsorb = digests.map(digest => digest.digest);
  multisig.address = multisig.address.absorb(toAbsorb);
  multisig.securitySum += digests.reduce((sum, digest) => sum + digest.security, 0);
  return multisig;
}

function finalizeAddress(multisig) {
  if (multisig.securitySum <= 0) {
    throw new Error('Could not finalize address');
  }
  multisig.address = multisig.address.finalize();
  return multisig;
}

function initTreeWithCount(flash, txCount) {
  return initializeTree(flash, Math.ceil(Math.log(txCount)/Math.log(constants.MAX_USES)))
}

function initializeTree(flash, depth) {
  const root = initializeAddress();
  root.index = flash.state.index++;
  let node = root;
  for(let i = depth; i-- > 0;) {
    node.children.push(initializeAddress());
    node.index = flash.state.index++;
    node = node.children[0];
  }
  return root
}

function addBranch(root, start, branch) {
  let done = false;
  let node = root;
  for(node = root; node.address != start.address && node.children.length != 0; node = node.children[node.children.length - 1]) {}
  node.children.push(branch);
}

function updateLeafToRoot(flash) {
  let multisigs = [];
  for(let node = flash.state.root; node.children.length != 0; node = node.children[node.children.length - 1]) {
    multisigs.push(node);
  }
  let i;
  for(i = multisigs.length; i-- > 0 && multisigs[i].bundles.length == 3;) {
    multisigs[i] = initializeAddress();
    multisigs[i].index = flash.state.index++;
    if(i > 0) {
      multisigs[i-1].children.push(multisigs[i]);
    }
  }
  if(i > 0) {
    multisigs[i-1].children.push(multisigs[i]);
    return multisigs[i-1];
  }
  return multisigs[0];
}


module.exports = {
  getDigest            : getDigest,
  composeAddress       : composeAddress,
  initializeAddress    : initializeAddress,
  initializeTree       : initializeTree,
  initTreeWithCount    : initTreeWithCount,
  absorbAddressDigests : absorbAddressDigests,
  finalizeAddress      : finalizeAddress
};

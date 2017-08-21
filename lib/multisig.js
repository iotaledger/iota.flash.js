const IOTACrypto = require('iota.crypto.js');
const constants = require('./constants');

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

function updateLeafToRoot(root) {
  const multisigs = getLastBranch(root);
  let toGenerate = 0;
  let i;
  for(i = multisigs.length; i-- > 0 && multisigs[i].bundles.length == constants.MAX_USES;) {
    toGenerate++;
  }
  let node = multisigs[i];
  return {
    multisig: multisigs[i],
    generate: toGenerate
  }
}

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


module.exports = {
  getDigest            : getDigest,
  composeAddress       : composeAddress,
  initializeAddress    : initializeAddress,
  initializeTree       : initializeTree,
  initTreeWithCount    : initTreeWithCount,
  absorbAddressDigests : absorbAddressDigests,
  finalizeAddress      : finalizeAddress,
  updateLeafToRoot     : updateLeafToRoot,
  getLastBranch        : getLastBranch
};

const IOTACrypto = require('iota.crypto.js');
const tree       = require('./tree');

function getDigest(seed, index, security) {
  return {
    'digest': IOTACrypto.multisig.getDigest(seed, index, security),
    'security': seucrity,
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
    'index': null,
    'children': [],
    'bundles': [],
  }
  if (digests) {
    return absorbAddressDigests(multisig, digests);
  }
  return multisig;
}

function absorbAddressDigests(multisig, digests) { 
  if (digests.every(digest => digest.index !== digests[0].index)) {
    throw new Error('Digest indexes do not match');
  }
  const toAbsorb = digests.map(digest => digest.digest);
  multisig.address = multisig.address.absorb(toAbsorb);
  multisig.securitySum += digests.reduce((sum, digest) => sum + digest.security); 
  multisig.index = digests[0].index;
  return multisig;
}

function finalizeAddress(multisig) {
  if (multisig.index == null || multisig.securitySum <= 0) {
    throw new Error('Could not finilize address');
  }
  multisig.address = multisig.address.finalize();
  return multisig;
}

function addBranch(root, start, branch) {
  let done = false;
  let node = root;
  for(node = root; node.address != start.address; node = node.children[node.children.length - 1]) {}
  node.children.push(branch);
}

function updateLeafToRoot(root) {
  let multisigs = [];
  for(var node = root; node.children.length != 0; node = node.children[node.children.length - 1]) {
    multisigs.unshift(node);
  }
  var i;
  for(i = 0; multisigs[i].bundles.length == 3; i++) {
    multisigs[i] = initializeAddress();
    if(i > 0) {
      multisigs[i].children.push(multisigs[i-1]);
    }
  }
  multisigs[i].children.push(multisigs[i-1]);
  return i;
}


module.exports = {
  getDigest            : getDigests,
  composeAddress       : composeAddress,
  initializeAddress    : intitializeAddress,
  absorbAddressDigests : absorbAddressDigests,
  finalizeAddress      : finalizeAddress
};

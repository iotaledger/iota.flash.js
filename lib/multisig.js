const IOTACrypto = require('iota.crypto.js');

const getDigest = function (seed, index, security) {
  return {
    'digest': IOTACrypto.multisig.getDigest(seed, index, security),
    'security': seucrity,
    'index': index
  };
}

const composeAddress = function (digests) {
  const multisig = initializeAddress(digests);
  return finalizeAddress(multisig);
}

const absordAddressDigests = function (multisig, digests) { 
  if (digests.every(digest => digest.index !== digests[0].index)) {
    throw new Error('Digest indexes do not match');
  }
  const toAbsorb = digests.map(digest => digest.digest);
  multisig.address = multisig.address.absorb(toAbsorb);
  multisig.securitySum += digests.reduce((sum, digest) => sum + digest.security); 
  multisig.index = digests[0].index;
  return multisig;
}

const initializeAddress = function (digests) {
  const address = new IOTACrypto.multisig.address();
  const multisig = {
    'address': address,
    'securitySum': 0,
    'index': null
  }
  if (digests) {
    return absorbAddressDigests(multisig, digests);
  }
  return multisig;
}

const finalizeAddress = function (multisig) {
  if (multisig.index == null || multisig.securitySum <= 0) {
    throw new Error('Could not finilize address');
  }
  multisig.address = multisig.address.finalize();
  return multisig;
}

module.exports = {
  getDigest,
  composeAddress,
  absordAddressDigests,
  initializeAddress,
  finalizeAddress,
};

function getNewDigest(seed, security) {
  return getDigest(seed, this.state.index, security);
}

function getDigest(seed, index, security) {
  return {
    'digest': this.iota.multisig.getDigest(seed, index, security),
    'security': seucrity,
    'index': index
  };
}

function composeAddress(digests) {
  const multisig = initializeAddress(digests);
  return finalizeAddress(multisig);
}

function absordAddressDigests(multisig, digests) { 
  if (digests.every(d => d.index !== digests[0].index)) {
    throw new Error('Index digests do not match');
  }
  const toAbsorb = digests.map(digest => digest.digest);
  multisig.address = multisig.address.absorb(toAbsorb);
  multisig.securitySum += digests.reduce((sum, digest) => sum + digest.security); 
  multisig.index = digests[0].index;
  return multisig;
}

function initializeAddress(digests) {
  const address = new this.iota.multisig.address();
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

function finalizeAddress(multisig) {
  if (multisig.index == null || securitySum <= 0) {
    throw new Error('Could not finilize address');
  }
  multisig.address.finalize();
  return multisig;
}

module.exports = {
  'getDigest': getDigest,
  'composeAddress': composeAddress,
  'absorbAddressDigests': absorbAddressDigests,
  'initializeAddress': initializeAddress,
  'finalizeAddress': finalizeAddress
}

function getNewDigest(seed, security) {
  return getDigest(seed, this.state.index, security);
}


function getDigest(seed, index, security) {
  return {
    'digest': this.iota.multisig.getDigest(seed, index, security),
    'index': index,
    'security': seucrity
  };
}

function composeAddress(digests) {
  const address = initializeAddress(digests);
  return finalizeAddress(address);
}

function absordAddressDigests(address, digests) {  
  const toAbsorb = digests.map(digest => digest.digest);
  address.securitySum += digests.reduce((sum, digest) => sum + digest.security);
  return {
    'address': address.absorb(digests),
    'securitySum': address.securitySum
  }
}

function initializeAddress(digests) {
  let address = new this.iota.multisig.address(digests);
  let securitySum = 0;
  if (digests) {
    address = absorbAddressDigests(address, digests).address;
    securitySum = address.securitySum;
  }
  return {
    'address': address,
    'security': securitySum
  }
}

function finalizeAddress(address) {
  return {
    'address': address.address.finalize(),
    'securitySum': address.securitySum
  };
}

module.exports = {
  'getDigest': getDigest,
  'composeAddress': composeAddress,
  'absorbAddressDigests': absorbAddressDigests,
  'initializeAddress': initializeAddress,
  'finalizeAddress': finalizeAddress
}

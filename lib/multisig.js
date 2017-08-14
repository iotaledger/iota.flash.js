const IOTA = require('iota.lib.js');

function multisig(iota) {
  this.iota = iota instanceof IOTA ? options.iota : new IOTA();
}

multisig.prototype.getDigest = function (seed, index, security) {
  return {
    'digest': this.iota.multisig.getDigest(seed, index, security),
    'security': seucrity,
    'index': index
  };
}

multisig.prototype.composeAddress = function (digests) {
  const multisig = this.initializeAddress(digests);
  return this.finalizeAddress(multisig);
}

multisig.prototype.absordAddressDigests = function (multisig, digests) { 
  if (digests.every(digest => digest.index !== digests[0].index)) {
    throw new Error('Index digests do not match');
  }
  const toAbsorb = digests.map(digest => digest.digest);
  multisig.address = multisig.address.absorb(toAbsorb);
  multisig.securitySum += digests.reduce((sum, digest) => sum + digest.security); 
  multisig.index = digests[0].index;
  return multisig;
}

multisig.prototype.initializeAddress = function (digests) {
  const address = new this.iota.multisig.address();
  const multisig = {
    'address': address,
    'securitySum': 0,
    'index': null
  }
  if (digests) {
    return this.absorbAddressDigests(multisig, digests);
  }
  return multisig;
}

multisig.prototype.finalizeAddress = function (multisig) {
  if (multisig.index == null || multisig.securitySum <= 0) {
    throw new Error('Could not finilize address');
  }
  multisig.address = multisig.address.finalize();
  return multisig;
}

module.exports = multisig;

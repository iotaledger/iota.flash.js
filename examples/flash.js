const IOTACrypto = require('iota.crypto.js');
const Flash = require('../lib/flash');
const multisig = require('../lib/multisig');

const seed = 'MTKVOCPRNTYCPSZJIXSOZEDCJBCG9BLEQMCCBSKOOKT9UMCYMAYFKWJZKGRVWZDEERGCMD9O9BEJNCQNY';
const otherSeed = 'GBANYOVNVX99RLMPEONK9GIKLJURDIWIYVCHN9EHLGWQIDOPJNVPMCWEAEQUKBVWJMXSYRYXIRRSALBQW';

let digests = [
  multisig.getDigest(seed, 0, 2),
  multisig.getDigest(otherSeed, 0, 2)
];
console.log(digests);

let multisigs = [
  multisig.composeAddress(digests)
];
console.log(multisigs[0]);

let remainderAddress = multisigs[0].address;

const flash = new Flash({
  'index': 0,
  'signersCount': 2,
  'balance': 100,
  'deposit': [50, 50],
  'stakes': [0.5, 0.5],
  'outputs': {},
  'transfers': [],
  'remainderAddress': remainderAddress 
});

digests = [
  multisig.getDigest(seed, 1, 2),
  multisig.getDigest(otherSeed, 2, 2)
];

multisigs = [
  multisig.composeAddress(digests)
];

let bundles = flash.composeTransfer(multisigs, 0, [{
  'address': 'ZGHXPZYDKXPEOSQTAQOIXEEI9K9YKFKCWKYYTYAUWXK9QZAVMJXWAIZABOXHHNNBJIEBEUQRTBWGLYMTX',
  'value': 2
}]);

console.log('Transfer', bundles);

let diff = flash.getTransferDiff(multisigs, bundles);

let signedBundles = flash.signTransfer(seed, 1, 2, multisigs, 0, bundles);
signedBundles = flash.signTransfer(otherSeed, 2, 2, multisigs, 0, signedBundles);

signedBundles.forEach((bundle, i) => {
  console.log('Sigs matching:', IOTACrypto.utils.validateSignatures(bundle, multisigs[i].address));
});

digests = [
  multisig.getDigest(otherSeed, 4, 2),
  multisig.getDigest(seed, 10, 1)
];

multisigs.push(multisig.composeAddress(digests));

bundles.concat(flash.composeTransfer(multisigs, 0, [{
  'address': 'QVJBIXAHSGZKFMJYTCWEVQFZPD9I99JM9ZZCSJFVVMZMGKI99NUROUXHHGEMZZQZG9GHUAFFJOXDIKJZW',
  'value': 1 
}]));

console.log('Transfer:', bundles);

signedBundles = flash.signTransfer(otherSeed, 4,  2, multisigs, 0, bundles);
signedBundles = flash.signTransfer(seed, 10,  1, multisigs, 0, signedBundles);

signedBundles.forEach((bundle, i) => {
  console.log('Sigs matching:', IOTACrypto.utils.validateSignatures(bundle, multisigs[i].address));
});

diff = flash.getTransferDiff(multisigs, bundles);

console.log('Diff:', diff);


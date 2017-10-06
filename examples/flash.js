////////////////////////////////////////////////
//////////////  FLASH EXAMPLE  /////////////////
////////////////////////////////////////////////
// This example sets up a channel         //////
// then makes a transfer from USER ONE    //////
// to USER TWO.                           //////
////////////////////////////////////////////////

const IOTACrypto = require("iota.crypto.js")
const transfer = require("../lib/transfer")
const multisig = require("../lib/multisig")

const oneSeed =
  "USERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSERONEUSER"
const oneSettlement =
  "USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9USERONE9ADDRESS9U"
const twoSeed =
  "USERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSERTWOUSER"
const twoSettlement =
  "USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9USERTWO9ADDRESS9U"

//////////////////////////////////
// INITIAL CHANNEL CONDITIONS

// Security level
const SECURITY = 2
// Number of parties taking signing part in the channel
const SIGNERS_COUNT = 2
// Flash tree depth
const TREE_DEPTH = 4
// Total channel Balance
const CHANNEL_BALANCE = 2000
// Users deposits
const DEPOSITS = [1000, 1000]

//////////////////////////////////
// INITAL FLASH OBJECTS

// USER ONE - Initial Flash Object
var oneFlash = {
  userIndex: 0,
  userSeed: oneSeed,
  index: 0,
  security: SECURITY,
  depth: TREE_DEPTH,
  bundles: [],
  partialDigests: [],
  flash: {
    signersCount: SIGNERS_COUNT,
    balance: CHANNEL_BALANCE,
    deposit: DEPOSITS,
    outputs: {},
    transfers: []
  }
}

//////////////////////////////////
// USER TWO - Initial Flash Object
var twoFlash = {
  userIndex: 1,
  userSeed: twoSeed,
  index: 0,
  security: SECURITY,
  depth: TREE_DEPTH,
  bundles: [],
  partialDigests: [],
  flash: {
    signersCount: SIGNERS_COUNT,
    balance: CHANNEL_BALANCE,
    deposit: DEPOSITS,
    outputs: {},
    transfers: []
  }
}
console.log("Flash objects created!")

//////////////////////////////
//////  SETUP CHANNEL   //////
//////////////////////////////
// GENERATE DIGESTS

// USER ONE
// Create digests for the start of the channel
for (let i = 0; i < TREE_DEPTH + 1; i++) {
  // Create new digest
  const digest = multisig.getDigest(
    oneFlash.userSeed,
    oneFlash.index,
    oneFlash.security
  )
  // Increment key index
  oneFlash.index++
  oneFlash.partialDigests.push(digest)
}

// USER TWO
// Create digests for the start of the channel
for (let i = 0; i < TREE_DEPTH + 1; i++) {
  // Create new digest
  const digest = multisig.getDigest(
    twoFlash.userSeed,
    twoFlash.index,
    twoFlash.security
  )
  // Increment key index
  twoFlash.index++
  twoFlash.partialDigests.push(digest)
}
console.log("Inital digests generated!")

//////////////////////////////////
// INITAL MULTISIG

// Make an array of digests
let allDigests = []
allDigests[oneFlash.userIndex] = oneFlash.partialDigests
allDigests[twoFlash.userIndex] = twoFlash.partialDigests

// Generate the first addresses
// NOTE: this would be done separately in real life
let oneMultisigs = oneFlash.partialDigests.map((digest, index) => {
  // Create address
  let addy = multisig.composeAddress(
    allDigests.map(userDigests => userDigests[index])
  )
  // Add key index in
  addy.index = digest.index
  // Add the signing index to the object IMPORTANT
  addy.signingIndex = oneFlash.userIndex * digest.security
  // Get the sum of all digest security to get address security sum
  addy.securitySum = allDigests
    .map(userDigests => userDigests[index])
    .reduce((acc, v) => acc + v.security, 0)
  // Add Security
  addy.security = digest.security
  return addy
})

let twoMultisigs = twoFlash.partialDigests.map((digest, index) => {
  // Create address
  let addy = multisig.composeAddress(
    allDigests.map(userDigests => userDigests[index])
  )
  // Add key index in
  addy.index = digest.index
  // Add the signing index to the object IMPORTANT
  addy.signingIndex = twoFlash.userIndex * digest.security
  // Get the sum of all digest security to get address security sum
  addy.securitySum = allDigests
    .map(userDigests => userDigests[index])
    .reduce((acc, v) => acc + v.security, 0)
  // Add Security
  addy.security = digest.security
  return addy
})

console.log("Multisigs generated!")

//////////////////////////////////
// CONSUME & ORGANISE ADDRESSES FOR USE

// Set remainder address (Same on both users)
oneFlash.flash.remainderAddress = oneMultisigs.shift()
twoFlash.flash.remainderAddress = twoMultisigs.shift()

// Nest trees
for (let i = 1; i < oneMultisigs.length; i++) {
  oneMultisigs[i - 1].children.push(oneMultisigs[i])
}
for (let i = 1; i < twoMultisigs.length; i++) {
  twoMultisigs[i - 1].children.push(twoMultisigs[i])
}

// Set deposit address (Same on both users)
// NOTE: Checksum added so users can consume manually
// let depositAddress = iota.utils.addChecksum(multisigs[0].address)
// oneFlash.flash.depositAddress = depositAddress
// twoFlash.flash.depositAddress = depositAddress

// Set Flash root
oneFlash.flash.root = oneMultisigs.shift()
twoFlash.flash.root = twoMultisigs.shift()

// Set settlement addresses (Usually sent over when the digests are.)
let settlementAddresses = [oneSettlement, twoSettlement]
oneFlash.flash.settlementAddresses = settlementAddresses
twoFlash.flash.settlementAddresses = settlementAddresses

// Set digest/key index
oneFlash.index = oneFlash.partialDigests.length
twoFlash.index = twoFlash.partialDigests.length

console.log("Channel Setup!")
console.log(
  "Spent tokens: ",
  CHANNEL_BALANCE - oneFlash.flash.deposit.reduce((acc, v) => acc + v)
)

//////////////////////////////
/////  SETUP FINISHED   //////
//////////////////////////////

//////////////////////////////
// COMPOSE TX from USER ONE //
//////////////////////////////

console.log("Creating Transaction")
console.log("Sending 100 tokens to ", twoSettlement)

//////////////////////////////
/// Check for a Branch
// From the LEAF recurse up the tree to the ROOT
// and find how many new addresses need to be
// generated if any.
let toUse = multisig.updateLeafToRoot(oneFlash.flash.root)
if (toUse.generate != 0) {
  // Tell the server to generate new addresses, attach to the multisig you give
  // await Channel.getNewBranch(toUse.multisig, toUse.generate)
}
/////////////////////////////////
/// CONSTRUCT BUNDLES
let bundles
try {
  // Create transfer array pointing to USER TWO
  transfers = [
    {
      value: 100,
      address: twoSettlement
    }
  ]
  // Prepare the transfer.
  let newTansfers = transfer.prepare(
    oneFlash.flash.settlementAddresses,
    oneFlash.flash.deposit,
    oneFlash.userIndex,
    transfers
  )

  // Compose the transfer bundles
  bundles = transfer.compose(
    oneFlash.flash.balance,
    oneFlash.flash.deposit,
    oneFlash.flash.outputs,
    toUse.multisig,
    oneFlash.flash.remainderAddress,
    oneFlash.flash.transfers,
    newTansfers,
    false
  )
} catch (e) {
  console.log("Error: ", e)
  return false
}

/////////////////////////////////
/// SIGN BUNDLES

// Get signatures for the bundles
const oneSignatures = transfer.sign(
  toUse.multisig,
  oneFlash.userSeed,
  bundles,
  oneFlash.userIndex
)

// Generate USER TWO'S Singatures
const twoSignatures = transfer.sign(
  twoFlash.flash.root,
  twoFlash.userSeed,
  bundles,
  twoFlash.userIndex
)

// Sign bundle with your USER ONE'S signatures
let signedBundles = transfer.appliedSignatures(bundles, oneSignatures)

// ADD USER TWOS'S signatures to the partially signed bundles
signedBundles = transfer.appliedSignatures(signedBundles, twoSignatures)

/////////////////////////////////
/// APPLY SIGNED BUNDLES

// Apply
transfer.applyTransfers(
  oneFlash.flash.root,
  oneFlash.flash.deposit,
  oneFlash.flash.outputs,
  oneFlash.flash.remainderAddress,
  oneFlash.flash.transfers,
  signedBundles
)
console.log(oneFlash.flash.deposit)
// Save latest channel bundles
oneFlash.bundles = signedBundles

transfer.applyTransfers(
  twoFlash.flash.root,
  twoFlash.flash.deposit,
  twoFlash.flash.outputs,
  twoFlash.flash.remainderAddress,
  twoFlash.flash.transfers,
  signedBundles
)
// Save latest channel bundles
twoFlash.bundles = signedBundles

console.log("Transaction Applied!")
console.log("Spent tokens: ", oneFlash.flash.deposit)

// let digests = [
//   multisig.getDigest(seed, 0, 2),
//   multisig.getDigest(otherSeed, 0, 2)
// ];
// console.log(digests);

// let multisigs = [
//   multisig.composeAddress(digests)
// ];
// console.log(multisigs[0]);

// let remainderAddress = multisigs[0].address;

// const flash = new Flash({
//   'index': 0,
//   'signersCount': 2,
//   'balance': 100,
//   'deposit': [50, 50],
//   'stakes': [0.5, 0.5],
//   'outputs': {},
//   'transfers': [],
//   'remainderAddress': remainderAddress
// });

// digests = [
//   multisig.getDigest(seed, 1, 2),
//   multisig.getDigest(otherSeed, 2, 2)
// ];

// multisigs = [
//   multisig.composeAddress(digests)
// ];

// let bundles = flash.composeTransfer(multisigs, 0, [{
//   'address': 'ZGHXPZYDKXPEOSQTAQOIXEEI9K9YKFKCWKYYTYAUWXK9QZAVMJXWAIZABOXHHNNBJIEBEUQRTBWGLYMTX',
//   'value': 2
// }]);

// console.log('Transfer', bundles);

// let diff = flash.getTransferDiff(multisigs, bundles);

// let signedBundles = flash.signTransfer(seed, 1, 2, multisigs, 0, bundles);
// signedBundles = flash.signTransfer(otherSeed, 2, 2, multisigs, 0, signedBundles);

// signedBundles.forEach((bundle, i) => {
//   console.log('Sigs matching:', IOTACrypto.utils.validateSignatures(bundle, multisigs[i].address));
// });

// digests = [
//   multisig.getDigest(otherSeed, 4, 2),
//   multisig.getDigest(seed, 10, 1)
// ];

// multisigs.push(multisig.composeAddress(digests));

// bundles.concat(flash.composeTransfer(multisigs, 0, [{
//   'address': 'QVJBIXAHSGZKFMJYTCWEVQFZPD9I99JM9ZZCSJFVVMZMGKI99NUROUXHHGEMZZQZG9GHUAFFJOXDIKJZW',
//   'value': 1
// }]));

// console.log('Transfer:', bundles);

// signedBundles = flash.signTransfer(otherSeed, 4,  2, multisigs, 0, bundles);
// signedBundles = flash.signTransfer(seed, 10,  1, multisigs, 0, signedBundles);

// signedBundles.forEach((bundle, i) => {
//   console.log('Sigs matching:', IOTACrypto.utils.validateSignatures(bundle, multisigs[i].address));
// });

// diff = flash.getTransferDiff(multisigs, bundles);

// console.log('Diff:', diff);

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
const Helpers = require("./functions")

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
    deposit: DEPOSITS.slice(), // Clone correctly
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
    deposit: DEPOSITS.slice(), // Clone correctly
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
  "Transactable tokens: ",
  oneFlash.flash.deposit.reduce((acc, v) => acc + v)
)

//////////////////////////////
//////   TRANSACTING   //////

//////////////////////////////
// COMPOSE TX from USER ONE

console.log("Creating Transaction")
console.log("Sending 200 tokens to ", twoSettlement)

// Create transfer array pointing to USER TWO
let transfers = [
  {
    value: 200,
    address: twoSettlement
  }
]

// Create TX
var bundles = Helpers.createTransaction(oneFlash, transfers, false)

/////////////////////////////////
/// SIGN BUNDLES

// Get signatures for the bundles
let oneSignatures = Helpers.signTransaction(oneFlash, bundles)

// Generate USER TWO'S Singatures
let twoSignatures = Helpers.signTransaction(twoFlash, bundles)

// Sign bundle with your USER ONE'S signatures
let signedBundles = transfer.appliedSignatures(bundles, oneSignatures)

// ADD USER TWOS'S signatures to the partially signed bundles
signedBundles = transfer.appliedSignatures(signedBundles, twoSignatures)

/////////////////////////////////
/// APPLY SIGNED BUNDLES

// Apply transfers to User ONE
oneFlash = Helpers.applyTransfers(oneFlash, signedBundles)
// Save latest channel bundles
oneFlash.bundles = signedBundles

// Apply transfers to User TWO
twoFlash = Helpers.applyTransfers(twoFlash, signedBundles)
// Save latest channel bundles
twoFlash.bundles = signedBundles

console.log("Transaction Applied!")
console.log(
  "Transactable tokens: ",
  oneFlash.flash.deposit.reduce((acc, v) => acc + v)
)

// TO DO: ADD 2 MORE TXs to demo branching

//////////////////////////////
// CLOSE Channel

// Supplying the CORRECT varibles to create a closing bundle
bundles = Helpers.createTransaction(
  oneFlash,
  oneFlash.flash.settlementAddresses,
  true
)

/////////////////////////////////
/// SIGN BUNDLES

// Get signatures for the bundles
oneSignatures = Helpers.signTransaction(oneFlash, bundles)

// Generate USER TWO'S Singatures
twoSignatures = Helpers.signTransaction(twoFlash, bundles)

// Sign bundle with your USER ONE'S signatures
signedBundles = transfer.appliedSignatures(bundles, oneSignatures)

// ADD USER TWOS'S signatures to the partially signed bundles
signedBundles = transfer.appliedSignatures(signedBundles, twoSignatures)

/////////////////////////////////
/// APPLY SIGNED BUNDLES

// Apply transfers to User ONE
oneFlash = Helpers.applyTransfers(oneFlash, signedBundles)
// Save latest channel bundles
oneFlash.bundles = signedBundles

// Apply transfers to User TWO
twoFlash = Helpers.applyTransfers(twoFlash, signedBundles)
// Save latest channel bundles
twoFlash.bundles = signedBundles

console.log("Channel Closed")
console.log("Final Bundle to be attached: ")
console.log(signedBundles[0])

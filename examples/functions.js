////////////////////////////////////////////////
//////////////  FLASH EXAMPLE  /////////////////
////////////////////////////////////////////////
// This provides access to basic functions /////
// required for the channels use.          /////
////////////////////////////////////////////////

const IOTACrypto = require("iota.crypto.js")
const transfer = require("../lib/transfer")
const multisig = require("../lib/multisig")

const createTransaction = (user, actions, close) => {
  //////////////////////////////
  /// Check for a Branch
  // From the LEAF recurse up the tree to the ROOT
  // and find how many new addresses need to be
  // generated if any.
  let toUse = multisig.updateLeafToRoot(user.flash.root)
  if (toUse.generate != 0) {
    // Tell the server to generate new addresses, attach to the multisig you give
    // await Channel.getNewBranch(toUse.multisig, toUse.generate)
  }
  /////////////////////////////////
  /// CONSTRUCT BUNDLES
  let bundles
  let newTansfers
  try {
    // Check if its closing the channel
    if (!close) {
      // Prepare the transfer.
      newTansfers = transfer.prepare(
        user.flash.settlementAddresses,
        user.flash.deposit,
        user.userIndex,
        actions
      )
    } else {
      // Distribute the remaining channel balance amongst the channel users
      // NOTE: YOU MUST PASS THE SETTLEMENT ADDRESSES ARRAY as 'actions'
      newTansfers = transfer.close(actions, user.flash.deposit)
    }

    // Compose the transfer bundles
    bundles = transfer.compose(
      user.flash.balance,
      user.flash.deposit,
      user.flash.outputs,
      toUse.multisig,
      user.flash.remainderAddress,
      user.flash.transfers,
      newTansfers,
      close
    )
  } catch (e) {
    console.log("Error: ", e)
    return false
  }
  return bundles
}
const signTransaction = (user, bundles) => {
  return transfer.sign(user.flash.root, user.userSeed, bundles)
}
const applyTransfers = (user, bundles) => {
  transfer.applyTransfers(
    user.flash.root,
    user.flash.deposit,
    user.flash.outputs,
    user.flash.remainderAddress,
    user.flash.transfers,
    bundles
  )
  return user
}

module.exports = {
  createTransaction: createTransaction,
  signTransaction: signTransaction,
  applyTransfers: applyTransfers
}

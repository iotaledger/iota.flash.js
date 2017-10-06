# Flash Channels Javascript Library

It should be noted that this library as it stands right now is an **early beta release**. As such, there might be some unexpected results. Please join the community (see links below) and post issues, to ensure that the developers of the library can improve it.

> **Join the Discussion**

> If you want to get involved in the community, need help with getting setup, have any issues related with the library or just want to discuss Blockchain, Distributed Ledgers and IoT with other people, feel free to join our Slack. [Slack](http://slack.iota.org/) You can also ask questions on our dedicated forum at: [IOTA Forum](https://forum.iota.org/).

## Installation

### Node.js

```
npm install iotaledger/iota.flash.js
```

## Concepts

Flash Channels use a binary tree topology reduce the number of transactions to be attached. Usually each transfer would have to be attached to the tangle, Flash enables realtime streaming of tokens off-tangle.

#### Tree topology

![Binary Tree](https://cdn-images-1.medium.com/max/1600/1*KIEDG01OP4EGKHiKuKW-dA.png)

A binary tree approach takes advantage of the fact that a signature can be used up-to 2 times while remaining reasonably secure. This lets us build a tree, where the terminating nodes (Leaves) are the individual transactions that will occur in the Flash channel. The path from the Leaf the Root acts to transfer the **total** value of the Root down to the current Leaf.

Given we are constructing a tree, we must determine the number of transactions in the channel when opening it. If we want a **15** transaction channel, we must have a tree with the depth of 5 (`Math.ceil(log2(15)) + 1 `). 

As this uses log2, the larger the number of channel transactions the proportionally lower depth we need: ie. **1000** transactions require a depth of **10**, where a **2000** transaction channel require a depth of **11**. 

#### **Address Reuse**

A central tenant of IOTA's winternitz one time signature is that the address is not reused. In the case of Flash Channels, addresses can be reused **one** time. This degrades the security however given the `realtime` nature of the channel there is a reasonable expectation that the channel will have progressed before an attack could take place.  Please see a quick calculation relating to security [here](https://public.tangle.works/winternitz.pdf).

A common practice would be to chain Flash Channels in order to keep the 'channel' open. This is feesible 😉 given the lack of cost and the time required  to open channels.

#### Transferring Data

In Flash Channels there are two main type of data that is transferred. This is a proposed bundles and signatures related to that bundle. This the **ONLY** that should be transferred during the channel's operation. This allows a user to maintain their own Flash object (outlined below) and only mutates the state via the Flash library, preserving the integrity of the channel from their perspective.

#### **Integrity Checking**

Each proposed transfer replicates and then advances the whole state of the channel. It is imperative that each participant in the channel does a **diff **to check that the proposed transfer is not malicious and only contains the correct changes. This functionality is offered in the `getDiff()` function within the library.

> *Example*: A malicious user could craft a transfer that carries the correct values but change the remainder address, thus allowing them to take a large portion of the funds early in the channel's life.

#### **Multiparty channels**

Flash, at its core, is a set of rules governing how parties interact with the Multi-signature features of IOTA. Given this there is no limit to the number of users in a Flash Channel. This means you can have a **consensus** channel (all users agree) or a **M of N** channel (some users agree). 

- Consensus would be good for logistically complex interactions with a large number of interrelated parties. 
- M of N would work well for interactions where an arbiter could be present to help resolve disputes in the channel.

#### Staking the Channel

When users enter the channel they deposit funds into the newly generated deposit address (root of the binary tree). The amount they deposit is the amount of tokens they are able to spend in the channel. This amount also relates to trust as the amount they have deposit into this address is now under the control of all the parties that have signed the address. 

It is common practice to deposit equal amounts into a channel **([100,100])** as both users now have an **equal** amount of tokens at stake. Therefore any misbehaviour or disagreements would result in both users being in an equally bad position. This would be useful for transacting with unknown users or channels with bidirectional payments.

For situations with reputation involved, a more one-sided channel can be created **([100,0])**. This means that there is little incentive for the user with zero stake in the channel to be honest apart for a hit to their reputation. This is useful for one directional user **(100)** to machine **(0)** services where a business would otherwise have to hold large amounts of collateral in each of the Flash Channels open. ie EV Charging stations, an instant payment broker, or a streaming service. 

## API

### Flash Object

------

For the Flash Channel to operate, a state object should be constructed to manage it. Below describes the Flash object that is recommended for use. 

Each user has a copy of this object, however they should **never** transfer the object to each other. Each time a transfer occurs in the channel this object is updated by the `applyTransfers` function which updates all the required values to the latest channel state.

**Example Flash Object**

```javascript
{
    signersCount: 2, // Number of signers in a channel
  	balance: 2000, // total channel balance
    deposits: [1000,1000], // individual user deposits 
    settlementAddresses: ['ADKHAKXIW..', 'MAOODHQNA...'] // user's output addresses
    depositAddress: 'AJDGAJDJS...', // Address at index 1 w/ checksum
    remainderAddress: {...}, // Index 0 of the multisig addresses generated
    root: {...}, // Index 1+ of the multisig addresses generated
	outputs: {...},
    transfers: [...] // History of transfers within the channel
}
```

1. **signersCount**: `Int` Number of people partaking in the channel
2. **balance**: `Int` Index of the private key.
3. **deposits**: `Array` An array of the deposits of each channel user. 
4. **settlementAddresses**: `Array` Array of user's settlement addresses for use when closing the channel.
5. **depositAddress**: `String` Tryte encoded address string. This is the address at index `[1]` of the channel addresses
6. **remainderAddress**: `Object` Multisig object at address 
7. **root**: `Object` Multisig object at index `[1]`
8. **outputs**: `Object` Channel's outputs history is appended to this object
9. **transfers**: `Array` Channel's transfer history is appended to this array.

### Multisig

------

#### `getDigest()`

Generates the digest value of a key.

**Input**

```javascript
multisig.getDigest(seed, index, security)
```

1. **seed**: `String` Tryte encoded seed
2. **index**: 'Int' Index of the private key.
3. **security**: `Int` Security level to be used for the private key

**Returns**

1. `String` - digest represented in trytes.

------

#### `composeAddress()`

Wraps the compose address related functions of `iota.lib.js`. Returns a 81-tryte address from an Array of digests. 

*Note: The order of the digests in this function **must** be noted, as this order is required when signing the bundles.*

**Input**

```javascript
multisig.composeAddress([...digests])
```

1. **digests**: `Array` Array of digests represented in trytes

**Returns**

1. `String` - 81-tryte multisig address

------

#### `updateLeafToRoot`

Taking the `root` of the tree, this function walks from the Leaf up to the root and finds the first node from the Leaf which is able to be used to sign a new transaction from. If an address can't be reused it increments a counter which is used to generate new addresses from.

**Input**

```javascript
multisig.updateLeafToRoot(root)
```

1. **root**: `Object` Representation of the current state of the Flash tree

**Returns**

1. `Object` - An object containing the modified `multisigs` object to be used in the transactions and the number of new addresses `generate` required to complete the transaction. 

### Transfer

------

#### `prepare()`

This function checks for sufficient funds and return a transfer array that will correctly transfer the right amount of IOTA, in relation to channel stake, into the users settlement address . 

**Input**

```javascript
transfer.prepare(
  flash.settlementAddresses,
  flash.deposit,
  index,
  transfers
)
```

1. **settlementAddresses**: `array` the settlement addresses for each user
2. **deposit**: `array` the amount each user can still spend
3. **index**: `int` the index of the user used as an input
4. **transfers**: `array` the `{value, address}` destination of the output bundle (excluding remainder)

**Return**

1. `Array` - Transfer object 

------

#### `compose()`

This method takes the `transfers` object from the `transfer.prepare` function and takes the flash object then constructs the required bundle for the next state in the channel.

**Input**

```javascript
transfer.compose(
  flash.balance,
  flash.deposit,
  flash.outputs,
  multisig,
  flash.remainderAddress,
  flash.transfers,
  newTansfers,
  close
)
```

1. **balance**: `Int`  The total amount of iotas in the channel
2. **deposit**: `Array` The amount of iotas still available to each user to spend from
3. **outputs**: `String` The accrued outputs through the channel
4. **multisig**: `Object` history the leaf bundles
5. **remainderAddress**: `String` The remainder address of the Flash channel
6. **history**:`Array` Transfer history of the channel
7. **newTransfers**:`Array` transfers the array of outputs for the transfer
8. **close**:`Boolean` whether to use the minimum tree or not

**Return**

`Array` Array of constructed bundle representing the latest state of the Flash channel. These bundles do not have signatures. 

------

#### `sign()`

This takes the constructed bundles from `compose` and then generates an `array` of ordered signatures to be applied to the bundle.

**Input**

```javascript
transfer.sign(
  multisig,
  seed,
  bundles
)
```

1. **multisig**: `Object` history the leaf bundles
2. **seed**: `String` Tryte encoded seed
3. **bundles**: `Array` Array of bundles that require signatures.

**Return**

1. `Array` - An ordered array of signatures to be applied to the transfer bundle array. 

------

#### `appliedSignatures()`

This takes the bundles that have been generated by `compose` and the signatures of **one** user and then applies them to the bundle. Use this function to apply all the signatures to the bundle. 

The signatures **must** be applied in the order the address was generated. Otherwise the signatures will be invalid.

*Note: You use the output of this function to apply the next set of signatures.*

**Input**

```javascript
transfer.appliedSignatures(
  bundles, 
  signatures
)
```

1. **bundles**: `Array` Array of bundles that require signatures.
2. **signatures**: `Array` Ordered set of **one** users signatures to be applied to the proposed bundle.

**Return**

1. `Array` - An ordered array of bundles that have had the user's signatures applied.

------

#### `getDiff()`

This takes the channel history and latest bundles and runs checks to see where the changes are in the transfer.

*Note: this is already called in the `applyTransfers` function*

**Input**

```javascript
transfer.getDiff(
	root, 
  	remainder, 
  	history, 
  	bundles
)
```

1. **root**: `Array` multisig object starting at the root of the tree
2. **remainder**: `Object` multisig object of the remainder address
3. **history**:`Array` Transfer history of the channel
4. **bundles**: `Array` Array of bundles for the proposed transfer 

**Return**

1. `Array` - An array of diffs per address

------

#### `applyTransfers()`

**Input**

```javascript
transfer.applyTransfers(
  flash.root,
  flash.deposit,
  flash.outputs,
  flash.remainderAddress,
  flash.transfers,
  signedBundles
)
```

1. **root**: `Object` Representation of the current state of the Flash tree
2. **deposit**: `Array` The amount of iotas still available to each user to spend from
3. **outputs**: `String` The accrued outputs through the channel
4. **remainderAddress**: `String` The remainder address of the Flash channel
5. **history**:`Array` Transfer history of the channel
6. **signedBundles**:`Array` Signed bundle

**Return**

This function mutates the flash objects that are passed to it. If there is an error in applying the transfers ie. Signatures aren't valid, the function will throw an error.

------

#### `close()`

Used in place of the `prepare` function when closing the channel. This is used to generate the closing transfers to each settlement address. It does this by correctly dividing the remaining channel balance amongst the channel's users.

**Input**

```javascript
transfer.close(
  flash.settlementAddresses, 
  flash.deposit
)
```

1. **settlementAddresses**: `array` the settlement addresses for each user
2. **deposit**: `array` the amount each user can still spend

**Return**

1. `Array` - Closing transfer object 
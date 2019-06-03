require('dotenv').config();
const program = require('commander');
const Web3 = require('web3');
const { toBN, fromWei } = require('web3').utils;
const HDWalletProvider = require("truffle-hdwallet-provider");
const EthereumTx = require('ethereumjs-tx');
const bs58 = require('bs58');
const fs = require('fs');
const ldHelpers = require("../helpers/lockdropHelper.js");
const { getPrivateKeyFromEnvVar, getPrivateKeyFromEncryptedJson } = require("../helpers/util.js");

program
  .version('0.1.0')
  .option('-b, --balance', 'Get the total balance across all locks')
  .option('-l, --lock', 'Lock ETH with the lockdrop')
  .option('-s, --signal <contractAddress>', 'Signal a contract balance in the lockdrop')
  .option('-n, --nonce <nonce>', 'Transaction nonce that created a specific contract address')
  .option('-u, --unlock <contractAddress>', 'Unlock ETH from a specific lock contract')
  .option('-r, --remoteUrl <url>', 'The remote URL of an Ethereum node (defaults to localhost:8545)')
  .option('--unlockAll', 'Unlock all locks from the locally stored Ethereum address')
  .option('--lockdropContractAddress <addr>', 'The Ethereum address for the target Lockdrop (THIS IS A LOCKDROP CONTRACT)')
  .option('--allocation', 'Get the allocation for the current set of lockers')
  .option('--ending', 'Get the remaining time of the lockdrop')
  .option('--lockLength <length>', 'The desired lock length - (3, 6, or 12)')
  .option('--lockValue <value>', 'The amount of Ether to lock')
  .option('--edgewarePublicKey <publicKey>', 'Edgeware Public Key')
  .option('--isValidator', 'A boolean flag indicating intent to be a validator')
  .option('--locksForAddress <userAddress>', 'Returns the history of lock contracts for a participant in the lockdrop')
  .parse(process.argv);

function getWeb3(remoteUrl) {
  let provider;
  if (ETH_PRIVATE_KEY) {
    provider = new HDWalletProvider(ETH_PRIVATE_KEY, remoteUrl);
  } else {
    provider = new Web3.providers.HttpProvider(remoteUrl);
  }
  const web3 = new Web3(provider);
  return web3;
}

async function getCurrentTimestamp() {
  const block = await WEB3_INSTANCE.eth.getBlock("latest");
  return block.timestamp;
}

async function getLockdropAllocation(totalAllocation='5000000000000000000000000') {
  console.log('Fetching Lockdrop locked locks...');
  console.log("");
  const { locks, totalEffectiveETHLocked } = await ldHelpers.calculateEffectiveLocks(CONTRACT_INSTANCE);
  const { signals, totalEffectiveETHSignaled } = await ldHelpers.calculateEffectiveSignals(WEB3_INSTANCE, CONTRACT_INSTANCE);
  const totalEffectiveETH = totalEffectiveETHLocked.add(totalEffectiveETHSignaled);
  let json = await ldHelpers.getEdgewareBalanceObjects(locks, signals, totalAllocation, totalEffectiveETH);
  return json;
};

async function lock(length, value, isValidator=false) {
  // Ensure lock lengths are valid from the CLI
  if (['3','6','12'].indexOf(length) === -1) throw new Error('Invalid length, must pass in 3, 6, 12');
  console.log(`locking ${value} ether into Lockdrop contract for ${length} months. Receiver: ${edgewarePublicKey}, Validator: ${isValidator}`);
  console.log("");
  // Format lock length values as their respective enum values for the lockdrop contract
  let lockLength = (length == "3") ? 0 : (length == "6") ? 1 : 2;
  // Grab account's transaction nonce for tx params
  let txNonce = await WEB3_INSTANCE.eth.getTransactionCount(WEB3_INSTANCE.currentProvider.addresses[0]);
  // Convert ETH value submitted into WEI
  value = WEB3_INSTANCE.utils.toWei(value, 'ether');
  // Create tx params for lock function
  const tx = new EthereumTx({
    nonce: txNonce,
    from: WEB3_INSTANCE.currentProvider.addresses[0],
    to: LOCKDROP_CONTRACT_ADDRESS,
    gas: 150000,
    data: CONTRACT_INSTANCE.methods.lock(lockLength, EDGEWARE_PUBLIC_KEY, isValidator).encodeABI(),
    value: toBN(value),
  });
  try {
    // Sign the tx and send it
    tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txReceipt = await WEB3_INSTANCE.eth.sendSignedTransaction(raw);
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch (e) {
    console.log(e);
  }
}

async function signal(signalingAddress, creationNonce) {
  console.log(`Signaling from address ${signalingAddress} with nonce ${creationNonce} in lockdrop contract ${LOCKDROP_CONTRACT_ADDRESS}. Receiver ${EDGEWARE_PUBLIC_KEY}`);
  console.log("");

  try {
    // Default to HD-Wallet-Provider since EthereumJS-Tx breaks with Signal function
    const txReceipt = await CONTRACT_INSTANCE.methods.signal(signalingAddress, creationNonce, EDGEWARE_PUBLIC_KEY).send({
      from: WEB3_INSTANCE.currentProvider.addresses[0],
      gas: 150000,
    });
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch (e) {
    console.log(e);
  }
}

async function unlock(customUnlockContractAddress, nonce=undefined) {
  console.log(`Unlocking lock contract: ${customUnlockContractAddress}`);
  try {
    // Grab account's transaction nonce for tx params if nonce is not provided
    if (!nonce) {
      nonce = await WEB3_INSTANCE.eth.getTransactionCount(WEB3_INSTANCE.currentProvider.addresses[0]);
    }
    // Create generic send transaction to unlock from the lock contract
    const tx = new EthereumTx({
      nonce: nonce,
      from: WEB3_INSTANCE.currentProvider.addresses[0],
      to: customUnlockContractAddress,
      gas: 100000,
    });
    // Sign the tx and send it
    tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txReceipt = await WEB3_INSTANCE.eth.sendSignedTransaction(raw);
    console.log(`Transaction hash: ${txReceipt.transactionHash}`);
  } catch(e) {
    console.log(e);
  }
}

async function unlockAll() {
  console.log(`Fetching all locks for user ${WEB3_INSTANCE.currentProvider.addresses[0]} for lockdrop contract ${LOCKDROP_CONTRACT_ADDRESS}\n`);
  const balanceBefore = WEB3_INSTANCE.utils.fromWei((await WEB3_INSTANCE.eth.getBalance(WEB3_INSTANCE.currentProvider.addresses[0])), 'ether');
  console.log(`Balance before unlocking: ${balanceBefore}`);
  const locks = await getLocksForAddress(WEB3_INSTANCE.currentProvider.addresses[0]);
  let txNonce = await WEB3_INSTANCE.eth.getTransactionCount(WEB3_INSTANCE.currentProvider.addresses[0]);
  let promises = locks.map(async (lock, inx) => {
    return await unlock(lock.lockContractAddr, txNonce + inx);
  });

  await Promise.all(promises);
  const afterBalance = WEB3_INSTANCE.utils.fromWei((await WEB3_INSTANCE.eth.getBalance(WEB3_INSTANCE.currentProvider.addresses[0])), 'ether');
  console.log(`Balance after unlocking: ${afterBalance}`);
}

async function getBalance() {
  console.log(`Fetching Lockdrop balance from lockdrop contract ${LOCKDROP_CONTRACT_ADDRESS}\n`);
  let { totalETHLocked, totalEffectiveETHLocked } = await ldHelpers.getTotalLockedBalance(CONTRACT_INSTANCE);
  let { totalETHSignaled, totalEffectiveETHSignaled } = await ldHelpers.getTotalSignaledBalance(web3, CONTRACT_INSTANCE);
  return { totalETHLocked, totalEffectiveETHLocked, totalETHSignaled, totalEffectiveETHSignaled };
};

async function getEnding() {
  console.log(`Calculating ending of lock period for lockdrop contract ${LOCKDROP_CONTRACT_ADDRESS}\n`);
  const ending = await CONTRACT_INSTANCE.methods.LOCK_END_TIME().call();
  const now = await getCurrentTimestamp();
  return ending - now;
}

async function getLocksForAddress(userAddress) {
  const lockEvents = await ldHelpers.getLocks(CONTRACT_INSTANCE, userAddress);
  const now = await getCurrentTimestamp();

  let promises = lockEvents.map(async event => {
    let lockStorage = await ldHelpers.getLockStorage(WEB3_INSTANCE, event.returnValues.lockAddr);
    return {
      owner: event.returnValues.owner,
      eth: WEB3_INSTANCE.utils.fromWei(event.returnValues.eth, 'ether'),
      lockContractAddr: event.returnValues.lockAddr,
      term: event.returnValues.term,
      edgewarePublicKeys: event.returnValues.edgewareAddr,
      unlockTime: `${(lockStorage.unlockTime - now) / 60} minutes`,
    };
  });

  return await Promise.all(promises);
}

async function setupListeners() {
  const currentBlock = await WEB3_INSTANCE.eth.getBlockNumber();

  CONTRACT_INSTANCE.events.Signaled({
    fromBlock: currentBlock
  },
  (error, signalEvent) => {
    if (!error) {
      console.log(`Subscription to Signal event received event: `, signalEvent);
    } else {
      console.log(`Error with Signal event: ${error}`);
    }
  })
  .on('changed', (signalChangedEvent) => {
    console.log(`Subscription to Signal event received 'changed' event: `, signalChangedEvent);
  })
  .on('error', (error) => {
    console.error(`Error listening to Signal event: ${error}`);
  });
}

const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./build/contracts/Lockdrop.json').toString());
let LOCKDROP_CONTRACT_ADDRESS;
const LOCKDROP_CONTRACT_ADDRESS_MAINNET = process.env.LOCKDROP_CONTRACT_ADDRESS_MAINNET;
const LOCKDROP_CONTRACT_ADDRESS_ROPSTEN = process.env.LOCKDROP_CONTRACT_ADDRESS_ROPSTEN;
const EDGEWARE_PUBLIC_KEY = process.env.EDGEWARE_PUBLIC_KEY;
const INFURA_PATH = process.env.INFURA_PATH;
const LOCALHOST_URL = 'http://localhost:8545';
let REMOTE_URL;
const ETH_JSON_PASSWORD = process.env.ETH_JSON_PASSWORD;
const ETH_JSON_VERSION = process.env.ETH_JSON_VERSION;
let WEB3_INSTANCE;
let CONTRACT_INSTANCE;

let ETH_PRIVATE_KEY;
if (process.env.ETH_PRIVATE_KEY) {
  ETH_PRIVATE_KEY = getPrivateKeyFromEnvVar();
  console.log('Obtained private key from .env');
}

// Set lockdrop contract address depending on what .env (environment variable) is set.
// Defaults to Mainnet (if set)
if (LOCKDROP_CONTRACT_ADDRESS_MAINNET) {
  LOCKDROP_CONTRACT_ADDRESS = LOCKDROP_CONTRACT_ADDRESS_MAINNET;
} else if (LOCKDROP_CONTRACT_ADDRESS_ROPSTEN) {
  LOCKDROP_CONTRACT_ADDRESS = LOCKDROP_CONTRACT_ADDRESS_ROPSTEN
} else {
  throw new Error('Input a contract address for the Lockdrop contract');
}

// If no remote url provided, default to localhost
if (!program.remoteUrl) {
  if (INFURA_PATH) {
    REMOTE_URL = INFURA_PATH;
  } else {
    REMOTE_URL = LOCALHOST_URL;
  }
}

WEB3_INSTANCE = getWeb3(REMOTE_URL);

CONTRACT_INSTANCE = new WEB3_INSTANCE.eth.Contract(LOCKDROP_JSON.abi, LOCKDROP_CONTRACT_ADDRESS);

setupListeners();

// For all functions that require signing, ensure private key is stored in .env file
if (program.lock || program.signal || program.unlock || program.unlockAll) {
  if (!ETH_PRIVATE_KEY) {
    throw new Error('Please add your private key hex to a .env file in the project directory');
  }
}

if (ETH_JSON_VERSION) {
  if (!ETH_JSON_PASSWORD) {
    throw new Error('Please add the password to decrypt your encrypted JSON keystore file to a .env file in the project directory');
  }
  ETH_PRIVATE_KEY = getPrivateKeyFromEncryptedJson();
  console.log('Obtained private key from encrypted JSON file');
}

// For signaling and locking, ensure an edgeware public address is provided
if (program.signal || program.lock) {
  if (!program.edgewarePublicKey) {
    if (EDGEWARE_PUBLIC_KEY) {
      program.edgewarePublicKey = EDGEWARE_PUBLIC_KEY;
    } else {
      throw new Error('Please input valid Edgeware 32-byte public key(s) with --edgewarePublicKey');
    }
  }

  // If edgePublicKey is provided, ensure it is at least one 32-byte hex encoded string
  // Submitting multiple keys should be done by concatenating them
  if (program.edgewarePublicKey.indexOf('0x') === -1) {
    // Ensure length is multiple of 64 if sending multiple keys
    if (program.edgewarePublicKey.length % 64 !== 0) {
      throw new Error('Please input valid Edgeware 32-byte public key(s) with --edgewarePublicKey');
    }
  } else {
    // Remove first 0x regardless if it doesn't exist and check validity
    if (program.edgewarePublicKey.slice(2).length === 0) {
      throw new Error('Please input valid Edgeware 32-byte public key(s) with --edgewarePublicKey');
    } else if (program.edgewarePublicKey.slice(2).length % 64 !== 0) {
      throw new Error('Please input valid Edgeware 32-byte public key(s) with --edgewarePublicKey');
    }
  }
}

if (program.allocation) {
  (async function() {
    const json = await getLockdropAllocation();
    console.log(json);
    process.exit(0);
  })();
}

if (program.balance) {
  (async function() {
    let {
      totalETHLocked,
      totalETHSignaled,
      totalEffectiveETHLocked,
      totalEffectiveETHSignaled
    } = await getBalance();
    console.log(`Total ETH locked: ${fromWei(totalETHLocked, 'ether')}\nTotal ETH signaled: ${fromWei(totalETHSignaled, 'ether')}`);
    process.exit(0);
  })();
};

if (program.ending) {
  (async function() {
    const timeDiff = await getEnding();
    console.log(`Ending in ${(timeDiff) / 60} minutes`);
    process.exit(0);
  })();
}

if (program.lock) {
  // Ensure lock specific values are provided
  if (!program.lockLength || !program.lockValue) {
    throw new Error('Please input a length and value using --lockLength and --lockValue');
  }

  if (!!program.isValidator) {
    if (program.edgewarePublicKey.length < 192) {
      throw new Error('To validate you must submit 2 SR25519 public keys and 1 ED25519 publick key concatenated together with --edgewarePublicKey. An example of this would be to submit --edgewarePublicKey 0x9e8f2c6c9b0a4ef5d3c4c524b0f49d7ac60f10a3b0649ff45c0f273420a34732fe1c6e6fd4ecee1cb391f58131ac91ea2debe06d7124564f2e5a03506fbd926dfb6eed2b4afc7284e6ab23f3a55d799a5cf2c64cf2f398f6eb11be5124a3ccfa.');
    }
  }
  // Submit tx
  (async function() {
    await lock(program.lockLength, program.lockValue, (!!program.isValidator));
    process.exit(0);
  })();
}

if (program.signal) {
  // Check if signaling contract is actually a non-contract address, i.e. the address of the private key
  const providerAddress = getWeb3(REMOTE_URL).currentProvider.addresses[0];
  const isSame = (program.signal.toLowerCase() === providerAddress.toLowerCase());
  // If the provided address is a contract address (or not equal to the derived one), a nonce must be provided
  if (!isSame && !program.nonce) {
    throw new Error('Please input a transaction creation nonce for the signaling contract with --nonce. If signaling from a non-contract account use --nonce 0 or any value.');
  }
  // If the provided address is equal to the derived one, set a default nonce if none is provided
  if (isSame && !program.nonce) {
    program.nonce = 1;
  }
  // Submit tx
  (async function() {
    await signal(program.signal, program.nonce);
    process.exit(0);
  })();
}

// Unlock a specific lockdrop contract address
if (program.unlock) {
  (async function() {
    await unlock(program.unlock);
    process.exit(0);
  })();

}

if (program.unlockAll) {
  (async function() {
    await unlockAll();
    process.exit(0);
  })();

}

if (program.locksForAddress) {
  (async function() {
    const locks = await getLocksForAddress(program.locksForAddress);
    console.log(locks);
    process.exit(0);
  })();
}

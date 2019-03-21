require('dotenv').config();
const program = require('commander');
const Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx')
const fs = require('fs');
const ldHelpers = require("../helpers/lockdropHelper.js");

const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./build/contracts/Lockdrop.json').toString());
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_ADDRESS = process.env.ETH_ADDRESS;
const LOCALHOST_URL = 'http://localhost:8545';

program
  .version('0.1.0')
  .option('-b, --balance', 'Get the total balance across all locks')
  .option('-l, --lock', 'Lock ETH with the lockdrop')
  .option('-s, --signal <signalingAddress>', 'Signal a contract balance in the lockdrop')
  .option('-n, --nonce <nonce>', 'Transaction nonce that created a specific contract address')
  .option('-u, --unlock', 'Unlock ETH from a specific lock contract')
  .option('-r, --remoteUrl <url>', 'The remote URL of an Ethereum node (defaults to localhost:8545')
  .option('--lockContractAddress <addr>', 'The Ethereum address for a lock contract')
  .option('--lockdropContractAddress <addr>', 'lockers')
  .option('--lockers', 'Get the allocation for the current set of lockers')
  .option('--ending', 'Get the remaining time of the lockdrop')
  .option('--lockLength <length>', 'The desired lock length - (3, 6, or 12)')
  .option('--lockValue <value>', 'The amount of Ether denominated in WEI')
  .option('--pubKey <key>', 'Edgeware ED25519 pubKey in hex')
  .option('--isValidator', 'A boolean flag indicating intent to be a validator')
  .parse(process.argv);

async function getCurrentTimestamp(remoteUrl=LOCALHOST_URL) {
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
}

async function getLockdropLocks(lockdropContractAddress, remoteUrl=LOCALHOST_URL, totalIssuance='5000000000000000000000000000') {
  console.log('Fetching Lockdrop locked locks...');
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  const allocation = await ldHelpers.calculateEffectiveLocks(contract, totalIssuance);
  console.log(allocation);
  return allocation;
};

async function lock(lockdropAddress, length, value, pubKey, isValidator=false, remoteUrl=LOCALHOST_URL) {
  if (length != "3" || length != "6" || length != "12") throw new Error('Invalid length, must pass in 3, 6, 12');
  console.log(`locking ${value} into Lockdrop contract for ${length} days. Receiver: ${pubKey}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  let lockLength = (length == "3") ? 3 : (length == "6") ? 6 : 12;
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: lockdropAddress,
    gas: 150000,
    data: contract.methods.lock(length, pubKey, isValidator).encodeABI(),
    value,
  });

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString('hex');
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function signal(lockdropAddress, signalingAddress, nonce, pubKey, remoteUrl=LOCALHOST_URL) {
  console.log(`Signaling into Lockdrop contract from address ${signalAddr}. Receiver: ${pubKey}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: lockdropAddress,
    gas: 150000,
    data: contract.methods.signal(signalingAddress, nonce, pubKey).encodeABI(),
    value,
  }); 

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString();
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function unlock(lockContractAddress, remoteUrl=LOCALHOST_URL) {
  console.log(`Unlocking lock for account: ${coinbase}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  try {
    let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
    const tx = new EthereumTx({
      nonce: txNonce,
      from: ETH_ADDRESS,
      to: lockContractAddress,
      gas: 100000,
    });
    tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txHash = await web3.eth.sendSignedTransaction(raw);
    console.log(`Transaction send: ${txHash}`);
  } catch(e) {
    console.log(e);
  }
}

async function getBalance(lockdropContractAddress, remoteUrl=LOCALHOST_URL) {
  console.log('Fetching Lockdrop balance...');
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  return await ldHelpers.getTotalLockedBalance(contract);
};

async function getEnding(lockdropContractAddress, remoteUrl=LOCALHOST_URL) {
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  const coinbase = await web3.eth.getCoinbase();
  const ending = await contract.methods.LOCK_END_TIME().call({from: coinbase});
  const now = await getCurrentTimestamp(remoteUrl);
  console.log(`Ending in ${(ending - now) / 60} minutes`);
}

if (!program.lockdropContractAddress) {
  throw new Error('Input a contract address for the Lockdrop contract');
}

if (program.lockers) getLockdropLocks(program.lockdropContractAddress, program.remoteUrl);
if (program.balance) getBalance(program.lockdropContractAddress, program.remoteUrl);
if (program.ending) getEnding(program.lockdropContractAddress, program.remoteUrl);

if (program.lock) {
  if (!program.lockLength || !program.lockValue || !program.pubKey) {
    throw new Error('Please input a length and value using --lockLength, --lockValue and --pubKey');
  }
  lock(program.lockdropContractAddress, program.lockLength, program.lockValue, program.pubKey, (!!program.isValidator), program.remoteUrl);
}

if (program.signal) {
  if (!program.nonce || !program.pubKey) {
    throw new Error('Please input a transaction nonce for the sending account with --nonce and --pubKey');
  }
  signal(program.lockdropContractAddress, program.signal, program.nonce, program.pubKey, program.remoteUrl);
}

if (program.unlock) {
  if (!program.lockContractAddress) {
    throw new Error('Please input a lock contract address to unlock from with --lockContractAddress');
  } else {
    unlock(program.lockContractAddress)
  }
}

require('dotenv').config();
const program = require('commander');
const Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx')
const fs = require('fs');
const ldHelpers = require("../helpers/lockdropHelper.js");

const LOCKDROP_TESTNET_ADDRESS = "0xfEdf8Cada80F6311d193cB8460A7b2766BdC9459";
const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./build/contracts/Lockdrop.json').toString());
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_ADDRESS = process.env.ETH_ADDRESS;

const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, LOCKDROP_TESTNET_ADDRESS);

program
  .version('0.1.0')
  .option('-l, --lockers', 'lockers')
  .option('-b, --balance', 'balance')
  .option('-d, --deposit', 'deposit')
  .option('-w, --withdraw', 'withdraw')
  .option('--ending', 'ending')
  .option('--lockLength <length>', 'lockLength')
  .option('--lockValue <value>', 'lockValue')
  .option('--pubKey <key>', 'pubKey')
  .option('--isValidator', 'isValidator')
  .parse(process.argv);

async function getCurrentTimestamp() {
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
}

async function getLockdropLocks() {
  console.log('Fetching Lockdrop locked deposits...');
  console.log("");
  const allocation = await ldHelpers.calculateEffectiveLocks(contract, '5000000000000000000000000000');
  console.log(allocation);
  return allocation;
};

async function lock(length, value, pubKey, isValidator=false) {
  console.log(`Depositing ${value} into Lockdrop contract for ${length} days. Receiver: ${pubKey}`);
  console.log("");
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: LOCKDROP_TESTNET_ADDRESS,
    gas: 150000,
    data: contract.methods.lock(length, pubKey, isValidator).encodeABI(),
    value,
  });

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString('hex');
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function signal(addr, nonce, pubKey) {
  console.log(`Signaling into Lockdrop contract from address ${signalAddr}. Receiver: ${pubKey}`);
  console.log("");
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: LOCKDROP_TESTNET_ADDRESS,
    gas: 150000,
    data: contract.methods.signal(addr, nonce, pubKey).encodeABI(),
    value,
  }); 

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString();
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function withdraw(lockContractAddress) {
  console.log(`Withdrawing deposit for account: ${coinbase}`);
  console.log("");
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

async function getBalance() {
  console.log('Fetching Lockdrop balance...');
  console.log("");
  return await ldHelpers.getTotalLockedBalance(contract);
};

async function getEnding() {
  const coinbase = await web3.eth.getCoinbase();
  const ending = await contract.methods.LOCK_END_TIME().call({from: coinbase});
  const now = await getCurrentTimestamp();
  console.log(`Ending in ${(ending - now) / 60} minutes`);
}

if (program.lockers) getLockdropLocks();

if (program.balance) getBalance();

if (program.deposit) {
  if (!program.lockLength || !program.lockValue || !program.pubKey) {
    throw new Error('Please input a length and value using --lockLength, --lockValue and --pubKey');
  }
  lock(program.lockLength, program.lockValue, program.pubKey, program.isValidator);
}

if (program.withdraw) withdraw();

if (program.ending) getEnding();

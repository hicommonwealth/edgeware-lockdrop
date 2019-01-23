require('dotenv').config();
const program = require('commander');
const Web3 = require('web3');
const fs = require('fs');
const getLockdropDeposits = require("../helpers/lockdropHelper.js");

const LOCKDROP_TESTNET_ADDRESS = "";
const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./build/contracts/Lockdrop.json').toString());
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;

const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:9545"));
const contract = new web3.eth.Contract(Lockdrop_JSON.abi, Lockdrop_TESTNET_ADDRESS);

program
  .version('0.1.0')
  .option('-l, --lockers', 'lockers')
  .option('-b, --balance', 'balance')
  .option('-d, --deposit', 'deposit')
  .option('-w, --withdraw', 'withdraw')
  .option('--ending', 'ending')
  .option('--lockLength', 'lockLength')
  .option('--lockValue', 'lockValue')
  .option('--pubKey', 'pubKey')
  .option('--lockIndex', 'lockIndex')
  .parse(process.argv);

async function getCurrentTimestamp() {
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
}

async function getFormattedLockdropLockers() {
  console.log('Fetching Lockdrop locked deposits...');
  console.log("");
  const [_, genesisConfigBalances] = await getLockdropDeposits(contract);
  console.log(genesisConfigBalances);
};

async function depositIntoLockdrop(length, value, pubKey, isValidator) {
    console.log(`Depositing ${value} into Lockdrop contract for ${length} days. Receiver: ${pubKey}`);
    console.log("");
    const coinbase = await web3.eth.getCoinbase();
    const data = contract.methods.lock(length, pubKey, isValidator).encodeABI();
    const tx = await web3.eth.sendTransaction({
      from: coinbase,
      to: Lockdrop_TESTNET_ADDRESS,
      gas: 150000,
      value,
      data
    });
    console.log(`Transaction send: ${tx.transactionHash}`);
}

async function withdrawDeposit(lockAddress) {
  const coinbase = await web3.eth.getCoinbase();
  console.log(`Withdrawing deposit for account: ${coinbase}`);
  console.log("");
  const data = contract.methods.withdraw().encodeABI();
  try {
    const tx = await web3.eth.sendTransaction({
      from: coinbase,
      to: lockAddress,
      gas: 100000,
      data
    });
    console.log(`Transaction send: ${tx.transactionHash}`);
  } catch(e) {
    console.log(e);
  }
}

async function getLockdropBalance() {
  console.log('Fetching Lockdrop balance...');
  console.log("");
  const res = await web3.eth.getBalance(contract.options.address);
  console.log(res);
};

async function getEnding() {
  const coinbase = await web3.eth.getCoinbase();
  const ending = await contract.methods.ending().call({from: coinbase});
  const now = await getCurrentTimestamp();
  console.log(`Ending in ${(ending - now) / 60} minutes`);
}

console.log("");
console.log('You ordered a pizza with: Locks and drops');
console.log("");

if (program.lockers) getFormattedLockdropLockers();

if (program.balance) getLockdropBalance();

if (program.deposit) {
  if (!program.lockLength || !program.lockValue || !program.pubKey) {
    throw new Error('Please input a length and value using --lockLength, --lockValue and --pubKey');
  }
  depositIntoLockdrop(...program.args);
}

if (program.withdraw) withdrawDeposit();

if (program.ending) getEnding();

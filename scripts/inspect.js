#!/usr/bin/env node
require('dotenv').config();
const program = require('commander');
const fs = require('fs');
const { toBN } = require('web3').utils;

const EDG_DECIMALS = 18;
const EDG_PER_BN = toBN(Math.pow(10, EDG_DECIMALS));
const TOTAL_ISSUANCE = toBN('5_000_000_000'.replace(/_/g, ''));

program
  .version('0.1.0')
  .arguments('<public_key>')
  .parse(process.argv);

// Inspect the balance allocated to a <public_key>.
//
// Requires a valid `lockdrop_allocations.json` to be present in the
// root directory of this repository. If it is missing, follow the
// instructions for running `scripts/lockdrop.js` in the README.

if (!program.args || program.args.length !== 1) {
  program.help();
  return;
}

const publicKeys = program.args[0].replace(/^0x/, '');
if (publicKeys.length !== 64 && publicKeys.length !== 192) {
  throw new Error('Invalid length publicKey');
}

let genesisFile;
try {
  genesisFile = fs.readFileSync('genesis.json');
} catch (e) {
  throw new Error('genesis.json not found');
}

const genesis = JSON.parse(genesisFile);
const balances = new Map(genesis.balances);
const vesting = new Map(genesis.vesting.map((entry) => {
  const [ key, startingBlock, perBlock, balance ] = entry;
  // TODO startingBlock is 5256000? perBlock is 1? or is the latter nBlocks?
  if (startingBlock !== 5256000 || perBlock !== 1) {
    throw new Error('Invalid vesting found, quitting');
  }
  return [key, balance];
}));
const totalBalance = Array.from(balances.values())
      .reduce((total, bal) => total.add(toBN(bal)), toBN(0));

console.log(
  'Total balance allocated in genesis.json:',
  totalBalance.div(EDG_PER_BN).toNumber(), 'EDG');
console.log(
  'Total balance allocated in entirety:',
  TOTAL_ISSUANCE.toNumber(), 'EDG');

const printPublicKeyInfo = (publicKey) => {
  const balance = balances.get(publicKey) || 0;
  console.log(
    publicKey, '=>\n\t',
    toBN(balance).div(EDG_PER_BN).toNumber(), 'EDG',
    '-',
    (toBN(balance).div(EDG_PER_BN).toNumber() / TOTAL_ISSUANCE.toNumber() * 100).toFixed(5), '%'
  );
};

if (publicKeys.length === 64) {
  printPublicKeyInfo(publicKeys);
} else if (publicKeys.length === 192) {
  printPublicKeyInfo(publicKeys.slice(0, 64));
  printPublicKeyInfo(publicKeys.slice(64, 128));
  printPublicKeyInfo(publicKeys.slice(128, 192));
}

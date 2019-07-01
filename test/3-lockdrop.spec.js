const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;
const rlp = require('rlp');
const keccak = require('keccak');

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

contract('Lockdrop-3', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time);
  });

  it('should not break the first lock of the lockdrop', async function () {
    const sender = lockdrop.address;
    const nonce = (await web3.eth.getTransactionCount(sender));
    const nonceHex = `0x${nonce.toString(16)}`;
    const input = [ sender, nonce ];
    const rlpEncoded = rlp.encode(input);
    const contractAddressLong = keccak('keccak256').update(rlpEncoded).digest('hex');
    const contractAddr = `0x${contractAddressLong.substring(24)}`;

    await web3.eth.sendTransaction({
      from: accounts[0],
      to: contractAddr,
      value: web3.utils.toWei('1', 'ether'),
    });

    await lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: 1,
    });
  });
});
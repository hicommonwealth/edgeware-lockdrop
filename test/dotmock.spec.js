const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;
const rlp = require('rlp');
const keccak = require('keccak');

const DOTLock = artifacts.require("./DOTLock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");
const DOTMock = artifacts.require("./DOTMock.sol");

contract('DOTMock w/ Lockdrop', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time, {
      from: accounts[0],
    });
  });

  it('should mint 1000 tokens', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    assert.equal((await dots.balanceOf(accounts[0])), 1e18);
  });

  it('should lock up 1000 dots', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(lockdrop.address, 1000, { from: accounts[0] });
    let lockRes = await lockdrop.lockDOTs(THREE_MONTHS, accounts[0], false, 1000);
    let lockEvent = await ldHelpers.getDOTLocks(lockdrop, accounts[0]);
    lockEvent = lockEvent[0].args;
    assert.equal((await dots.balanceOf(accounts[0])), 1e18 - 1000);
    assert.equal((await dots.balanceOf(lockEvent.lockAddr)), 1000);
    assert.equal((await dots.balanceOf(lockdrop.address)), 0);
  });

  it('should unlock 1000 dots after the lock period has ended', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(lockdrop.address, 1000, { from: accounts[0] });
    let lockRes = await lockdrop.lockDOTs(THREE_MONTHS, accounts[0], false, 1000);
    let lockEvent = await ldHelpers.getDOTLocks(lockdrop, accounts[0]);
    lockEvent = lockEvent[0].args;
    const DOTLockContract = await DOTLock.at(lockEvent.lockAddr);
    let unlockTime = await DOTLockContract.unlockTime.call();
    unlockTime = unlockTime.toNumber();

    time = await utility.getCurrentTimestamp(web3);
    await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY, web3);
    let unlockRes = await DOTLockContract.sendTransaction({ from: accounts[0] });
    assert.equal((await dots.balanceOf(accounts[0])), 1e18);
    assert.equal((await dots.balanceOf(lockEvent.lockAddr)), 0);
  });

  it('should fail to lock DOTS before the lock period', async function () {
    let time = await utility.getCurrentTimestamp(web3);
    const newLockdrop = await Lockdrop.new(time + SECONDS_IN_DAY * 10);
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(newLockdrop.address, 1000, { from: accounts[0] });
    utility.assertRevert(newLockdrop.lockDOTs(THREE_MONTHS, accounts[0], true, 1000, {
      from: accounts[0],
    }));
  });

  it('should fail to send ETH to lock DOTs function', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(lockdrop.address, 1000, { from: accounts[0] });
    utility.assertRevert(lockdrop.lockDOTs(THREE_MONTHS, accounts[0], true, 1000, {
      from: accounts[0],
      value: 1,
    }));
  });

  it('should fail to unlock DOTS before the lock period', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(lockdrop.address, 1000, { from: accounts[0] });
    let lockRes = await lockdrop.lockDOTs(THREE_MONTHS, accounts[0], false, 1000);
    let lockEvent = await ldHelpers.getDOTLocks(lockdrop, accounts[0]);
    lockEvent = lockEvent[0].args;
    const DOTLockContract = await DOTLock.at(lockEvent.lockAddr);
    utility.assertRevert(DOTLockContract.sendTransaction({
      from: accounts[0],
    }));
  });

  it('should successfully signal with DOTS', async function () {
    let signalRes = await lockdrop.signalDOTs(accounts[0], 0, accounts[0], false);
    let signalEvent = await ldHelpers.getDOTSignals(lockdrop, accounts[0]);
    signalEvent = signalEvent[0].args;
    assert.equal(signalEvent.contractAddr, accounts[0]);
  });
});

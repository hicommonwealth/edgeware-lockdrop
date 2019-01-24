const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

contract('Lockdrop', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp();
    lockdrop = await Lockdrop.new(time);
  });

  it('should setup and pull constants', async function () {
    let time = await utility.getCurrentTimestamp();
    let LOCK_DROP_PERIOD = (await lockdrop.LOCK_DROP_PERIOD()).toNumber();
    let LOCK_START_TIME = (await lockdrop.LOCK_START_TIME()).toNumber();
    assert.equal(LOCK_DROP_PERIOD, SECONDS_IN_DAY * 14);
    assert.ok(LOCK_START_TIME <= time && time <= LOCK_START_TIME + 1000);
  });

  it('should lock funds and also be a potential validator', async function () {
    await lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: 1,
    });

    const lockEvents = await ldHelpers.getLocks(lockdrop, accounts[1]);
    assert.equal(lockEvents.length, 1);
    assert.equal(lockEvents[0].args.isValidator, true);

    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(event.returnValues.lockAddr);
    }));

    assert.equal(lockStorages[0].owner, lockEvents[0].returnValues.owner.toLowerCase());
  });

  it('should unlock the funds after the lock period has ended', async function () {
    const balBefore = await utility.getBalance(accounts[1]);
    let txHash = await lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const balAfter = await utility.getBalance(accounts[1]);

    const lockEvents = await ldHelpers.getLocks(lockdrop, accounts[1]);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(event.returnValues.lockAddr);
    }));
    let unlockTime = lockStorages[0].unlockTime;

    const lockContract = await Lock.at(lockEvents[0].returnValues.lockAddr);

    let time = await utility.getCurrentTimestamp();
    let res = await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY);

    txHash = await lockContract.sendTransaction({
      from: accounts[1],
      value: 0,
      gas: 50000,
    });

    const afterafter = await utility.getBalance(accounts[1]);
    assert.ok(balBefore > balAfter);
    assert.ok(afterafter > balAfter);
  });

  it('should not allow one to lock before the lock start time', async function () {
    let time = await utility.getCurrentTimestamp();
    const newLockdrop = await Lockdrop.new(time + SECONDS_IN_DAY * 10);
    utility.assertRevert(newLockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    }));
  });

  it('should not allow one to lock after the lock start time', async function () {
    await lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    utility.advanceTime(SECONDS_IN_DAY * 15);
    utility.assertRevert(lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    }));
  });

  it('should not allow one to lock up any different length than 3,6,12 months', async function () {
    utility.assertRevert(lockdrop.lock(3, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    }));
  });

  it('should fail to withdraw funds if not enough gas is sent', async function () {
    let time = await utility.getCurrentTimestamp();
    const newLockdrop = await Lockdrop.new(time);
    await newLockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const balAfter = await utility.getBalance(accounts[1]);

    const lockEvents = await ldHelpers.getLocks(newLockdrop, accounts[1]);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(event.returnValues.lockAddr);
    }));
    let unlockTime = lockStorages[0].unlockTime;
    const lockContract = await Lock.at(lockEvents[0].returnValues.lockAddr);

    time = await utility.getCurrentTimestamp();
    await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY);

    utility.assertRevert(lockContract.sendTransaction({
      from: accounts[1],
      value: 0,
      gas: 1,
    }));
  });
});

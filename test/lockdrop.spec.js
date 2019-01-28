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

    const lockEvents = await ldHelpers.getLocksForAddress(lockdrop, accounts[1]);
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

    const lockEvents = await ldHelpers.getLocksForAddress(lockdrop, accounts[1]);
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

    const lockEvents = await ldHelpers.getLocksForAddress(newLockdrop, accounts[1]);
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

  it('should generate the allocation for a substrate genesis spec with THREE_MONTHS term', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(THREE_MONTHS, a, true, {
        from: a,
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop, totalAllocation);
    let { validatingLocks, unvalidatingLocks } = allocation;

    for (key in validatingLocks) {
      assert.equal(validatingLocks[key].edgewareBalance, toBN(totalAllocation).div(toBN(accounts.length)).toString());
    }
  });

  it('should generate the allocation for a substrate genesis spec with SIX_MONTHS term', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(SIX_MONTHS, a, true, {
        from: a,
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop, totalAllocation);
    let { validatingLocks, unvalidatingLocks } = allocation;

    for (key in validatingLocks) {
      assert.equal(validatingLocks[key].edgewareBalance, '499999999800000000000000000');
    }
  });

  it('should generate the allocation for a substrate genesis spec with TWELVE_MONTHS term', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(TWELVE_MONTHS, a, true, {
        from: a,
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop, totalAllocation);
    let { validatingLocks, unvalidatingLocks } = allocation;

    for (key in validatingLocks) {
      assert.equal(validatingLocks[key].edgewareBalance, '499999999800000000000000000');
    }
  });

  it('should aggregate the balances for all non validators and separate for validators', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(TWELVE_MONTHS, accounts[1], false, {
        from: accounts[1],
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    await lockdrop.lock(TWELVE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop, totalAllocation);
    let { validatingLocks, unvalidatingLocks } = allocation;
    assert.equal(Object.keys(validatingLocks).length, 1);
    assert.equal(Object.keys(unvalidatingLocks).length, 1);
  });
});

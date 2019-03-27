const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;
const rlp = require('rlp');
const keccak = require('keccak');

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

contract('Lockdrop', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time);
  });

  it('should setup and pull constants', async function () {
    let time = await utility.getCurrentTimestamp(web3);
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
    const balBefore = await utility.getBalance(accounts[1], web3);
    let txHash = await lockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const balAfter = await utility.getBalance(accounts[1], web3);

    const lockEvents = await ldHelpers.getLocks(lockdrop, accounts[1]);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(event.returnValues.lockAddr);
    }));
    let unlockTime = lockStorages[0].unlockTime;

    const lockContract = await Lock.at(lockEvents[0].returnValues.lockAddr);

    let time = await utility.getCurrentTimestamp(web3);
    let res = await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY, web3);

    txHash = await lockContract.sendTransaction({
      from: accounts[1],
      value: 0,
      gas: 50000,
    });

    const afterafter = await utility.getBalance(accounts[1], web3);
    assert.ok(balBefore > balAfter);
    assert.ok(afterafter > balAfter);
  });

  it('should not allow one to lock before the lock start time', async function () {
    let time = await utility.getCurrentTimestamp(web3);
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

    utility.advanceTime(SECONDS_IN_DAY * 15, web3);
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
    let time = await utility.getCurrentTimestamp(web3);
    const newLockdrop = await Lockdrop.new(time);
    await newLockdrop.lock(THREE_MONTHS, accounts[1], true, {
      from: accounts[1],
      value: web3.utils.toWei('1', 'ether'),
    });

    const balAfter = await utility.getBalance(accounts[1], web3);

    const lockEvents = await ldHelpers.getLocks(newLockdrop, accounts[1]);
    const lockStorages = await Promise.all(lockEvents.map(event => {
      return ldHelpers.getLockStorage(event.returnValues.lockAddr);
    }));
    let unlockTime = lockStorages[0].unlockTime;
    const lockContract = await Lock.at(lockEvents[0].returnValues.lockAddr);

    time = await utility.getCurrentTimestamp(web3);
    await utility.advanceTime(unlockTime - time + SECONDS_IN_DAY, web3);

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
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, unvalidatingLocks } = allocation;

    // for (key in validatingLocks) {
    //   assert.equal(validatingLocks[key].edgewareBalance, toBN(totalAllocation).div(toBN(accounts.length)).toString());
    // }
  });

  it('should generate the allocation for a substrate genesis spec with SIX_MONTHS term', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(SIX_MONTHS, a, true, {
        from: a,
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, unvalidatingLocks } = allocation;

    // for (key in validatingLocks) {
    //   assert.equal(validatingLocks[key].edgewareBalance, toBN(totalAllocation).div(toBN(accounts.length)).toString());
    // }
  });

  it('should generate the allocation for a substrate genesis spec with TWELVE_MONTHS term', async function () {
    await Promise.all(accounts.map(async a => {
      return await lockdrop.lock(TWELVE_MONTHS, a, true, {
        from: a,
        value: web3.utils.toWei('1', 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, locks, totalETHLocked } = allocation;

    // for (key in validatingLocks) {
    //   assert.equal(validatingLocks[key].edgewareBalance, toBN(totalAllocation).div(toBN(accounts.length)).toString());
    // }
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
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, locks, totalETHLocked } = allocation;
    assert.equal(Object.keys(validatingLocks).length, 1);
    assert.equal(Object.keys(locks).length, 1);
  });

  it('should turn a lockdrop allocation into the substrate genesis format', async function () {
    await Promise.all(accounts.map(async (a, inx) => {
      return await lockdrop.lock(TWELVE_MONTHS, a, (Math.random() > 0.5) ? true : false, {
        from: a,
        value: web3.utils.toWei(`${inx + 1}`, 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, locks, totalETHLocked } = allocation;
    const signalAllocation = await ldHelpers.getEffectiveSignals(lockdrop);
    let { signals, totalETHSignaled } = signalAllocation;
    const totalETH = totalETHLocked.add(totalETHSignaled);
    let json = await ldHelpers.getEdgewareBalanceObjects(validatingLocks, locks, totalAllocation, totalETH);
    let validators = ldHelpers.selectEdgewareValidators(validatingLocks, totalAllocation, totalETH, 10);
    assert(validators.length < 10);
    assert.ok(json.hasOwnProperty('balances'));
    assert.ok(json.hasOwnProperty('vesting'));
  });

  it('should allow contracts to lock up ETH by signalling', async function () {
    const sender = accounts[0];
    const nonce = (await web3.eth.getTransactionCount(sender));
    const nonceHex = `0x${nonce.toString(16)}`;
    const input = [ sender, nonce ];
    const rlpEncoded = rlp.encode(input);
    const contractAddressLong = keccak('keccak256').update(rlpEncoded).digest('hex');
    const contractAddr = contractAddressLong.substring(24);
    await lockdrop.signal(`0x${contractAddr}`, nonce, sender, { from: sender });
    const lockEvents = await ldHelpers.getSignals(lockdrop, contractAddr);
  });

  it('ensure the contract address matches JS RLP script', async function () {
    const sender = accounts[0];
    const nonce = (await web3.eth.getTransactionCount(sender));
    const nonceHex = `0x${nonce.toString(16)}`;
    const input = [ sender, nonce ];
    const rlpEncoded = rlp.encode(input);
    const contractAddressLong = keccak('keccak256').update(rlpEncoded).digest('hex');
    const contractAddr = contractAddressLong.substring(24);

    let time = await utility.getCurrentTimestamp(web3);
    let tempLd = await Lockdrop.new(time);
    assert.equal(web3.utils.toBN(tempLd.address).toString(), web3.utils.toBN(contractAddr).toString());
  });
});

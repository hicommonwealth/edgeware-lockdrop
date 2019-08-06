const Promise = require('bluebird');
const { toBN, fromWei, hexToNumber } = require('web3').utils;
const bs58 = require('bs58');
const schedule = require('./schedule');

function getEffectiveValue(ethAmount, term, lockTime, lockStart, totalETH) {
  let additiveBonus;
  // get additive bonus if calculating allocation of locks
  if (lockTime && lockStart) {
    additiveBonus = schedule.getAdditiveBonus(lockTime, lockStart, totalETH);
  }

  if (term == '0') {
    // three month term yields no bonus
    return toBN(ethAmount).mul(toBN(100).add(additiveBonus)).div(toBN(100));
  } else if (term == '1') {
    // six month term yields 30% bonus
    return toBN(ethAmount).mul(toBN(130).add(additiveBonus)).div(toBN(100));
  } else if (term == '2') {
    // twelve month term yields 120% bonus
    return toBN(ethAmount).mul(toBN(220).add(additiveBonus)).div(toBN(100));
  } else if (term == 'signaling') {
    // 80% deduction
    return toBN(ethAmount).mul(toBN(20)).div(toBN(100));
  } else {
    // invalid term
    return toBN(0);
  }
}

const getLocks = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

const getSignals = async (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      contractAddr: address,
    }
  });
};

const getTotalLockedBalance = async (lockdropContract) => {
  let { totalETHLocked, totalEffectiveETHLocked } = await calculateEffectiveLocks(lockdropContract);
  return { totalETHLocked, totalEffectiveETHLocked };
};

const getTotalSignaledBalance = async (web3, lockdropContract) => {
  let { totalETHSignaled, totalEffectiveETHSignaled } = await calculateEffectiveSignals(web3, lockdropContract);
  return { totalETHSignaled, totalEffectiveETHSignaled };
};

const calculateEffectiveLocks = async (lockdropContracts) => {
  let totalETHLocked = toBN(0);
  let totalEffectiveETHLocked = toBN(0);
  const locks = {};
  const validatingLocks = {};

  let lockEvents = []
  for (index in lockdropContracts) {
    let events = await lockdropContracts[index].getPastEvents('Locked', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    lockEvents = [ ...lockEvents, ...events ];
  }



  // For truffle tests
  let lockdropStartTime;
  if (typeof lockdropContracts[0].LOCK_START_TIME === 'function') {
    lockdropStartTime = (await lockdropContracts[0].LOCK_START_TIME());
  } else {
    lockdropStartTime = (await lockdropContracts[0].methods.LOCK_START_TIME().call());
  }

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(data.eth, data.term, data.time, lockdropStartTime, totalETHLocked);
    totalETHLocked = totalETHLocked.add(toBN(data.eth));
    totalEffectiveETHLocked = totalEffectiveETHLocked.add(value);

    // Add all validators to a separate collection to do validator election over later
    if (data.isValidator) {
      if (data.edgewareAddr in validatingLocks) {
        validatingLocks[data.edgewareAddr] = {
          lockAmt: toBN(data.eth).add(toBN(validatingLocks[data.edgewareAddr].lockAmt)).toString(),
          effectiveValue: toBN(validatingLocks[data.edgewareAddr].effectiveValue).add(value).toString(),
          lockAddrs: [data.lockAddr, ...validatingLocks[data.edgewareAddr].lockAddrs],
        };
      } else {
        validatingLocks[data.edgewareAddr] = {
          lockAmt: toBN(data.eth).toString(),
          effectiveValue: value.toString(),
          lockAddrs: [data.lockAddr],
        };
      }
    }


    // Add all locks to collection, calculating/updating effective value of lock
    if (data.edgewareAddr in locks) {
      locks[data.edgewareAddr] = {
        lockAmt: toBN(data.eth).add(toBN(locks[data.edgewareAddr].lockAmt)).toString(),
        effectiveValue: toBN(locks[data.edgewareAddr].effectiveValue).add(value).toString(),
        lockAddrs: [data.lockAddr, ...locks[data.edgewareAddr].lockAddrs],
      };
    } else {
      locks[data.edgewareAddr] = {
        lockAmt: toBN(data.eth).toString(), 
        effectiveValue: value.toString(),
        lockAddrs: [data.lockAddr],
      };
    }
  });
  // Return validating locks, locks, and total ETH locked
  return { validatingLocks, locks, totalETHLocked, totalEffectiveETHLocked };
};

const calculateEffectiveSignals = async (web3, lockdropContracts, blockNumber=null) => {
  let totalETHSignaled = toBN(0);
  let totalEffectiveETHSignaled = toBN(0);
  let signals = {};

  let signalEvents = [];
  for (index in lockdropContracts) {
    let events = await lockdropContracts[index].getPastEvents('Signaled', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    signalEvents = [ ...signalEvents, ...events ];
  }

  const promises = signalEvents.map(async (event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance;
    try {
      if (blockNumber) {
        return await web3.eth.getBalance(data.contractAddr, blockNumber);
      } else {
        return await web3.eth.getBalance(data.contractAddr);
      }
    } catch(e) {
      return 0;
    }
  });
  // Resolve promises to ensure all inner async functions have finished
  let balances = await Promise.all(promises);
  signalEvents.forEach((event, index) => {
    const data = event.returnValues;
    // Get value for each signal event and add it to the collection
    let value = getEffectiveValue(balances[index], 'signaling');
    // Add value to total signaled ETH
    totalETHSignaled = totalETHSignaled.add(toBN(balances[index]));
    totalEffectiveETHSignaled = totalEffectiveETHSignaled.add(value);
    // Iterate over signals, partition reward into delayed and immediate amounts
    if (data.edgewareAddr in signals) {
      signals[data.edgewareAddr] = {
        signalAmt: toBN(balances[index]).add(toBN(signals[data.edgewareAddr].signalAmt)).toString(),
        delayedEffectiveValue: toBN(signals[data.edgewareAddr]
                                .delayedEffectiveValue)
                                .add(value.mul(toBN(75)).div(toBN(100)))
                                .toString(),
        immediateEffectiveValue: toBN(signals[data.edgewareAddr]
                                  .immediateEffectiveValue)
                                  .add(value.mul(toBN(25)).div(toBN(100)))
                                  .toString(),
      };
    } else {
      signals[data.edgewareAddr] = {
        signalAmt: toBN(balances[index]).toString(),
        delayedEffectiveValue: value.mul(toBN(75)).div(toBN(100)).toString(),
        immediateEffectiveValue: value.mul(toBN(25)).div(toBN(100)).toString(),
      };
    }
  });
  // Return signals and total ETH signaled
  return { signals, totalETHSignaled, totalEffectiveETHSignaled }
}

const getLockStorage = async (web3, lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: hexToNumber(vals[1]),
    };
  });
};

const selectEdgewareValidators = (validatingLocks, totalAllocation, totalEffectiveETH, numOfValidators) => {
  const sortable = [];
  // Add the calculated edgeware balances with the respective key to a collection
  for (var key in validatingLocks) {
      sortable.push([
        `0x${key.slice(0,-4).slice(4)}`,
        toBN(validatingLocks[key].effectiveValue).mul(toBN(totalAllocation)).div(totalEffectiveETH)
      ]);
  }

  // Sort and take the top "numOfValidators" from the collection
  return sortable
    .sort((a,b) => (a[1] > b[1]) ? 1 : ((b[1] > a[1]) ? -1 : 0))
    .slice(0, numOfValidators);
};

const getEdgewareBalanceObjects = (locks, signals, totalAllocation, totalEffectiveETH) => {
  let balances = [];
  let vesting = [];
  for (var key in locks) {
    if (key in signals) {
      // if key also signaled ETH, add immediate effective signal value to the locked value
      // FIXME: Proper base58 encoding once we receive future network ID
      const summation = toBN(locks[key].effectiveValue).add(toBN(signals[key].immediateEffectiveValue));
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(summation, totalAllocation, totalEffectiveETH),
      ]);
    } else {
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(locks[key].effectiveValue, totalAllocation, totalEffectiveETH).toString(),
      ]);
    }
  }

  for (var key in signals) {
    if (key in locks) {
      // if key locked, then we only need to create a vesting record as we created the balances record above
      vesting.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(signals[key].delayedEffectiveValue, totalAllocation, totalEffectiveETH).toString(),
        68400 * 365 // 1 year FIXME: see what vesting in substrate does
      ]);
    } else {
      // if key did not lock, then we need to create balances and vesting records
      // create balances record
      balances.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(signals[key].immediateEffectiveValue, totalAllocation, totalEffectiveETH).toString(),
      ]);
      // create vesting record
      vesting.push([
        bs58.encode(new Buffer(key.slice(2), 'hex')),
        mulByAllocationFraction(signals[key].delayedEffectiveValue, totalAllocation, totalEffectiveETH).toString(),
        68400 * 365 // 1 year FIXME: see what vesting in substrate does
      ]);
    }
  }

  return { balances: balances, vesting: vesting };
};

const mulByAllocationFraction = (amount, totalAllocation, totalEffectiveETH) => {
  return toBN(amount).mul(toBN(totalAllocation)).div(toBN(totalEffectiveETH));
}

module.exports = {
  getLocks,
  getSignals,
  getTotalLockedBalance,
  getTotalSignaledBalance,
  calculateEffectiveLocks,
  calculateEffectiveSignals,
  getLockStorage,
  selectEdgewareValidators,
  getEdgewareBalanceObjects,
};

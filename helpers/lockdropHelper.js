const Promise = require('bluebird');
const keyring = require('@polkadot/keyring');
const { toBN, fromWei, hexToNumber } = require('web3').utils;
const bs58 = require('bs58');
const schedule = require('./schedule');
const generalizedLocks = require('./generalizedLocks');

function getEffectiveValue(ethAmount, term, lockTime, lockStart, totalETH) {
  // multiplicative bonus starts at 100 / 100 = 1
  let bonus = toBN(100);
  // get multiplicative bonus if calculating allocation of locks
  if (lockTime && lockStart) {
    bonus = schedule.getEarlyParticipationBonus(lockTime, lockStart);
  }

  if (term == '0') {
    // three month term yields no bonus
    return toBN(ethAmount).mul(toBN(100).mul(bonus)).div(toBN(10000));
  } else if (term == '1') {
    // six month term yields 30% bonus
    return toBN(ethAmount).mul(toBN(130).mul(bonus)).div(toBN(10000));
  } else if (term == '2') {
    // twelve month term yields 120% bonus
    return toBN(ethAmount).mul(toBN(220).mul(bonus)).div(toBN(10000));
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
  console.log(`Lock events ${lockEvents.length}`);
  lockEvents.forEach((event) => {
    const data = event.returnValues;
    // allocate locks to first key if multiple submitted or malformed larger key submitted
    // NOTE: if key was less than length of a correct submission (66 chars), funds are considered lost
    let keys = [data.edgewareAddr];
    if (data.edgewareAddr.length >= 66) {
      keys = data.edgewareAddr.slice(2).match(/.{1,64}/g).map(key => `0x${key}`);
    }
    let value = getEffectiveValue(data.eth, data.term, data.time, lockdropStartTime, totalETHLocked);
    totalETHLocked = totalETHLocked.add(toBN(data.eth));
    totalEffectiveETHLocked = totalEffectiveETHLocked.add(value);

    // Add all validators to a separate collection to do validator election over later
    if (data.isValidator) {
      if (keys[0] in validatingLocks) {
        validatingLocks[keys[0]] = {
          lockAmt: toBN(data.eth).add(toBN(validatingLocks[keys[0]].lockAmt)).toString(),
          effectiveValue: toBN(validatingLocks[keys[0]].effectiveValue).add(value).toString(),
          lockAddrs: [data.lockAddr, ...validatingLocks[keys[0]].lockAddrs],
        };
      } else {
        validatingLocks[keys[0]] = {
          lockAmt: toBN(data.eth).toString(),
          effectiveValue: value.toString(),
          lockAddrs: [data.lockAddr],
        };
      }
    }


    // Add all locks to collection, calculating/updating effective value of lock
    if (keys[0] in locks) {
      locks[keys[0]] = {
        lockAmt: toBN(data.eth).add(toBN(locks[keys[0]].lockAmt)).toString(),
        effectiveValue: toBN(locks[keys[0]].effectiveValue).add(value).toString(),
        lockAddrs: [data.lockAddr, ...locks[keys[0]].lockAddrs],
      };
    } else {
      locks[keys[0]] = {
        lockAmt: toBN(data.eth).toString(),
        effectiveValue: value.toString(),
        lockAddrs: [data.lockAddr],
      };
    }
  });
  // Return validating locks, locks, and total ETH locked
  return { validatingLocks, locks, totalETHLocked, totalEffectiveETHLocked };
};

const calculateEffectiveSignals = async (web3, lockdropContracts, blockNumber=8461046) => {
  let totalETHSignaled = toBN(0);
  let totalEffectiveETHSignaled = toBN(0);
  let signals = {};
  let seenContracts = {};
  let signalEvents = [];
  for (index in lockdropContracts) {
    let events = await lockdropContracts[index].getPastEvents('Signaled', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    signalEvents = [ ...signalEvents, ...events ];
  }
  console.log(`Signal events ${signalEvents.length}`);
  const promises = signalEvents.map(async (event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance = -1;
    while (balance == -1) {
      try {
        if (blockNumber) {
          balance = await web3.eth.getBalance(data.contractAddr, blockNumber);
        } else {
          balance = await web3.eth.getBalance(data.contractAddr);
        }
      } catch(e) {
        console.log(`Couldn't find: ${JSON.stringify(data, null, 4)}`);
      }
    }

    return balance;
  });

  // Resolve promises to ensure all inner async functions have finished
  let balances = await Promise.all(promises);
  let gLocks = {};
  signalEvents.forEach((event, index) => {
    const data = event.returnValues;
    // if contract address has been seen (it is in a previously processed signal)
    // then we ignore it; this means that we only acknolwedge the first signal
    // for a given address.
    if (!(data.contractAddr in seenContracts)) {
      seenContracts[data.contractAddr] = true;
      // Get value for each signal event and add it to the collection
      let value;
      // allocate signals to first key if multiple submitted or malformed larger key submitted
      // NOTE: if key was less than length of a correct submission (66 chars), funds are considered lost
      let keys = [data.edgewareAddr];
      if (data.edgewareAddr.length >= 66) {
        keys = data.edgewareAddr.slice(2).match(/.{1,64}/g).map(key => `0x${key}`);
      }

      // Treat generalized locks as 3 month locks
      if (generalizedLocks.lockedContractAddresses.includes(data.contractAddr)) {
        console.log('Generalized lock:', balances[index], data.contractAddr);
        value = getEffectiveValue(balances[index], '0')
        if (keys[0] in gLocks) {
          gLocks[keys[0]] = toBN(gLocks[keys[0]]).add(value).toString();
        } else {
          gLocks[keys[0]] = value.toString();
        }
        totalETHSignaled = totalETHSignaled.add(toBN(balances[index]));
        totalEffectiveETHSignaled = totalEffectiveETHSignaled.add(value);
        // keep generalized locks collection separate from other signals
        return;
      } else {
        value = getEffectiveValue(balances[index], 'signaling');
      }
      // Add value to total signaled ETH
      totalETHSignaled = totalETHSignaled.add(toBN(balances[index]));
      totalEffectiveETHSignaled = totalEffectiveETHSignaled.add(value);
      // Iterate over signals, partition reward into delayed and immediate amounts
      if (keys[0] in signals) {
        signals[keys[0]] = {
          signalAmt: toBN(balances[index]).add(toBN(signals[keys[0]].signalAmt)).toString(),
          effectiveValue: toBN(signals[keys[0]]
                                  .effectiveValue)
                                  .add(value)
                                  .toString(),
        };
      } else {
        signals[keys[0]] = {
          signalAmt: toBN(balances[index]).toString(),
          effectiveValue: value.toString(),
        };
      }
    }
  });
  // Return signals and total ETH signaled
  return { signals, totalETHSignaled, totalEffectiveETHSignaled, genLocks: gLocks }
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

const selectEdgewareValidators = (validatingLocks, totalAllocation, totalEffectiveETH, numOfValidators, existentialBalance=100000000000000) => {
  const sortable = [];
  // Add the calculated edgeware balances with the respective key to a collection
  for (var key in validatingLocks) {
    const keys = key.slice(2).match(/.{1,64}/g).map(key => `0x${key}`);;
    if (keys.length === 3) {
      sortable.push([
        keys,
        toBN(validatingLocks[key].effectiveValue).sub(toBN(existentialBalance)).mul(toBN(totalAllocation)).div(totalEffectiveETH)
      ]);
    }
  }

  // Sort and take the top "numOfValidators" from the collection
  return sortable
    .sort((a,b) => (a[1].lt(b[1])) ? 1 : ((b[1].lt(a[1])) ? -1 : 0))
    .map(v => {
      return ([
        ...v[0].map(k => (k.slice(2))), // stash, controller, session
        v[1].toString(), // staked balance
      ]);
    });
};

const getEdgewareBalanceObjects = (locks, signals, genLocks, totalAllocation, totalEffectiveETH, existentialBalance=100000000000000) => {
  let balances = [];
  let vesting = [];
  // handle locks separately than signals at first, then we'll scan over all
  // entries and ensure that there are only unique entries in the collections.
  for (var key in locks) {
    try {
      const encoded = keyring.encodeAddress(key);
      balances.push([
        key.slice(2),
        mulByAllocationFraction(locks[key].effectiveValue, totalAllocation, totalEffectiveETH).toString(),
      ]);
      // add the vesting account to make their entire balance liquid at launch
      vesting.push([
        key.slice(2),
        5256000,
        1,
        mulByAllocationFraction(toBN(locks[key].effectiveValue), totalAllocation, totalEffectiveETH).toString(),
      ]);
    } catch(e) {
      console.log(e);
      console.log(`Error processing lock event: ${key} (${locks[key].effectiveValue})`);
    }
  }
  // handle signal entries
  for (var key in signals) {
    try {
      // the liquid amount of the vesting is 25% of signaled value
      const vestingValue = toBN(signals[key].effectiveValue).mul(toBN(25)).div(toBN(100));
      // create new balance record for the signaler
      balances.push([
        key.slice(2),
        mulByAllocationFraction(toBN(signals[key].effectiveValue), totalAllocation, totalEffectiveETH).toString(),
      ]);
      // create vesting record for 25% liquid signal amount at launch
      vesting.push([
        key.slice(2),
        5256000,
        1,
        mulByAllocationFraction(vestingValue, totalAllocation, totalEffectiveETH).toString(),
      ]);
    } catch(e) {
      console.log(e);
      console.log(`Error processing signal event: ${key} (${signals[key].effectiveValue})`);
    }
  }

  for (var key in genLocks) {
    try {
      const encoded = keyring.encodeAddress(key);
      balances.push([
        key.slice(2),
        mulByAllocationFraction(toBN(genLocks[key]), totalAllocation, totalEffectiveETH).toString(),
      ]);
      // add the vesting account to make their entire balance liquid at launch
      vesting.push([
        key.slice(2),
        5256000,
        1,
        mulByAllocationFraction(toBN(genLocks[key]), totalAllocation, totalEffectiveETH).toString(),
      ]);
    } catch(e) {
      console.log(e);
      console.log(`Error processing lock event: ${key} (${genLocks[key]})`);
    }
  }

  return { balances: balances, vesting: vesting };
};

const combineToUnique = (balances, vesting) => {
  let balancesMap = {};
  let vestingMap = {};
  balances.forEach(entry => {
    let account = entry[0];
    let amount = entry[1];

    if (account in balancesMap) {
      balancesMap[account] = toBN(balancesMap[account]).add(toBN(amount)).toString();
    } else {
      balancesMap[account] = amount
    }
  });

  vesting.forEach(entry => {
    let account = entry[0];
    let amount = entry[3];
    try {
      if (account in vestingMap) {
        vestingMap[account] = toBN(vestingMap[account]).add(toBN(amount)).toString();
      } else {
        vestingMap[account] = amount
      }
    } catch (e) {
      console.log(e);
      console.log(entry);
      console.log(vestingMap[account]);
    }
  });

  let newBalances = []
  let newVesting = [];
  let total = toBN(0);
  Object.keys(balancesMap).forEach(key => {
    total = total.add(toBN(balancesMap[key]));
    newBalances.push([
      key,
      balancesMap[key],
    ]);
  });

  Object.keys(vestingMap).forEach(key => {
    if (toBN(balancesMap[key]).eq(toBN(vestingMap[key]))) {
      // pass
    } else {
      newVesting.push([
        key,
        5256000,
        1,
        vestingMap[key],
      ]);
    }
  });
  console.log(`Balances: ${balances.length}`);
  console.log(`Balances with vesting: ${vesting.length}`);
  console.log(`EDG Total: ${total.toString()}`);
  return { balances: newBalances, vesting: newVesting, total: total };
}

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
  combineToUnique,
};

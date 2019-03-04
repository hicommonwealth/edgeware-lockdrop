const Promise = require('bluebird');
const { toBN } = require('web3').utils;

function getEffectiveValue(ethAmount, term) {
  if (term == '0') {
    // three month term yields no bonus
    return toBN(ethAmount);
  } else if (term == '1') {
    // six month term yields 5% bonus
    return toBN(ethAmount).mul(toBN(105)).div(toBN(100));
  } else if (term == '2') {
    // twelve month term yields 40% bonus
    return toBN(ethAmount).mul(toBN(140)).div(toBN(100));
  } else if (term == 'signaling') {
    // 60% deduction
    return toBN(ethAmount).mul(toBN(40)).div(toBN(100));
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
  const locks = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  let totalAmountInETH = toBN(0);
  locks.forEach((event) => {
    const data = event.returnValues;
    totalAmountInETH = totalAmountInETH.add(toBN(data.eth));
  });

  return web3.utils.fromWei(totalAmountInETH.toString(), 'ether');
};

const calculateEffectiveLocks = async (lockdropContract) => {
  let totalETHLocked = toBN(0);
  const locks = {};
  const validatingLocks = {};

  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(data.eth, data.term);
    totalETHLocked = totalETHLocked.add(value);

    // Add all validators to a separate collection to do validator election over later
    if (data.isValidator) {
      if (data.edgewareKey in validatingLocks) {
        validatingLocks[data.edgewareKey] = {
          lockAmt: toBN(data.eth).add(toBN(validatingLocks[data.edgewareKey].lockAmt)).toString(),
          effectiveValue: toBN(validatingLocks[data.edgewareKey].effectiveValue).add(value).toString(),
          lockAddrs: [ data.lockAddr, ...validatingLocks[data.edgewareKey].lockAddrs],
        };
      } else {
        validatingLocks[data.edgewareKey] = {
          lockAmt: toBN(data.eth).toString(),
          effectiveValue: value.toString(),
          lockAddrs: [data.lockAddr],
        };
      }
    }


    // Add all locks to collection, calculating/updating effective value of lock
    if (data.edgewareKey in locks) {
      locks[data.edgewareKey] = {
        lockAmt: toBN(data.eth).add(toBN(locks[data.edgewareKey].lockAmt)).toString(),
        effectiveValue: toBN(locks[data.edgewareKey].effectiveValue).add(value).toString(),
        lockAddrs: [ data.lockAddr, ...locks[data.edgewareKey].lockAddrs],
      };
    } else {
      locks[data.edgewareKey] = {
        lockAmt: toBN(data.eth).toString(), 
        effectiveValue: value.toString(),
        lockAddrs: [data.lockAddr],
      };
    }
  });

  return { validatingLocks, locks, totalETHLocked };
};

const getEffectiveSignals = async (lockdropContract, blockNumber=null) => {
  let totalETHSignaled = toBN(0);
  let signals = {};

  const signalEvents = await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  signalEvents.forEach(async (event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance;
    if (blockNumber) {
      balance = await web3.eth.getBalance(data.contractAddr, blockNumber);
    } else {
      balance = await web3.eth.getBalance(data.contractAddr);
    }
    
    // Get value for each signal event and add it to the collection
    let value = getEffectiveValue(balance, 'signaling');
    totalETHSignaled = totalETHSignaled.add(value);

    if (data.edgewareKey in signals) {
      signals[data.edgewareKey] = {
        signalAmt: toBN(data.eth).add(toBN(signals[data.edgewareKey].signalAmt)).toString(),
        signalEffectiveValue: toBN(signals[data.edgewareKey].signalEffectiveValue).add(value).toString(),
      };
    } else {
      signals[data.edgewareKey] = {
        signalAmt: toBN(data.eth).toString(),
        effectiveValue: value.toString(),
      };
    }
  });

  return {  signals: signals, totalETHSignaled: totalETHSignaled }
}

const getLockStorage = async (lockAddress) => {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: web3.utils.hexToNumber(vals[1]),
    };
  });
};

const selectEdgewareValidators = (validatingLocks, totalAllocation, totalETH, num_of_validators) => {
  const sortable = [];
  // Add the calculated edgeware balances with the respective key to a collection
  for (var key in validatingLocks) {
      sortable.push([
        key,
        toBN(validatingLocks[key].effectiveValue).mul(toBN(totalAllocation)).div(totalETH)
      ]);
  }

  // Sort and take the top "num_of_validators" from the collection
  return sortable
    .sort((a,b) => (a[1] > b[1]) ? 1 : ((b[1] > a[1]) ? -1 : 0))
    .slice(0, num_of_validators);
};

const getEdgewareBalanceObjects = (locks, signals, totalAllocation, totalETH) => {
  let balances = [];
  let vesting = [];
  for (var key in locks) {
    balances.push([
      key,
      toBN(locks[key].effectiveValue).mul(toBN(totalAllocation)).div(totalETH),
    ]);
  }

  for (var key in signals) {
    vesting.push([
      key,
      toBN(signals[key].effectiveValue).mul(toBN(totalAllocation)).div(totalETH),
      68400 * 365 // 1 year FIXME: see what vesting in substrate does
    ]);
  }

  return { balances: balances, vesting: vesting };
};


module.exports = {
  getLocks,
  getSignals,
  getTotalLockedBalance,
  calculateEffectiveLocks,
  getEffectiveSignals,
  getLockStorage,
  selectEdgewareValidators,
  getEdgewareBalanceObjects,
};

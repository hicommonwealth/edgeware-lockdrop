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
  } else {
    // invalid term
    return toBN(0);
  }
}

async const getLocks = (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });
};

async const getSignals = (lockdropContract, address) => {
  return await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      contractAddr: address,
    }
  });
};

async const getTotalLockedBalance = (lockdropContract) => {
  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  let totalAmountInETH = toBN(0);
  lockEvents.forEach((event) => {
    const data = event.returnValues;
    totalAmountInETH = totalAmountInETH.add(toBN(data.eth));
  });

  return web3.utils.fromWei(totalAmountInETH.toString(), 'ether');
};

async const calculateEffectiveLocks = (lockdropContract, totalAllocation, blockNumber = null) => {
  let totalAmountInETH = toBN(0);
  const allEvents = {};
  const validatingLocks = {};

  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    let value = getEffectiveValue(data.eth, data.term);
    totalAmountInETH = totalAmountInETH.add(value);

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

    if (data.edgewareKey in allEvents) {
      allEvents[data.edgewareKey] = {
        lockAmt: toBN(data.eth).add(toBN(allEvents[data.edgewareKey].lockAmt)).toString(),
        effectiveValue: toBN(allEvents[data.edgewareKey].effectiveValue).add(value).toString(),
        lockAddrs: [ data.lockAddr, ...allEvents[data.edgewareKey].lockAddrs],
      };
    } else {
      allEvents[data.edgewareKey] = {
        lockAmt: toBN(data.eth).toString(),
        effectiveValue: value.toString(),
        lockAddrs: [data.lockAddr],
      };
    }
  });

  const signalEvents = await lockdropContract.getPastEvents('Signaled', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  signalEvents.forEach((event) => {
    const data = event.returnValues;
    // Get balance at block that lockdrop ends
    let balance;
    if (blockNumber) {
      balance = await web3.eth.getBalance(data.contractAddr, blockNumber);
    } else {
      balance = await web3.eth.getBalance(data.contractAddr);
    }
    
    // Signalers have 0 term
    let value = getEffectiveValue(balance, '0');
    totalAmountInETH = totalAmountInETH.add(value);
    if (data.edgewareKey in allEvents && allEvents[data.edgewareKey].hasOwnProperty('signalAmt')) {
      allEvents[data.edgewareKey] = {
        signalAmt: toBN(data.eth).add(toBN(allEvents[data.edgewareKey].signalAmt)).toString(),
        signalEffectiveValue: toBN(allEvents[data.edgewareKey].signalEffectiveValue).add(value).toString(),
        ...allEvents[data.edgewareKey],
      };
    } else {
      allEvents[data.edgewareKey] = {
        signalAmt: toBN(data.eth).toString(),
        signalEffectiveValue: value.toString(),
        ...allEvents[data.edgewareKey],
      };
    }
  });

  let totalTokensIssued = toBN(0);
  for (key in allEvents) {
    let alloc = toBN(totalAllocation).mul(toBN(allEvents[key].effectiveValue)).div(totalAmountInETH).toString()
    totalTokensIssued = totalTokensIssued.add(toBN(alloc));
    allEvents[key] = {
      ...allEvents[key],
      edgewareBalance: alloc,
    }

    if (key in validatingLocks) {
      validatingLocks[key] = {
        ...validatingLocks[key],
        edgewareBalance: alloc,
      }        
    }
  }

  return { validatingLocks, allEvents, total: totalTokensIssued.toString() };
};

async const getLockStorage = (lockAddress) => {
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

const selectEdgewareValidators = (validatingLocks, num_of_validators) => {
  const sortable = [];
  for (var key in validatingLocks) {
      sortable.push([key, toBN(validatingLocks[key].edgewareBalance)]);
  }
  sortable.sort((a,b) => (a
    [1] > b[1]) ? 1 : ((b[1] > a[1]) ? -1 : 0)); 
  return sortable.slice(0, num_of_validators);
};

const getEdgewareGenesisObjects = (validators, allEvents) => {
  let balances = [];
  for (var key in allLocks) {
    balances.push([
      allLocks[key].edgewareKey,
      allLocks[key].edgewareBalance,
    ]);
  }

  return { balances: balances, validators: validators };
};


module.exports = {
  getLocks,
  getSignals,
  getTotalLockedBalance,
  calculateEffectiveLocks,
  getLockStorage,
  selectEdgewareValidators,
  getEdgewareGenesisObjects,
};

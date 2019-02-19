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

module.exports = {
  getLocksForAddress: async (lockdropContract, address) => {
    return await lockdropContract.getPastEvents('Locked', {
      fromBlock: 0,
      toBlock: 'latest',
      filter: {
        owner: address,
      }
    });
  },
  getSignals: async (lockdropContract, address) => {
    return await lockdropContract.getPastEvents('Signaled', {
      fromBlock: 0,
      toBlock: 'latest',
      filter: {
        contractAddr: address,
      }
    });
  },
  getTotalLockedBalance: async (lockdropContract) => {
    const lockEvents = await lockdropContract.getPastEvents('Locked', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    lockEvents.forEach((event) => {
      const data = event.returnValues;
      totalAmount = totalAmount.add(toBN(data.eth));
    });

    return web3.utils.fromWei(totalAmount.toString(), 'ether');
  },
  calculateEffectiveLocks: async (lockdropContract, totalAllocation) => {
    let totalAmount = toBN(0);
    const unvalidatingLocks = {};
    const validatingLocks = {};

    const lockEvents = await lockdropContract.getPastEvents('Locked', {
      fromBlock: 0,
      toBlock: 'latest',
    });

    lockEvents.forEach((event) => {
      const data = event.returnValues;
      let value = getEffectiveValue(data.eth, data.term);
      totalAmount = totalAmount.add(value);

      if (!data.isValidator) {
        if (data.edgewareKey in unvalidatingLocks) {
          unvalidatingLocks[data.edgewareKey] = {
            effectiveValue: unvalidatingLocks[data.edgewareKey].effectiveValue.add(value),
            lockAddrs: [ data.lockAddr, ...unvalidatingLocks[data.edgewareKey].lockAddrs],
            isValidator: data.isValidator,
          };
        } else {
          unvalidatingLocks[data.edgewareKey] = {
            effectiveValue: value,
            lockAddrs: [data.lockAddr],
            isValidator: data.isValidator,
          };
        }
      } else {
        if (data.edgewareKey in validatingLocks) {
          validatingLocks[data.edgewareKey] = {
            effectiveValue: validatingLocks[data.edgewareKey].effectiveValue.add(value),
            lockAddrs: [ data.lockAddr, ...validatingLocks[data.edgewareKey].lockAddrs],
            isValidator: data.isValidator,
          };
        } else {
          validatingLocks[data.edgewareKey] = {
            effectiveValue: value,
            lockAddrs: [data.lockAddr],
            isValidator: data.isValidator,
          };
        }
      }
    });

    for (key in unvalidatingLocks) {
      unvalidatingLocks[key] = {
        ...unvalidatingLocks[key],
        edgewareBalance: toBN(totalAllocation)
                           .div(totalAmount)
                           .mul(unvalidatingLocks[key].effectiveValue)
                           .toString(),
      }
    }

    for (key in validatingLocks) {
      validatingLocks[key] = {
        ...validatingLocks[key],
        edgewareBalance: toBN(totalAllocation)
                           .div(totalAmount)
                           .mul(validatingLocks[key].effectiveValue)
                           .toString(),
      }
    }

    return { validatingLocks, unvalidatingLocks };
  },
  getLockStorage: async (lockAddress) => {
    return Promise.all([0,1].map(v => {
      return web3.eth.getStorageAt(lockAddress, v);
    }))
    .then(vals => {
      return {
        owner: vals[0],
        unlockTime: web3.utils.hexToNumber(vals[1]),
      };
    });
  },
};

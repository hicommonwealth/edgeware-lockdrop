const Promise = require('bluebird');
const { toBN } = require('web3').utils;

function getEffectiveValue(ethAmount, term) {
  if (term == 0) {
    // three month term yields no bonus
    return toBn(ethAmount);
  } else if (term == 1) {
    // six month term yields 5% bonus
    return toBn(ethAmount).multiply(toBn(1.05));
  } else if (term == 2) {
    // twelve month term yields 40% bonus
    return toBn(ethAmount).multiply(toBn(1.4));
  } else {
    // invalid term
    return toBn(0);
  }
}

async function getLockStorage(lockAddress) {
  return Promise.all([0,1].map(v => {
    return web3.eth.getStorageAt(lockAddress, v);
  }))
  .then(vals => {
    return {
      owner: vals[0],
      unlockTime: web3.utils.hexToNumber(vals[1]),
    };
  });
}

async function getLocks(lockdropContract, address) {
  const locks = {};
  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
    filter: {
      owner: address,
    }
  });

  return lockEvents;
}

async function calculateEffectiveLocks(lockdropContract) {
  let totalAmount = toBn(0);
  const allocation = toBn(5e27);
  const locks = {};

  const lockEvents = await lockdropContract.getPastEvents('Locked', {
    fromBlock: 0,
    toBlock: 'latest',
  });

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    totalAmount = totalAmount.add(getEffectiveValue(data.eth, data.term));
    locks[data.lockAddr] = {
      effectiveAmount: getEffectiveValue(web3.fromWei(`${data.val}`, 'ether'), data.term),
      ...data,
    };
  });
}

module.exports = {
  getLocks,
  calculateEffectiveLocks,
  getLockStorage,
};

const { toBN } = require("web3").utils;

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

export async function getLocks(lockdropContract, address) {
  const locks = {};
  const lockEvents = await lockdropContract.getPastEvents("Lock", {
    fromBlock: 0,
    toBlock: "latest",
    filter: {
      owner: address,
    }
  });

  return lockEvents.map(e => e.returnValues.lockAddr);
}

export async function calculateEffectiveLocks(lockdropContract) {
  let totalAmount = toBn(0);
  const allocation = toBn(5e27);
  const locks = {};

  const lockEvents = await lockdropContract.getPastEvents("Locks", {
    fromBlock: 0,
    toBlock: "latest"
  });

  lockEvents.forEach((event) => {
    const data = event.returnValues;
    totalAmount = totalAmount.add(getEffectiveValue(data.eth, data.term));
    locks[data.lockAddr] = data;
  });


}

module.exports = getLockDroplocks;

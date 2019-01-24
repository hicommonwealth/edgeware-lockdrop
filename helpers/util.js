const Promise = require('bluebird');

const advanceTimeAndBlock = async (time) => {
    await advanceTime(time);
    await advanceBlock();

    return getCurrentBlock();
};

const advanceTime = (time) => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [time],
            id: new Date().getTime()
        }, (err, result) => {
            if (err) { return reject(err); }
            else {
              if (!err) {
                web3.currentProvider.send({
                  jsonrpc: '2.0', 
                  method: 'evm_mine', 
                  params: [], 
                  id: new Date().getSeconds()
                }, (e, res) => {
                  if (e) reject(e);
                  else resolve(res);
                });
              }
            }
        });
    });
};

const advanceBlock = () => {
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: new Date().getTime()
        }, (err, result) => {
            if (err) { return reject(err); }
            web3.eth.getBlock('latest', function (err, res) {
              if (err) reject(err);
              resolve(res.hash);
            });
        });
    });
};

function getCurrentBlock() {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock('latest', function (err, res) {
      if (err) return reject(err);
      resolve(res);
    });
  });
}

async function getCurrentTimestamp() {
  const block = await getCurrentBlock();
  return block.timestamp;
}


const getBalance = (account) => {
  return new Promise((resolve, reject) => {
    web3.eth.getBalance(account, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
};

const getTxReceipt = async (txHash) => {
  return await web3.eth.getTransactionReceipt(txHash);
}

async function assertRevert(promise, invariants = () => {}) {
  try {
    await promise;
    assert.fail('Expected revert not received');
  } catch (error) {
    const revertFound = error.message.search('revert') >= 0 || error.message.search('invalid opcode');
    assert(revertFound, `Expected 'revert', got ${error} instead`);
    invariants.call()
  }
}

module.exports = {
  advanceTimeAndBlock,
  advanceTime,
  advanceBlock,
  getCurrentBlock,
  getCurrentTimestamp,
  getBalance,
  assertRevert,
  getTxReceipt,
};

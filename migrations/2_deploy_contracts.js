const Lockdrop = artifacts.require("Lockdrop.sol");
const utility = require('../helpers/util');
const JUNE_1ST_UNIX_TIME = 1559347200;

module.exports = async function(deployer, network, accounts) {
  if (network === 'ropsten' || network === 'development') {
    let time = await utility.getCurrentTimestamp(web3);
    await deployer.deploy(Lockdrop, time);
  } else {
    await deployer.deploy(Lockdrop, JUNE_1ST_UNIX_TIME);
  }
};

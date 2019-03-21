const utility = require('../helpers/util');
const Lockdrop = artifacts.require("./Lockdrop.sol");
// const Web3 = require('web3');
// let web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

module.exports = async function(deployer, network, accounts) {
  let time = await utility.getCurrentTimestamp(web3);
  await deployer.deploy(Lockdrop, time);
};

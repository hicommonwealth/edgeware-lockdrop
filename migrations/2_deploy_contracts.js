const LockDrop = artifacts.require("./Lockdrop.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(LockDrop, 0);
};

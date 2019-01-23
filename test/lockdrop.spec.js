import { getCurrentTimestamp, advanceTimeAndBlock } from '../../helpers/evmTime.js';
import assertRevert from '../../helpers/assertRevert.js';
import getLockDropDeposits from "../../helpers/lockDropLogParser.js";
const { toWei, toBN, padRight } = web3.utils;

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

contract('Lockdrop', (accounts) => {
  const secondsInDay = 86400;
  let lockDrop;
  let tokenPrice;
  let tokenCapacity;

  before(async function() {
    lockdrop = new Lockdrop();
  });
});

const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;
const rlp = require('rlp');
const keccak = require('keccak');

const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");
const DOTMock = artifacts.require("./DOTMock.sol");

contract('DOTMock w/ Lockdrop', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time, {
      from: accounts[0],
    });
  });

  it('should mint 1000 tokens', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    assert.equal((await dots.balanceOf(accounts[0])), 1e18);
  });

  it('should lock up 1000 dots', async function () {
    let dotAddr = await lockdrop.DOTS_TEMP.call();
    let dots = await DOTMock.at(dotAddr);
    await dots.approve(lockdrop.address, 1000, { from: accounts[0] });
    let lockRes = await lockdrop.lockDOTs(THREE_MONTHS, accounts[0], false, 1000);
    console.log(lockRes);
    assert.equal((await dots.balanceOf(accounts[0])), 1e18 - 1000);
    assert.equal((await dots.balanceOf(accounts[0])), 1e18 - 1000);
    // assert.equal((await dots.balanceOf(accounts[0])), 0);
  });
});

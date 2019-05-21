const Promise = require('bluebird');
const utility = require('../helpers/util');
const ldHelpers = require('../helpers/lockdropHelper');
const { toWei, toBN, padRight } = web3.utils;
const rlp = require('rlp');
const keccak = require('keccak');
const bs58 = require('bs58');
const Lock = artifacts.require("./Lock.sol");
const Lockdrop = artifacts.require("./Lockdrop.sol");

const fixtures = [{
  phrase: "end sleep vote expire arctic magic crack wrap toddler lizard acoustic owner",
  seed: "0x209c205f333b5a65cc428589a51bd9f2621e2fc01de1b02dbf8c0f0b68e4974e",
  pubKey: "0xfa34ee0f034817963d83845920938c1d23bd7f7d146f588ff0e0f608fd3b6d4e",
  base58Address: "5HimYxXdszMgAbPQD49kLbgaBb274ubQpRNDJmZD4fA7KrJq",
}, {
  phrase: "trumpet urban range hurt donate village reward put tomorrow harvest advance vibrant",
  seed: "0x0edb559026c8f779be17b4c9d8e4dfc14bead6592241de4d6612f77769327f7f",
  pubKey: "0x3c547c5e55d74825c32b36b2126e98ab4863761781e60404f029bd3553b77218",
  base58Address: "5DRopxst3rkVSoD4kZ1ZCerh7dEweEpMaRNWPADNiwFLfQqQ",
}, {
  phrase: "copy aware resist thing business foil permit dismiss praise galaxy reason tube",
  seed: "0x070c8c3ecb57a1ddccc28c198f3297df1b9df9c4b354077148760e9ab33486ab",
  pubKey: "0xc46b25c3f5b4d49d894b8efa3f9dda4bdaba8105b550576b45b372abe9dfc42c",
  base58Address: "5GWF58YZLUB6fSinceKJxoPSypkL4nGayoscnXD5ZF4cSuPp",
}, {
  phrase: "sweet source girl moral join between inside ginger day eagle decide hope",
  seed: "0x41d2a9a2e4b080e20daf6e6107585a6341011fc94b15a50d0357c00e50e61045",
  pubKey: "0x74bb71a5e87530cf8c48def15455c2c0cfa31578ed25a678624ecc0656c0962d",
  base58Address: "5Ehm6RNBDzebVNjKbT7Py6i4ThtGQzChmCoAcZt6Y8ceeuV8",
}, {
  phrase: "mirror genuine sister dial glass mutual aspect motor elbow license stable useless",
  seed: "0x3ca48d8b8de1e5846b071fbf1e95271e8e3636fddd36313347a096cb3457daca",
  pubKey: "0x0297d687c3733bf0d3a3b0c2445d24d0094806291d78e0f4192ed93be19cf13b",
  base58Address: "5C874LAydNAn9CFMrcecHopRHf631tiGFahP3zskEYxYZjhJ",
}, {
  phrase: "during artist early wage boil bachelor extend horror around polar forget elevator",
  seed: "0x627e0b8d06e74cf01dcaaefdeecac22611c437287872d77d8f68498e1e7c1c38",
  pubKey: "0xd0a61e795670208eeda9077a6a20d463e8545adfaff71a4edc8bfcbcc7bbc118",
  base58Address: "5GnHAWn98b23v7zQwmG6bKmdKPo4ijJZDTZF1tP2huhkvsrd",
}, {
  phrase: "palm average satisfy goddess cake animal welcome symptom butter evidence crawl truth",
  seed: "0x0baead5a545869b440c13b027d1bb999c26c2958feafae29bb1d6a0ab091b122",
  pubKey: "0xa6adc9c7ade5c1454e3fb207eab20579ab7c52adfd001506bd70ef56d5583d4c",
  base58Address: "5FqFS1AkscbX1GrvvUGH2ehTxm7C5zBBbph4mgkSn4qP5NAZ",
}, {
  phrase: "exist joy venture deputy melody theme economy grant current quarter saddle garden",
  seed: "0x0a808eff0773fcbbb267d552060e2467dc80c11a02aa208ed121bae38ce70b9f",
  pubKey: "0xfa76688b34cd684823a12407bfebdf17c7c9e762edaaf080ab696570bd07832a",
  base58Address: "5Hj718FJaPeUiYegiHeY2USdDmhCPVuKZmkxySZtW8U7tGg7",
}, {
  phrase: "tail siren keen behind turkey violin enable outer wrestle oak weird master",
  seed: "0xb053d2b9b4ded602c91aef50b64f652903f96b8b5dd1ce72fdb64d6d59e2f69e",
  pubKey: "0x4e9ce6dda7f1da6033d884fbb33e367aa9212a6d9378c79c45228d0d064fed69",
  base58Address: "5DqnCevEWqWGJAmwEbMJVMXhF8htoL1PvUdALWZu7zNtGQSX",
}, {
  phrase: "candy sell vanish robot library early mass topic crime keen off knock",
  seed: "0x84d42471880ba749604ce74c4c4a8cbd958621b1b2606098bcd008f234787983",
  pubKey: "0x1602b62b1506c0e92c9856ea203ff48cc7234301b95067f4435d3dc637cf216f",
  base58Address: "5CZZiVLMCujNAmwkTJ4vWtijEQsqhusTAHQmZTbXzddtDsox",
}];

contract('Lockdrop-2', (accounts) => {
  const SECONDS_IN_DAY = 86400;
  const THREE_MONTHS = 0;
  const SIX_MONTHS = 1;
  const TWELVE_MONTHS = 2;

  let lockdrop;

  beforeEach(async function() {
    let time = await utility.getCurrentTimestamp(web3);
    lockdrop = await Lockdrop.new(time);
  });

  it('should ensure base58 encodings are valid to submit', async function () {
    await Promise.all(accounts.map(async (a, inx) => {
      return await lockdrop.lock(TWELVE_MONTHS, `0x${bs58.decode(fixtures[inx].base58Address).toString('hex')}`, (Math.random() > 0.5) ? true : false, {
        from: a,
        value: web3.utils.toWei(`${inx + 1}`, 'ether'),
      });
    }));

    await Promise.all(accounts.map(async (a, inx) => {
      return await lockdrop.lock(TWELVE_MONTHS, `0x${bs58.decode(fixtures[inx].base58Address).toString('hex')}`, (Math.random() > 0.5) ? true : false, {
        from: a,
        value: web3.utils.toWei(`${inx + 1}`, 'ether'),
      });
    }));

    const totalAllocation = '5000000000000000000000000';
    const allocation = await ldHelpers.calculateEffectiveLocks(lockdrop);
    let { validatingLocks, locks, totalETHLocked } = allocation;
    // console.log(validatingLocks, locks, web3.utils.fromWei(totalETHLocked.toString(), 'ether'));
    const signalAllocation = await ldHelpers.calculateEffectiveSignals(web3, lockdrop);
    let { signals, totalETHSignaled } = signalAllocation;
    // console.log(signals, web3.utils.fromWei(totalETHSignaled.toString(), 'ether'));
    const totalETH = totalETHLocked.add(totalETHSignaled);

    let totalETHLockedInETH = web3.utils.fromWei(totalETHLocked.toString(), 'ether');
    let totalETHSignaledInETH = web3.utils.fromWei(totalETHSignaled.toString(), 'ether');
    let json = await ldHelpers.getEdgewareBalanceObjects(locks, signals, totalAllocation, totalETH);
    let validators = ldHelpers.selectEdgewareValidators(validatingLocks, totalAllocation, totalETH, 4);
    
    let sum = toBN(0);
    json.balances.forEach((elt, inx) => {
      assert.equal(elt[0], fixtures[inx].base58Address);
      sum = sum.add(toBN(elt[1]));
    });

    assert.ok(sum < toBN(totalAllocation).add(toBN(10)) || sum > toBN(totalAllocation).sub(toBN(10)))
  });
});

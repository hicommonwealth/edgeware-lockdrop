# edge-lockdrop
This repo contains the smart contracts and scripts for the Edgeware lockdrop. The lockdrop contract enables users to _lock_ and _signal_ ether towards a given project. Users specify either 3, 6, or 12 month lockups and must submit an edgeware 32 byte hex public key and their interest in staking as a validator. The scripts aggregate transactions on behalf of a lockdrop contract and compile the JSON objects necessary for a substrate genesis specification.

## Usage
```
yarn global add truffle
yarn install
```
To test, use `ganache-cli` and `truffle`
```
truffle test
```
To use the script `/scripts/lockdrop.js`:
```
node ./scripts/lockdrop.js 
```
## API
```
Usage: lockdrop [options]

Options:
  -V, --version                     output the version number
  -b, --balance                     Get the total balance across all locks
  -l, --lock                        Lock ETH with the lockdrop
  -u, --unlock                      Unlock ETH from a specific lock contract
  --lockContractAddress <addr>      The Ethereum address for a lock contract
  --lockdropContractAddress <addr>  lockers
  --lockers                         Get the allocation for the current set of lockers
  --ending                          Get the remaining time of the lockdrop
  --lockLength <length>             The desired lock length - (3, 6, or 12)
  --lockValue <value>               The amount of Ether denominated in WEI
  --pubKey <key>                    Edgeware ED25519 pubKey in hex
  --isValidator                     A boolean flag indicating intent to be a validator
  -h, --help                        output usage information
```


## Edgeware blockchain
To align incentives, the Edgeware network will be launched with a lockdrop of EDG tokens to Ether holders. A lockdrop happens where token holders on one network timelock their tokens for a certain amount of time — all executed within a smart contract. Ether holders are able to lock their tokens for as short as 3 months or as long as one year. With longer timelocks corresponding to receiving proportionally more Edgeware tokens.

[Explainer on Medium](https://medium.com/commonwealth-labs/whats-in-a-lockdrop-194218a180ca)

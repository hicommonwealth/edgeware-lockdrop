# edgeware-lockdrop

This repo contains the smart contracts and scripts for the Edgeware lockdrop.

The lockdrop contract enables users to _lock_ ETH for 3, 6, or 12 months or _signal_ a balance. Users also specify a 32-byte Edgeware public key, and a boolean for whether they would like to be a validator upon network launch (in which case, they must submit 3 public keys).

## Usage
```
yarn global add truffle
yarn install
```
To test, use `ganache-cli` and `truffle`
```
truffle test
```
To deploy locally against `ganache-cli`:
```
truffle deploy
```
Create a file named `.env` with the following information
```
# ETH config
ETH_PRIVATE_KEY=<ETHEREUM_PRIVATE_KEY_HEX>

# Node/provider config
INFURA_PATH=https://ropsten.infura.io/v3/<INFURA_API_KEY>

# Lockdrop config
LOCKDROP_CONTRACT_ADDRESSES=<LOCKDROP_ADDRESS>

# Edgeware config
EDGEWARE_PUBLIC_KEY=0xa469e40f0a073be5b28e2df6e746ce6519260cdd764bc5f6b3fb3aac5cda3c35
```

To successfully run `/scripts/lockdrop.js`, ensure you've deployed to the correct network, and run:
```
truffle compile
node ./scripts/lockdrop.js --help
```

## Key generation

You must generate a keypair (public key and private key) to receive EDG. The easiest way to generate a keypair is using the subkey utility:

1. Install rust [here](https://doc.rust-lang.org/cargo/getting-started/installation.html)
2. Install subkey

```
cargo install --force --git https://github.com/paritytech/substrate subkey
```

3. Run `subkey` from your command line in order to generate a key. For example:

```
subkey generate
 Phrase `meadow clip planet heavy afford rifle viable bus fury satoshi blue impose` is account:
  Seed: 0x225967f0f82c4958179f9ba1c9b8823b0bc87fca650d7f3181bd2131f54276ec
  Public key (hex): 0xc2e973c4d848d25613141ef883bf97d35b513230427f52c56d2bf92bc4fa365c
  Address (SS58): 5GUGVkn5Zpfej7EC8WEsoJ38QFqu5cWvTx3WYFBKznLQkMAH
```

## Important notice for validators!

If you would like to run a validating node when the network launches, you will need to create three keypairs, two using SR25519 and one using ED25519 cryptography.

To create two SR25519 keys:

```
subkey generate
 Phrase `meadow clip planet heavy afford rifle viable bus fury satoshi blue impose` is account:
  Seed: 0x225967f0f82c4958179f9ba1c9b8823b0bc87fca650d7f3181bd2131f54276ec
  Public key (hex): 0xc2e973c4d848d25613141ef883bf97d35b513230427f52c56d2bf92bc4fa365c
  Address (SS58): 5GUGVkn5Zpfej7EC8WEsoJ38QFqu5cWvTx3WYFBKznLQkMAH
subkey generate
 Phrase `outer mixture phrase prepare beauty horse shift about story onion duty vacant` is account:
  Seed: 0x866c461e8a5b602c755f6babd442f36992238f8e1f604a022a7e753c8a8efdea
  Public key (hex): 0xfeba4989f1de5fe7aa911f9abed67742b93099701d4f9b0e07b8ac35e2f78131
  Address (SS58): 5HphMm6GrQzXw7ZP2UEXatKgusbhNLj7AhRdgmmCp4H9Hojz
```

To create one ED25519 key:

```
subkey -e generate
Phrase `vacant paddle daring vacant rude release dutch morning cushion pledge traffic armor` is account:
  Seed: 0x6c38500811b6ea3a46214531adac0fe67e18ba543fc2fc17ceeccc2b155568be
  Public key (hex): 0x16ca51710516a648e016b00b8872cb37946dc1aabd531021d593e1d76604cf40
  Address (SS58): 5Cab1dV9g8hb2MrBcVUjCyFEJBqBWZZ4djHRE4pBYHbk4kyB
```

Then, concatenate the public keys together, removing the `0x` in front of all intermediate elements. This string should be 194 characters.

```
let CONCATENATED_PUBLIC_KEYS = `${0xc2e973c4d848d25613141ef883bf97d35b513230427f52c56d2bf92bc4fa365c}
                                ${feba4989f1de5fe7aa911f9abed67742b93099701d4f9b0e07b8ac35e2f78131}
                                ${16ca51710516a648e016b00b8872cb37946dc1aabd531021d593e1d76604cf40}`
```

If you intend to be a validator, submit THIS concatenated string as your `--edgewarePublicKey`. You can add it to your `.env` or specify it as a CLI argument.

## Examples

#### Locking

1. Locking up 1 ETH for 3 months with no intent to validate
```
node scripts/lockdrop.js -l --lockValue 1 --lockLength 3 --edgewarePublicKey 0xa469e40f0a073be5b28e2df6e746ce6519260cdd764bc5f6b3fb3aac5cda3c35
```
2. Locking up 0.025 ETH for 6 months with no intent to validate and public key stored in `.env` file.
```
node scripts/lockdrop.js -l --lockValue 0.025 --lockLength 6
```
3. Locking up 50 ETH for 12 months with no intent to validate against a local node.
```
node scripts/lockdrop.js -r http://localhost:8545 -l --lockValue 50 --lockLength 12 --edgewarePublicKey 0xa469e40f0a073be5b28e2df6e746ce6519260cdd764bc5f6b3fb3aac5cda3c35
```
4. Locking up 1 ETH for 0.1 for 12 months with intent to validate and 3 Public keys conconatenated.
```
node scripts/lockdrop.js --lock --lockLength 12 --lockValue 0.1 --edgewarePublicKey $CONCATENATED_PUBLIC_KEYS --isValidator
```

#### Signaling

1. Signaling from an non-contract Ethereum user address
```
node scripts/lockdrop.js -s 0x2d65a140446894Ef1E71C333ecaA5BD8b5e6D568 -n 0 --edgewarePublicKey 0xa469e40f0a073be5b28e2df6e746ce6519260cdd764bc5f6b3fb3aac5cda3c35
```
2. Signaling from an Ethereum contract address created from nonce 101, using a local node
```
node scripts/lockdrop.js -r http://localhost:8545 --signal 0x2d65a140446894Ef1E71C333ecaA5BD8b5e6D568 -n 101 --edgewarePublicKey 0xa469e40f0a073be5b28e2df6e746ce6519260cdd764bc5f6b3fb3aac5cda3c35
```

#### Unlocking

1. Unlocking all Lock User Contracts (LUCs) for the address of the private key hex in `.env`
```
node scripts/lockdrop.js --unlockAll
```

2. Unlocking a specific Lock User Contract (LUC), from local node
```
node scripts/lockdrop.js -r http://localhost:8545 --unlock 0x0830135aabcebf1e9d08ea6ff50ffa7222e45a43
```

#### Utilities

1. Get the ending time of the Lockdrop contract stored in file `.env`
```
node scripts/lockdrop.js --ending
```

2. Get a list of all Lock User Contracts (LUCs) for a particular address
```
node scripts/lockdrop.js --locksForAddress 0x329dcd85e6eec8b25c310279b9c1518f86153eee
```

3. Get the balance of the Lockdrop Contract stored in the file `.env`
```
node scripts/lockdrop.js --balance
```

## API

```
Usage: lockdrop [options]

Options:
  -V, --version                     output the version number
  -b, --balance                     Get the total balance across all locks
  -l, --lock                        Lock ETH with the lockdrop
  -s, --signal <contractAddress>    Signal a contract balance in the lockdrop
  -n, --nonce <nonce>               Transaction nonce that created a specific contract address
  -u, --unlock <contractAddress>    Unlock ETH from a specific lock contract
  -r, --remoteUrl <url>             The remote URL of an Ethereum node (defaults to localhost:8545)
  --unlockAll                       Unlock all locks from the locally stored Ethereum address
  --lockdropContractAddress <addr>  The Ethereum address for the target Lockdrop (THIS IS A LOCKDROP CONTRACT)
  --allocation                      Get the allocation for the current set of lockers
  --ending                          Get the remaining time of the lockdrop
  --lockLength <length>             The desired lock length - (3, 6, or 12)
  --lockValue <value>               The amount of Ether to lock
  --edgewarePublicKey <publicKey>   Edgeware Public Key
  --isValidator                     A boolean flag indicating intent to be a validator
  --locksForAddress <userAddress>   Returns the history of lock contracts for a participant in the lockdrop
  -h, --help                        output usage information

```

## Edgeware blockchain

To align incentives, the Edgeware network will be launched with a lockdrop of EDG tokens to Ether holders. A lockdrop happens where token holders on one network timelock their tokens in a smart contract to receive balances on another. Ether holders are able to lock their tokens for as short as 3 months or as long as one year, with longer timelocks corresponding to receiving proportionally more Edgeware tokens.

[Explainer on Medium](https://medium.com/commonwealth-labs/whats-in-a-lockdrop-194218a180ca)

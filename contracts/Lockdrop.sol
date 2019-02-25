pragma solidity ^0.5.0;

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

contract Lock {
    // address owner; slot #0
    // address unlockTime; slot #1
    constructor (address owner, uint256 unlockTime) public payable {
        assembly {
            sstore(0x00, owner)
            sstore(0x01, unlockTime)
        }
    }
    
    function () external payable { // payable so solidity doesn't add unnecessary logic
        assembly {
            switch gt(timestamp, sload(0x01))
            case 0 { revert(0, 0) }
            case 1 {
                switch call(gas, sload(0x00), balance(address), 0, 0, 0, 0)
                case 0 { revert(0, 0) }
            }
        }
    }
}

contract DOTsLock {
    // address owner; slot #0
    // address unlockTime; slot #1
    address constant public DOTS = 0xb59f67A8BfF5d8Cd03f6AC17265c550Ed8F33907;
    constructor (address owner, uint256 unlockTime, uint256 amount) public payable {
        assembly {
            sstore(0x00, owner)
            sstore(0x01, unlockTime)
            sstore(0x02, amount)
        }
    }
    
    function () external payable { // payable so solidity doesn't add unnecessary logic
        address owner;
        uint256 unlockTime;
        uint256 amount;
    
        assembly {
            owner := sload(0x00)
            unlockTime := sload(0x01)
            amount := sload(0x02)
        }

        require(now > unlockTime, "Lock term has not ended");
        ERC20(DOTS).transfer(owner, amount);
    }
}



contract Lockdrop {
    enum Term {
        ThreeMo,
        SixMo,
        TwelveMo
    }
    
    address constant public DOTS = 0xb59f67A8BfF5d8Cd03f6AC17265c550Ed8F33907;

    uint256 constant public LOCK_DROP_PERIOD = 1 days * 14; // two weeks
    uint256 public LOCK_START_TIME;
    uint256 public LOCK_END_TIME;
    
    event Locked(address indexed owner, uint256 eth, Lock lockAddr, Term term, bytes edgewareKey, bool isValidator);
    event Signaled(address indexed contractAddr, bytes edgewareKey, bool isValidator);
    
    constructor(uint startTime) public {
        LOCK_START_TIME = startTime;
        LOCK_END_TIME = startTime + LOCK_DROP_PERIOD;
    }

    function lock(Term term, bytes calldata edgewareKey, bool isValidator)
        external
        payable
        didStart
        didNotEnd
    {
        uint256 eth = msg.value;
        address owner = msg.sender;
        uint256 unlockTime = unlockTimeForTerm(term);
        
        Lock lockAddr = (new Lock).value(eth)(owner, unlockTime);
        assert(address(lockAddr).balance == msg.value); // ensure lock contract has all ETH, or fail
        assert(address(this).balance == 0); // ensure contract has no ETH, or fail
        
        emit Locked(owner, eth, lockAddr, term, edgewareKey, isValidator);
    }

    function lockDOTs(Term term, bytes calldata edgewareKey, bool isValidator, uint tokenAmount)
        external
        didStart
        didNotEnd
    {
        address owner = msg.sender;
        uint256 unlockTime = unlockTimeForTerm(term);
        // Check balance of sender
        require(ERC20(DOTS).balanceOf(msg.sender) >= tokenAmount, "Sender has insufficient balance");
        // Create DOTs lock contract
        DOTsLock lockAddr = (new DOTsLock)(owner, unlockTime, tokenAmount);
        ERC20(DOTS).transfer(address(lockAddr), tokenAmount);
    }
    
    function unlockTimeForTerm(Term term) internal view returns (uint256) {
        if (term == Term.ThreeMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 92 days;
        if (term == Term.SixMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 183 days;
        if (term == Term.TwelveMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 365 days;
        
        revert();
    }

    function signal(address contractAddr, uint32 nonce, bytes memory edgewareKey, bool isValidator)
        public
        didStart
        didNotEnd
        didCreate(contractAddr, msg.sender, nonce)
    {
        emit Signaled(contractAddr, edgewareKey, isValidator);
    }

    modifier didStart() {
        require(now >= LOCK_START_TIME);
        _;
    }

    modifier didNotEnd() {
        require(now <= LOCK_END_TIME);
        _;
    }

    function addressFrom(address _origin, uint32 _nonce) public pure returns (address) {
        if(_nonce == 0x00)     return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xd6), byte(0x94), _origin, byte(0x80))))));
        if(_nonce <= 0x7f)     return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xd6), byte(0x94), _origin, uint8(_nonce))))));
        if(_nonce <= 0xff)     return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xd7), byte(0x94), _origin, byte(0x81), uint8(_nonce))))));
        if(_nonce <= 0xffff)   return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xd8), byte(0x94), _origin, byte(0x82), uint16(_nonce))))));
        if(_nonce <= 0xffffff) return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xd9), byte(0x94), _origin, byte(0x83), uint24(_nonce))))));
        return address(uint160(uint256(keccak256(abi.encodePacked(byte(0xda), byte(0x94), _origin, byte(0x84), uint32(_nonce)))))); // more than 2^32 nonces not realistic
    }

    modifier didCreate(address target, address parent, uint32 nonce) {
        require(target == addressFrom(parent, nonce));
        _;
    }
}
pragma solidity ^0.5.0;

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

contract Lockdrop {
    enum Term {
        ThreeMo,
        SixMo,
        TwelveMo
    }
    
    uint256 constant public LOCK_DROP_PERIOD = 1 days * 14; // two weeks
    uint256 public LOCK_START_TIME;
    
    event Locked(address indexed owner, uint256 eth, Lock lockAddr, Term term, bytes edgewareKey, bool isValidator);
    
    constructor(uint startTime) public {
        LOCK_START_TIME = startTime;
    }

    function lock(Term term, bytes calldata edgewareKey, bool isValidator) external payable {
        require(now >= LOCK_START_TIME);
        require(now <= LOCK_START_TIME + LOCK_DROP_PERIOD);

        uint256 eth = msg.value;
        address owner = msg.sender;
        uint256 unlockTime = unlockTimeForTerm(term);
        
        Lock lockAddr = (new Lock).value(eth)(owner, unlockTime);
        assert(address(lockAddr).balance == msg.value); // ensure lock contract has all ETH, or fail
        assert(address(this).balance == 0); // ensure contract has no ETH, or fail
        
        emit Locked(owner, eth, lockAddr, term, edgewareKey, isValidator);
    }
    
    function unlockTimeForTerm(Term term) internal view returns (uint256) {
        if (term == Term.ThreeMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 92 days;
        if (term == Term.SixMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 183 days;
        if (term == Term.TwelveMo) return LOCK_START_TIME + LOCK_DROP_PERIOD + 365 days;
        
        revert();
    }
}
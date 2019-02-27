pragma solidity ^0.5.0;

import 'openzeppelin-solidity/contracts/token/ERC20/ERC20.sol';

contract DOTMock is ERC20 {
    function mint(address to, uint256 value) public returns (bool) {
        _mint(to, value);
        return true;
    }
}
# dApp Support Agent

Paste a Pacific tx hash. The agent reads the transaction and receipt on Chain MCP, then says in plain language whether it failed and why: out of gas, the contract's revert (allowance, balance, deadline, slippage, panic), or that the reason could not be replayed. It also names common calls (transfer, approve, wrap) and shows who sent it.

```bash
npm run support -- 0xYourTx
```

Live: `/#support`

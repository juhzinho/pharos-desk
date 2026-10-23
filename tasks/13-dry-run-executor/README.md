# Dry-Run Executor

Simulates a Pacific transaction before anyone signs it. Read-only. Chain MCP. The server never calls `send_raw_transaction` and never holds a key.

| Requirement | How |
|---|---|
| Simulate without broadcasting | `eth_call` plus `estimate_gas` on the unsigned transaction, pinned to one block from `get_chain_info` |
| Success or revert, with the reason and the gas | A revert is decoded (balance, allowance, the contract's own text). A success reports gas units, gwei, and the PROS fee from `get_gas_price` |
| Before and after | Token balance of the sender and the recipient, or the allowance, plus the sender's PROS. Numbers move only when the call succeeded and the fee can be paid. Otherwise they stay unchanged |
| Block execution when the simulation fails | The unsigned transaction is dropped. A second request with `execute=1` or `--send` runs the same check and still does not broadcast |

Three samples, all live on Pacific:

| Sample | What it shows |
|---|---|
| `pass` | Transfer 1 USDC from a public wallet that holds USDC and PROS. Gate says clear to sign. Nothing is sent |
| `revert` | Same wallet, amount far above its USDC. The contract reverts. Execution is blocked |
| `gas` | Transfer 1 USDC from the WPROS/USDC pool. The call itself succeeds, but the pool has 0 PROS, so the fee cannot be paid and execution is blocked |

```bash
npm run dry-run -- --sample pass
npm run dry-run -- --sample revert
npm run dry-run -- --sample gas
npm run dry-run -- --sample pass --send
npm run dry-run -- --from 0x... --to 0x... --token USDC --amount 1
```

Live page: `/#dry-run`

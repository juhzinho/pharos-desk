# On-Chain Alert Bot

Watches one condition on Pharos Pacific and posts it to Discord or Telegram. Read-only. Chain MCP.

| Requirement | How |
|---|---|
| One configurable condition | `--mode transfer` with `--min`, or `--mode price` with `--price` and `--side`, or `--mode call` with `--contract` and an optional `--selector`. Price notifies when the rate crosses the line, not while it is already on that side |
| Real channel | `DISCORD_WEBHOOK_URL`, or `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, in `.env`. Nothing is marked sent until the post returns ok |
| What, value, link | Transfer: amount and the tx on pharosscan. Price: USDC per WPROS and the pool page. Call: native PROS value and the tx |
| No repeat | Sent ids stay in `data/alert-seen.json`. A price alert is one message for the crossing. The next sample is stored and does not notify again until the rate crosses back |

```bash
npm run alerts -- --mode transfer USDC --min 50 --lookback 200
npm run alerts -- --mode price --price 0.05 --side above
npm run alerts -- --mode call --contract 0xA5cA5Fbe34e444F366B373170541ec6902b0F75c --lookback 200
npm run alerts -- --mode transfer USDC --min 50 --watch

The same scans work in the Telegram chat. `/price` asks for the number, then above or below. `/transfer` asks for the token and the minimum. `/call` scans the FaroSwap router.
```

`--watch` keeps polling. Ctrl+C stops it.

Live page: `/#alerts`

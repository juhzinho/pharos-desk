# Pharos Desk

Two Easy Arena tasks on one read-only page: on-chain alerts and failed-tx support.

The alert task also runs as the Telegram bot Pharos Alerts (`pharosdesk_alert_bot`). On Start it introduces itself. It saves price lines for WPROS, lists them with edit and cancel, and can watch a large transfer or a FaroSwap call. `/pros` sends the CoinMarketCap card. The bot token stays in `.env`.

```bash
npm install
npm test
npm run alerts -- USDC --min 50
npm run support -- 0xYourTx
npm run web
```

# Running the keeper as an always-on service

The keeper must run 24/7 on a dedicated host (NOT a laptop) so on-chain prices stay fresh — if it
stops, prices go stale and trading auto-disables. A ~$5/mo Linux VPS (Hetzner / DigitalOcean / Fly)
is enough. Below is the systemd path; pm2 or Docker work too.

## 1. Provision + prepare the host
```bash
# On a fresh Ubuntu VPS as root:
adduser --system --group rwakeeper
apt-get update && apt-get install -y nodejs npm git
git clone <your-repo> /opt/rwa-perps && cd /opt/rwa-perps/keeper && npm ci
```

## 2. Put secrets in an env file (never in git or the unit file)
Create `/etc/rwa-keeper.env` (then `chmod 600 /etc/rwa-keeper.env`):
```ini
PRICE_SOURCE=tradingeconomics
TE_API_KEY=<your TE key>
CHAIN_ID=4663
RPC_URL=https://rpc.mainnet.chain.robinhood.com
ORACLE_ADDRESS=<mainnet oracle>
REGISTRY_ADDRESS=<mainnet registry>   # enables market auto-discovery
PRIVATE_KEY=<oracle signer key>       # replace with a KMS signer before mainnet — see GO-LIVE.md
POST_INTERVAL_MS=60000
DRY_RUN=false
```

## 3. Install + start the service
```bash
cp /opt/rwa-perps/keeper/deploy/rwa-keeper.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rwa-keeper
systemctl status rwa-keeper          # should be active (running)
journalctl -u rwa-keeper -f          # live logs: "posted N price(s): 0x..."
```
`Restart=always` brings it back automatically after a crash or reboot.

## 4. Liveness alerting
`src/healthcheck.ts` exits non-zero when the on-chain price is stale (keeper down). Run it on a timer
and alert on failure (uptime monitor, cron + curl to a webhook, etc.):
```bash
# reads the same /etc/rwa-keeper.env; HEALTHCHECK_ID picks the market to probe (default 0)
env $(cat /etc/rwa-keeper.env | xargs) HEALTHCHECK_ID=6 npx tsx src/healthcheck.ts
```

## Notes
- **One keeper per signer.** Two keepers sharing a signer key collide on the account nonce and one
  will crash — run exactly one.
- Prefer a **KMS/HSM signer** over the plaintext `PRIVATE_KEY` for mainnet (GO-LIVE.md, accepted risks).

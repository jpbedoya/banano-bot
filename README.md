# 🦍 Banano — MonkeDAO Discord AI Agent

Banano is MonkeDAO's resident degen ape bot. Responds to mentions, hypes the community, and protects the vibes.

## Setup

### 1. Create the Discord Bot
1. Go to https://discord.com/developers/applications
2. New Application → name it "Banano"
3. Bot tab → Add Bot → copy the token
4. Under "Privileged Gateway Intents" → enable **Message Content Intent**
5. OAuth2 → URL Generator → scopes: `bot` → permissions: `Send Messages`, `Read Message History`, `Moderate Members`
6. Use the generated URL to invite Banano to the MonkeDAO server

### 2. Configure
```bash
cp .env.example .env
# Fill in DISCORD_TOKEN and ANTHROPIC_API_KEY
# Optionally add channel IDs for vibe monitoring
```

### 3. Run
```bash
npm install
node index.js
```

### 4. Deploy (Railway)
```bash
# Push to GitHub, connect repo to Railway
# Add env vars in Railway dashboard
# Deploy — done
```

---

## How it works

### Mention mode
@Banano anything → Banano responds in character using Claude Haiku

### Vibe monitoring (optional)
Set `WATCHED_CHANNEL_IDS` to monitor channels. Messages are scored locally (free, instant). Only negative-scoring messages get sent to Haiku for review. If genuinely toxic, Banano chimes in. High-severity issues get flagged to the mod channel.

### Mod controls
- `!banano stop` — silence Banano in current channel (mods only)
- `!banano start` — bring Banano back (mods only)

---

## Cost estimate (Claude Haiku)
| Bot interactions/day | Monthly |
|---|---|
| 50 | ~$0.70 |
| 200 | ~$2.70 |
| 500 | ~$6.75 |
| 1,000 | ~$13.50 |

Set a $20/month hard cap in the Anthropic dashboard.

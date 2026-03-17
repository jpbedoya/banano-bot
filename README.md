# 🦍 Banano — MonkeDAO Discord AI Agent

Banano is MonkeDAO's resident degen ape bot. Responds to mentions, hypes the community, and protects the vibes.

## Setup

### Option A: OpenClaw (recommended)

If you already have Banano running inside OpenClaw with Discord connected, you don't need `index.js` at all. OpenClaw handles the Discord connection.

Just pull in `vibe.js` + `persona.js` and wire them into your OpenClaw config:

1. Clone this repo into your OpenClaw workspace
2. In your OpenClaw config, set Banano's system prompt to the contents of `persona.js`
3. Add a Discord plugin entry with your bot token + channel IDs
4. Set env vars (see `.env.example`) — no `DISCORD_TOKEN` needed if OpenClaw owns the connection
5. Restart OpenClaw — Banano comes online

**What OpenClaw provides:**
- Discord connection + message routing
- Session/conversation history
- Tool access (reactions, file uploads, etc.)

**What this repo provides:**
- `vibe.js` — sentiment filter + Haiku vibe detection logic
- `persona.js` — Banano's system prompt
- `state.json` — persisted silence state across restarts

---

### Option B: Standalone bot

Run `index.js` directly on any server.

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN and ANTHROPIC_API_KEY
# Add channel IDs for vibe monitoring

npm install
node index.js
```

**Deploy on Railway:**
Push to GitHub → connect repo → add env vars in Railway dashboard → deploy.

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

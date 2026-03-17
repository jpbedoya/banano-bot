# 🦍 Banano — MonkeDAO Discord AI Agent

Banano is MonkeDAO's resident degen ape bot. Responds to mentions, hypes the community, and protects the vibes.

## Setup

### Option A: OpenClaw (recommended)

If you already have Banano running inside OpenClaw with Discord connected:

**No API keys needed.** OpenClaw handles the model, routing, and API billing.

1. Copy the contents of `persona.js` → paste as Banano's system prompt in your OpenClaw config
2. Add watched channel IDs + mod channel ID to your OpenClaw Discord plugin config
3. Restart OpenClaw — Banano comes online

That's it. `vibe.js` and `index.js` are **not needed** for Option A.

**What OpenClaw handles:**
- Discord connection + message routing
- The AI model (GPT-4o, Claude, whatever you've configured)
- API keys and billing
- Session/conversation history

**What `persona.js` provides:**
- Banano's full personality, hard rules, and vibe detection instructions baked into the system prompt
- The model follows those instructions natively — no separate sentiment library needed

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

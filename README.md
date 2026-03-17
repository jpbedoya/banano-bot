# 🦍 Banano — MonkeDAO Discord AI Agent

Banano is MonkeDAO's resident degen ape. Responds to mentions, hypes the community, and runs two-layer vibe moderation to keep the energy right.

---

## How it works

### Two-layer moderation

```
All messages in watched channels
  │
  ▼
Layer 1: Sentiment score (free, local, instant)
  │
  ├── score > threshold → ignore (90%+ of messages)
  │
  └── score <= threshold → Layer 2: AI vibe review
                              │
                              ├── false alarm / banter → ignore
                              ├── mild issue → Banano redirects in-channel
                              └── high severity → quiet escalation to mod channel
```

### Sentiment threshold

`SENTIMENT_THRESHOLD=-2` (recommended starting point)

| Value | Behavior |
|---|---|
| -2 | Conservative — only clearly negative messages |
| -1 | More sensitive |
| 0 | Noisy — flags too much |

### @Banano mentions

Direct mentions always get a reply, bypassing the sentiment filter.

---

## Setup

### Option A: OpenClaw (recommended)

If Banano already runs inside OpenClaw with Discord connected:

**No provider API keys needed.** OpenClaw handles the model, auth, and routing.

**What this repo provides:**
- `persona.js` — Banano's personality, hard rules, and vibe instructions (load as system prompt)
- `vibe.js` — two-layer moderation logic; pass your OpenClaw `complete` function via `createVibeEngine({ complete })`

**Steps:**
1. Clone this repo into Banano's OpenClaw workspace
2. Set `persona.js` content as Banano's system prompt in OpenClaw config
3. In your OpenClaw message handler, wire `vibe.js` into the Discord flow:

```js
const { createVibeEngine } = require('./vibe');

// Pass OpenClaw's model function — no API keys needed
const { shouldEscalate, checkVibes, generateReply } = createVibeEngine({
  complete: async (messages, maxTokens) => {
    // call your OpenClaw model runtime here
  }
});
```

4. Set env vars (watched channels, mod channel, threshold — no `DISCORD_TOKEN` or API keys needed)
5. Restart OpenClaw — Banano is live

**Message flow to implement in OpenClaw:**
```
if message mentions Banano → generateReply(...)
else if channel in WATCHED_CHANNEL_IDS:
  if shouldEscalate(content):
    result = await checkVibes(content, author, recentMessages)
    if result.isToxic and result.suggestedResponse → send in channel
    if result.severity == 'high' → post to MOD_CHANNEL_ID
```

---

### Option B: Standalone bot

Run `index.js` directly. Requires a Discord bot token + AI provider key.

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN, AI provider key, channel IDs

npm install
node index.js
```

**Deploy on Railway:**
Push to GitHub → connect repo → add env vars → deploy.

---

## Config

```env
# Vibe monitoring
WATCHED_CHANNEL_IDS=1483389953089077359   # comma-separated
MOD_CHANNEL_ID=1483389841835167866
SENTIMENT_THRESHOLD=-2

# Option B only
DISCORD_TOKEN=...
AI_PROVIDER=openai         # or anthropic
AI_MODEL=gpt-4o-mini       # optional override
OPENAI_API_KEY=...         # or ANTHROPIC_API_KEY
```

---

## Mod controls

- `!banano stop` — silence Banano in current channel (mods/admins only)
- `!banano start` — re-enable Banano in current channel (mods/admins only)

State persists across restarts via `state.json`.

---

## Test checklist

- [ ] `@Banano gm` → normal reply in character
- [ ] Positive message in watched channel → ignored
- [ ] Clearly negative message → sentiment gate trips → AI review
- [ ] Mild issue → gentle in-channel redirect from Banano
- [ ] Serious issue → quiet escalation to mod channel
- [ ] `!banano stop` → Banano goes quiet in that channel only
- [ ] `!banano start` → Banano resumes

---

## Files

| File | Purpose |
|---|---|
| `persona.js` | Banano's system prompt — personality, hard rules, vibe instructions |
| `vibe.js` | Two-layer moderation engine — works with any AI runtime |
| `index.js` | Option B standalone bot (discord.js) |
| `state.json` | Persisted silence state (gitignored) |

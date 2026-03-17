# Banano Vibe Monitor — OpenClaw Plugin

Two-layer vibe moderation for Discord channels, running natively inside OpenClaw.

## Install

```bash
cd banano-bot/plugin
npm install && npm run build
openclaw plugins install -l .
```

## Configure

Add to your OpenClaw `config.yml`:

```yaml
plugins:
  entries:
    banano-vibe:
      enabled: true
      config:
        watchedChannelIds:
          - "1483389953089077359"
        modChannelId: "1483389841835167866"
        sentimentThreshold: -2
```

Also set `requireMention: false` on watched channels so OpenClaw sees all messages:

```yaml
channels:
  discord:
    guilds:
      YOUR_GUILD_ID:
        channels:
          "1483389953089077359":
            requireMention: false
```

Then restart OpenClaw.

## How it works

```
All messages in watched channels
  │
  ▼
Layer 1: Sentiment score (free, local)
  │
  ├── score > threshold → ignore (90%+ of messages)
  │
  └── score <= threshold → Layer 2: AI vibe review
                              │
                              ├── false alarm → ignore
                              ├── mild → Banano redirects in-channel
                              └── high severity → mod channel escalation
```

### What the plugin does:
1. Hooks into `message_received` — runs on every Discord message
2. Checks if the channel is in the watched list
3. Runs local sentiment scoring (Layer 1)
4. If flagged, injects a vibe check prompt as a system event (Layer 2)
5. Intercepts the agent's JSON response via `message_sending` hook
6. Routes: in-channel response for mild issues, mod escalation for high severity
7. Blocks the raw JSON from reaching the chat

### Mod controls
- `!banano stop` — silence in current channel (persists across restarts)
- `!banano start` — resume in current channel

### Commands
- `/vibe_status` — show current plugin config

## Test checklist

- [ ] `@Banano gm` → normal reply (bypasses plugin)
- [ ] Positive message in watched channel → ignored
- [ ] Negative message → sentiment gate trips → AI review
- [ ] Mild issue → gentle in-channel redirect
- [ ] Serious issue → mod channel escalation
- [ ] `!banano stop/start` → per-channel behavior

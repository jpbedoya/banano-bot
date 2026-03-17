/**
 * index.js — Banano standalone bot (Option B)
 *
 * Use this if you're NOT running inside OpenClaw.
 * Requires DISCORD_TOKEN + AI provider key in .env
 *
 * For Option A (OpenClaw): see README.md → Option A
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { createVibeEngine } = require('./vibe');

// ── Config ───────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID;
const WATCHED_CHANNEL_IDS = (process.env.WATCHED_CHANNEL_IDS || '').split(',').filter(Boolean);

if (!DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// ── Vibe engine (standalone — uses provider API keys from env) ────────────────

const { shouldEscalate, checkVibes, generateReply } = createVibeEngine();

// ── Persistent silence state ──────────────────────────────────────────────────

const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return new Set(data.silencedChannels || []);
    }
  } catch (e) { console.error('Failed to load state:', e); }
  return new Set();
}

function saveState(silenced) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ silencedChannels: [...silenced] }, null, 2));
  } catch (e) { console.error('Failed to save state:', e); }
}

const silencedChannels = loadState();

// ── Conversation history (in-memory, last 20 per channel) ────────────────────

const channelHistory = new Map();

function getHistory(channelId) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  return channelHistory.get(channelId);
}

function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, history.length - 20);
}

// ── Discord client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.on('ready', () => {
  console.log(`🦍 Banano online as ${client.user.tag}`);
  console.log(`Watching: ${WATCHED_CHANNEL_IDS.length ? WATCHED_CHANNEL_IDS.join(', ') : 'none (mention-only)'}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const content = message.content.trim();
  const isMentioned = message.mentions.has(client.user);
  const isWatched = WATCHED_CHANNEL_IDS.includes(channelId);
  const isMod = message.member?.permissions.has('ModerateMembers');

  // ── Mod controls ────────────────────────────────────────────────────────────
  if (content === '!banano stop') {
    if (isMod) {
      silencedChannels.add(channelId);
      saveState(silencedChannels);
      await message.reply('aight aight, going quiet 🤫');
    }
    return;
  }
  if (content === '!banano start') {
    if (isMod) {
      silencedChannels.delete(channelId);
      saveState(silencedChannels);
      await message.reply('ape is back 🦍');
    }
    return;
  }

  if (silencedChannels.has(channelId)) return;

  // ── Mention → normal reply ──────────────────────────────────────────────────
  if (isMentioned) {
    const userText = content.replace(/<@!?\d+>/g, '').trim() || 'gm';
    try {
      await message.channel.sendTyping();
      const history = getHistory(channelId);
      const reply = await generateReply(userText, message.author.username, history);
      addToHistory(channelId, 'user', `${message.author.username}: ${userText}`);
      addToHistory(channelId, 'assistant', reply);
      await message.reply(reply);
    } catch (err) {
      console.error('[banano] mention reply error:', err);
    }
    return;
  }

  // ── Watched channel → two-layer vibe filter ─────────────────────────────────
  if (isWatched && shouldEscalate(content)) {
    console.log(`[banano/vibe] Escalating: "${content}"`);
    try {
      const recent = await message.channel.messages.fetch({ limit: 10, before: message.id });
      const recentArr = [...recent.values()].reverse().map(m => ({
        author: m.author.username,
        content: m.content,
      }));

      const result = await checkVibes(content, message.author.username, recentArr);
      if (!result || !result.isToxic) return;

      console.log(`[banano/vibe] ${result.severity}: ${result.reason}`);

      // Mild → in-channel redirect
      if (result.suggestedResponse) {
        await message.channel.send(result.suggestedResponse);
      }

      // High severity → escalate to mod channel
      if (result.severity === 'high' && MOD_CHANNEL_ID) {
        const modChannel = await client.channels.fetch(MOD_CHANNEL_ID).catch(() => null);
        if (modChannel) {
          await modChannel.send(
            `🚨 **Vibe alert** in <#${channelId}>\n` +
            `User: ${message.author.tag}\n` +
            `Message: "${content}"\n` +
            `Reason: ${result.reason}\n` +
            `[Jump](${message.url})`
          );
        }
      }
    } catch (err) {
      console.error('[banano] vibe check error:', err);
    }
  }
});

client.login(DISCORD_TOKEN);

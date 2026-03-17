/**
 * Banano Discord Bot — index.js
 *
 * OPTION A (recommended): Banano runs inside OpenClaw.
 *   OpenClaw handles the Discord connection + message routing.
 *   This file is not needed — OpenClaw calls vibe.js directly.
 *   See: README.md → Option A setup
 *
 * OPTION B (standalone): Run this file directly.
 *   Requires DISCORD_TOKEN + ANTHROPIC_API_KEY in .env
 *   node index.js
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { shouldEscalate, checkVibes, generateReply } = require('./vibe');

// ── Config ──────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MOD_CHANNEL_ID = process.env.MOD_CHANNEL_ID;
const WATCHED_CHANNEL_IDS = (process.env.WATCHED_CHANNEL_IDS || '').split(',').filter(Boolean);

// ── Persistent silence state ─────────────────────────────────────────────────

const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return new Set(data.silencedChannels || []);
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return new Set();
}

function saveState(silencedChannels) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ silencedChannels: [...silencedChannels] }, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
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

// ── Discord client ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.on('ready', () => {
  console.log(`🦍 Banano is online as ${client.user.tag}`);
  console.log(`Watching channels: ${WATCHED_CHANNEL_IDS.length ? WATCHED_CHANNEL_IDS.join(', ') : 'none (mention-only mode)'}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const content = message.content.trim();
  const isMentioned = message.mentions.has(client.user);
  const isWatchedChannel = WATCHED_CHANNEL_IDS.includes(channelId);

  // Mod commands
  if (content === '!banano stop') {
    if (message.member?.permissions.has('ModerateMembers')) {
      silencedChannels.add(channelId);
      saveState(silencedChannels);
      await message.reply('aight aight, going quiet 🤫');
    }
    return;
  }
  if (content === '!banano start') {
    if (message.member?.permissions.has('ModerateMembers')) {
      silencedChannels.delete(channelId);
      saveState(silencedChannels);
      await message.reply('ape is back 🦍');
    }
    return;
  }

  if (silencedChannels.has(channelId)) return;

  // ── Mention handler ──────────────────────────────────────────────────────
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
      console.error('Error responding to mention:', err);
    }
    return;
  }

  // ── Vibe monitoring ──────────────────────────────────────────────────────
  if (isWatchedChannel && shouldEscalate(content)) {
    console.log(`[vibe-check] Flagged: "${content}"`);
    try {
      const recent = await message.channel.messages.fetch({ limit: 10, before: message.id });
      const recentArr = [...recent.values()].reverse().map(m => ({
        author: m.author.username,
        content: m.content,
      }));

      const result = await checkVibes(content, message.author.username, recentArr);
      if (!result) return;

      console.log('[vibe-check] Result:', result);

      if (result.isToxic && result.suggestedResponse) {
        await message.channel.send(result.suggestedResponse);
      }

      if (result.isToxic && result.severity === 'high' && MOD_CHANNEL_ID) {
        const modChannel = await client.channels.fetch(MOD_CHANNEL_ID).catch(() => null);
        if (modChannel) {
          await modChannel.send(
            `🚨 **Vibe alert** in <#${channelId}>\n` +
            `User: ${message.author.tag}\n` +
            `Message: "${content}"\n` +
            `Reason: ${result.reason}\n` +
            `[Jump to message](${message.url})`
          );
        }
      }
    } catch (err) {
      console.error('Error during vibe check:', err);
    }
  }
});

// ── Launch ───────────────────────────────────────────────────────────────────

if (!DISCORD_TOKEN || !ANTHROPIC_API_KEY) {
  console.error('❌ Missing DISCORD_TOKEN or ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

client.login(DISCORD_TOKEN);

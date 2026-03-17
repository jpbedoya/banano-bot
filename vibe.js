/**
 * vibe.js — Banano's vibe detection engine
 *
 * Used by both Option A (OpenClaw plugin) and Option B (standalone bot).
 * No Discord dependency here — pure logic.
 *
 * Supports Anthropic (Claude) and OpenAI (GPT) via AI_PROVIDER env var.
 */

const Sentiment = require('sentiment');
const { SYSTEM_PROMPT } = require('./persona');

const sentiment = new Sentiment();

const DEFAULT_THRESHOLD = parseInt(process.env.SENTIMENT_THRESHOLD || '-2');

// ── Provider config ──────────────────────────────────────────────────────────
// AI_PROVIDER: "anthropic" (default) or "openai"
// AI_MODEL: override the default model for your provider
//
// Defaults:
//   anthropic → claude-haiku-4-5
//   openai    → gpt-4o-mini

const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const MODEL = process.env.AI_MODEL || (PROVIDER === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5');

let _client;
function getClient() {
  if (_client) return _client;
  if (PROVIDER === 'openai') {
    const OpenAI = require('openai');
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Unified completion — abstracts Anthropic vs OpenAI differences.
 */
async function complete(messages, maxTokens = 300) {
  const client = getClient();

  if (PROVIDER === 'openai') {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    });
    return response.choices[0].message.content;
  } else {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
    });
    return response.content[0].text;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Quick local sentiment check — free, instant.
 * Returns true if the message should be escalated to the AI.
 */
function shouldEscalate(text, threshold = DEFAULT_THRESHOLD) {
  return sentiment.analyze(text).score <= threshold;
}

/**
 * Full vibe check via AI model.
 * @param {string} flaggedText
 * @param {string} authorName
 * @param {Array<{author: string, content: string}>} recentMessages
 * @returns {Promise<{isToxic: boolean, severity: 'low'|'medium'|'high', reason: string, suggestedResponse: string|null}>}
 */
async function checkVibes(flaggedText, authorName, recentMessages = []) {
  const context = recentMessages.map(m => `${m.author}: ${m.content}`).join('\n');

  const prompt = `[VIBE CHECK - do not respond as if chatting normally]
Recent conversation in the channel:
${context || '(no prior context)'}

Flagged message from ${authorName}: "${flaggedText}"

Is this genuinely toxic, negative, or harmful to community vibes? Answer in JSON:
{
  "isToxic": boolean,
  "severity": "low" | "medium" | "high",
  "reason": "brief reason",
  "suggestedResponse": "what Banano should say in the channel (null if no response needed)"
}
Only flag real issues. Jokes, sarcasm, and light trash talk are fine.`;

  const text = await complete([{ role: 'user', content: prompt }], 200);

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[banano/vibe] Failed to parse vibe check response:', e);
  }
  return null;
}

/**
 * Generate a reply as Banano.
 * @param {string} userText
 * @param {string} authorName
 * @param {Array<{role: 'user'|'assistant', content: string}>} history
 * @returns {Promise<string>}
 */
async function generateReply(userText, authorName, history = []) {
  const messages = [
    ...history,
    { role: 'user', content: `${authorName}: ${userText}` },
  ];
  return complete(messages, 300);
}

module.exports = { shouldEscalate, checkVibes, generateReply };

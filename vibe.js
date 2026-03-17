/**
 * vibe.js — Banano's vibe detection engine
 *
 * Used by both Option A (OpenClaw plugin) and Option B (standalone bot).
 * No Discord dependency here — pure logic.
 */

const Anthropic = require('@anthropic-ai/sdk');
const Sentiment = require('sentiment');
const { SYSTEM_PROMPT } = require('./persona');

const sentiment = new Sentiment();

const DEFAULT_THRESHOLD = parseInt(process.env.SENTIMENT_THRESHOLD || '-2');

let anthropic;
function getClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

/**
 * Quick local sentiment check — free, instant.
 * Returns true if the message should be escalated to Haiku.
 */
function shouldEscalate(text, threshold = DEFAULT_THRESHOLD) {
  return sentiment.analyze(text).score <= threshold;
}

/**
 * Full vibe check via Claude Haiku.
 * @param {string} flaggedText - The message that triggered the flag
 * @param {string} authorName - Discord username of the author
 * @param {Array<{author: string, content: string}>} recentMessages - Last ~10 messages for context
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

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[banano/vibe] Failed to parse vibe check response:', e);
  }
  return null;
}

/**
 * Generate a reply as Banano given a message and channel history.
 * @param {string} userText - What the user said
 * @param {string} authorName - Their username
 * @param {Array<{role: 'user'|'assistant', content: string}>} history - Conversation history
 * @returns {Promise<string>}
 */
async function generateReply(userText, authorName, history = []) {
  const messages = [
    ...history,
    { role: 'user', content: `${authorName}: ${userText}` },
  ];

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages,
  });

  return response.content[0].text;
}

module.exports = { shouldEscalate, checkVibes, generateReply };

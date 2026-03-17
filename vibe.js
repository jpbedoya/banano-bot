/**
 * vibe.js — Banano's two-layer moderation engine
 *
 * Layer 1: Local sentiment scoring (free, instant, no API call)
 * Layer 2: AI vibe review (only for flagged messages)
 *
 * OPTION A (OpenClaw): Pass a `complete` function from your OpenClaw runtime.
 *   No API keys needed — OpenClaw handles the model.
 *   See: createVibeEngine({ complete })
 *
 * OPTION B (standalone): Uses built-in provider clients (Anthropic or OpenAI).
 *   Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in env.
 *   See: createVibeEngine() with no args — auto-detects from env.
 */

const Sentiment = require('sentiment');
const { SYSTEM_PROMPT } = require('./persona');

const sentiment = new Sentiment();

const DEFAULT_THRESHOLD = parseInt(process.env.SENTIMENT_THRESHOLD || '-2');

// ── Built-in provider (Option B only) ────────────────────────────────────────

function buildStandaloneComplete() {
  const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const MODEL = process.env.AI_MODEL || (PROVIDER === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5');

  let client;
  if (PROVIDER === 'openai') {
    const OpenAI = require('openai');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return async (messages, maxTokens = 300) => {
      const res = await client.chat.completions.create({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      });
      return res.choices[0].message.content;
    };
  } else {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return async (messages, maxTokens = 300) => {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages,
      });
      return res.content[0].text;
    };
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a vibe engine.
 *
 * @param {object} opts
 * @param {function} [opts.complete] - Optional: async (messages, maxTokens) => string
 *   Pass your OpenClaw model function here for Option A.
 *   Omit to use standalone provider clients (Option B).
 * @param {number} [opts.threshold] - Sentiment threshold (default: SENTIMENT_THRESHOLD env or -2)
 */
function createVibeEngine({ complete, threshold } = {}) {
  const _complete = complete || buildStandaloneComplete();
  const _threshold = threshold ?? DEFAULT_THRESHOLD;

  /**
   * Layer 1: Quick local sentiment check — free, instant.
   * Returns true if the message should be escalated to AI.
   */
  function shouldEscalate(text) {
    return sentiment.analyze(text).score <= _threshold;
  }

  /**
   * Layer 2: AI vibe review with recent context.
   *
   * @param {string} flaggedText
   * @param {string} authorName
   * @param {Array<{author: string, content: string}>} recentMessages - last ~10 msgs
   * @returns {Promise<{isToxic: boolean, severity: 'low'|'medium'|'high', reason: string, suggestedResponse: string|null}|null>}
   */
  async function checkVibes(flaggedText, authorName, recentMessages = []) {
    const context = recentMessages.map(m => `${m.author}: ${m.content}`).join('\n');

    const prompt = `[VIBE CHECK — do not respond as if chatting normally]
Recent conversation:
${context || '(no prior context)'}

Flagged message from ${authorName}: "${flaggedText}"

Is this genuinely toxic, negative, or harmful to community vibes?
Answer in JSON only:
{
  "isToxic": boolean,
  "severity": "low" | "medium" | "high",
  "reason": "brief reason",
  "suggestedResponse": "what Banano should say in-channel, or null if no response needed"
}
Only flag real issues. Jokes, sarcasm, and light trash talk are fine.`;

    const text = await _complete([{ role: 'user', content: prompt }], 200);

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('[banano/vibe] Failed to parse vibe check:', e);
    }
    return null;
  }

  /**
   * Generate a Banano reply for a direct mention.
   *
   * @param {string} userText
   * @param {string} authorName
   * @param {Array<{role: 'user'|'assistant', content: string}>} history
   * @returns {Promise<string>}
   */
  async function generateReply(userText, authorName, history = []) {
    return _complete([
      ...history,
      { role: 'user', content: `${authorName}: ${userText}` },
    ], 300);
  }

  return { shouldEscalate, checkVibes, generateReply };
}

module.exports = { createVibeEngine };

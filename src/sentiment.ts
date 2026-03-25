/**
 * Layer 0: Known slur/hate-phrase pre-filter — bypasses AFINN entirely.
 * Layer 1: Local sentiment scoring — free, instant, no API call.
 */

const LATIN_SLUR_PATTERNS = [
  /\bfaggots?\b/i,
  /\bfags?\b/i,
  /\bniggers?\b/i,
  /\bniggas?\b/i,
  /\bkikes?\b/i,
  /\bchinks?\b/i,
  /\bspicks?\b/i,
  /\bspics?\b/i,
  /\bwetbacks?\b/i,
  /\bboongas?\b/i,
  /\bboongy?\b/i,
  /\bcoons?\b/i,
  /\bgooks?\b/i,
  /\btowelhead/i,
  /\braghead/i,
  /\btrann(?:y|ie?)s?\b/i,
  /\bretards?\b/i,
  /\bdykes?\b/i,
  /\bcunts?\b/i,
  /\btwats?\b/i,
];

const NON_LATIN_SLURS = [
  'сука', 'блять', 'блядь', '操你', '傻逼', '𨳒', 'चूतिया',
];

/**
 * Returns true if the text contains a known slur or hate phrase.
 * Latin-script slurs use word-boundary matching; non-Latin uses substring match.
 * When this returns true, the message bypasses AFINN and goes straight to AI review.
 */
export function containsKnownSlur(text: string): boolean {
  for (const pattern of LATIN_SLUR_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  const lower = text.toLowerCase();
  for (const slur of NON_LATIN_SLURS) {
    if (lower.includes(slur.toLowerCase())) return true;
  }
  return false;
}



// @ts-ignore — sentiment has no types
import Sentiment from "sentiment";

const analyzer = new Sentiment();

/**
 * Returns true if the message should be escalated to AI review.
 * Only messages with sentiment score <= threshold get escalated.
 */
export function shouldEscalate(text: string, threshold: number): boolean {
  const result = analyzer.analyze(text);
  return result.score <= threshold;
}

/**
 * Get the raw sentiment score for debugging/logging.
 */
export function getSentimentScore(text: string): number {
  return analyzer.analyze(text).score;
}

/**
 * Returns true if the text is likely non-English based on the proportion of
 * non-ASCII characters (Cyrillic, Chinese, Japanese, Korean, Arabic, Hebrew, etc.).
 * Heuristic: if more than 20% of characters have codepoint > 127, treat as non-English.
 */
export function isLikelyNonEnglish(text: string): boolean {
  if (!text || text.length === 0) return false;
  let nonAsciiCount = 0;
  for (const char of text) {
    if (char.codePointAt(0)! > 127) nonAsciiCount++;
  }
  return nonAsciiCount / text.length > 0.2;
}

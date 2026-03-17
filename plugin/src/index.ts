/**
 * Banano Vibe Monitor — OpenClaw Plugin
 *
 * Two-layer vibe moderation for Discord channels:
 *   Layer 1: Local sentiment scoring (free, instant)
 *   Layer 2: AI vibe review (only for flagged messages)
 *
 * Hooks:
 *   message_received → sentiment gate → AI review → in-channel response / mod escalation
 *   gateway_start    → initialize state
 *
 * Install:
 *   openclaw plugins install -l ./plugin
 */

import { shouldEscalate, getSentimentScore } from "./sentiment.js";
import { buildVibeCheckPrompt, parseVibeResult } from "./vibe-check.js";
import type { RecentMessage } from "./vibe-check.js";
import { initState, isSilenced, silence, unsilence } from "./state.js";

// ── Minimal types (avoid importing openclaw as dep) ──────────────────────────

type PluginLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

type PluginRuntime = {
  channel: {
    discord: {
      sendMessageDiscord: (params: {
        token: string;
        channelId: string;
        content: string;
      }) => Promise<unknown>;
    };
  };
  system: {
    enqueueSystemEvent: (
      text: string,
      opts: { sessionKey: string },
    ) => boolean;
  };
};

type OpenClawConfig = Record<string, unknown>;

type PluginApi = {
  id: string;
  name: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  registerCommand: (def: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: { args?: string }) => { text: string };
  }) => void;
  on: (hookName: string, handler: (...args: unknown[]) => unknown, opts?: unknown) => void;
  resolvePath: (input: string) => string;
};

type MessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

type MessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

// ── Config ───────────────────────────────────────────────────────────────────

type VibeConfig = {
  enabled: boolean;
  watchedChannelIds: string[];
  modChannelId: string | null;
  sentimentThreshold: number;
  maxRecentMessages: number;
};

function resolveConfig(pluginConfig?: Record<string, unknown>): VibeConfig {
  const cfg = pluginConfig || {};
  return {
    enabled: cfg.enabled !== false,
    watchedChannelIds: Array.isArray(cfg.watchedChannelIds) ? cfg.watchedChannelIds : [],
    modChannelId: typeof cfg.modChannelId === "string" ? cfg.modChannelId : null,
    sentimentThreshold: typeof cfg.sentimentThreshold === "number" ? cfg.sentimentThreshold : -2,
    maxRecentMessages: typeof cfg.maxRecentMessages === "number" ? cfg.maxRecentMessages : 10,
  };
}

// ── Resolve Discord bot token from OpenClaw config ───────────────────────────

function resolveDiscordToken(config: OpenClawConfig): string | null {
  try {
    const channels = config.channels as Record<string, unknown> | undefined;
    if (!channels) return null;
    const discord = channels.discord as Record<string, unknown> | undefined;
    if (!discord) return null;
    if (typeof discord.token === "string") return discord.token;
    // Check accounts
    const accounts = discord.accounts as Record<string, Record<string, unknown>> | undefined;
    if (accounts) {
      for (const acc of Object.values(accounts)) {
        if (typeof acc.token === "string") return acc.token;
      }
    }
  } catch {
    // Fall through
  }
  return null;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const plugin = {
  id: "banano-vibe",
  name: "Banano Vibe Monitor",
  description: "Two-layer vibe moderation for Discord: local sentiment gate + AI review.",
  version: "1.0.0",

  register(api: PluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const logger = api.logger;

    if (!config.enabled) {
      logger.info("[banano-vibe] Plugin disabled via config");
      return;
    }

    if (config.watchedChannelIds.length === 0) {
      logger.warn("[banano-vibe] No watched channels configured — running in mention-only mode");
    }

    const discordToken = resolveDiscordToken(api.config);
    if (!discordToken) {
      logger.error("[banano-vibe] No Discord token found in OpenClaw config — cannot send messages");
      return;
    }

    // Initialize persistent state
    const stateDir = api.resolvePath(".");
    initState(stateDir);

    logger.info(
      `[banano-vibe] Active | watching: ${config.watchedChannelIds.join(", ") || "none"} | ` +
      `mod channel: ${config.modChannelId || "none"} | threshold: ${config.sentimentThreshold}`,
    );

    // ── /vibe-status command ──────────────────────────────────────────────
    api.registerCommand({
      name: "vibe_status",
      description: "Show Banano vibe monitor status",
      handler: () => ({
        text: [
          "🦍 **Banano Vibe Monitor**",
          `Enabled: ${config.enabled}`,
          `Watching: ${config.watchedChannelIds.join(", ") || "none"}`,
          `Mod channel: ${config.modChannelId || "none"}`,
          `Threshold: ${config.sentimentThreshold}`,
        ].join("\n"),
      }),
    });

    // ── Utility: send a Discord message ───────────────────────────────────
    async function sendDiscord(channelId: string, content: string): Promise<void> {
      try {
        await api.runtime.channel.discord.sendMessageDiscord({
          token: discordToken!,
          channelId,
          content,
        });
      } catch (err) {
        logger.error(`[banano-vibe] Failed to send to ${channelId}: ${err}`);
      }
    }

    // ── Utility: run vibe check via system event ──────────────────────────
    // The plugin injects a system event into a temporary session to get an
    // AI response. For simplicity, the first version uses direct
    // enqueueSystemEvent which triggers an agent turn.
    //
    // NOTE: For a truly isolated vibe check that doesn't pollute Banano's
    // main session, you'd want a dedicated subagent or a lightweight
    // model call. This is the pragmatic v1 approach.

    // ── message_received hook ─────────────────────────────────────────────
    api.on("message_received", async (event: unknown, ctx: unknown) => {
      const msg = event as MessageReceivedEvent;
      const msgCtx = ctx as MessageContext;

      // Only handle Discord messages
      if (msgCtx.channelId !== "discord") return;

      const content = msg.content?.trim();
      if (!content) return;

      // Extract the Discord channel ID from conversationId
      // Format varies: could be "discord:CHANNEL_ID" or just the channel ID
      const conversationId = msgCtx.conversationId || "";
      const discordChannelId = conversationId.replace(/^discord:/, "");
      if (!discordChannelId) return;

      // ── Mod controls ─────────────────────────────────────────────────
      if (content === "!banano stop") {
        // We can't check Discord permissions from the hook alone,
        // but we trust the command since it's in-channel
        silence(discordChannelId);
        await sendDiscord(discordChannelId, "aight aight, going quiet 🤫");
        logger.info(`[banano-vibe] Silenced channel ${discordChannelId}`);
        return;
      }

      if (content === "!banano start") {
        unsilence(discordChannelId);
        await sendDiscord(discordChannelId, "ape is back 🦍");
        logger.info(`[banano-vibe] Unsilenced channel ${discordChannelId}`);
        return;
      }

      // Skip if silenced
      if (isSilenced(discordChannelId)) return;

      // Skip if not a watched channel
      if (!config.watchedChannelIds.includes(discordChannelId)) return;

      // ── Layer 1: Sentiment gate ──────────────────────────────────────
      const score = getSentimentScore(content);
      if (!shouldEscalate(content, config.sentimentThreshold)) {
        return; // Score above threshold — no action needed
      }

      logger.info(
        `[banano-vibe] Flagged (score: ${score}): "${content.slice(0, 80)}" from ${msg.from}`,
      );

      // ── Layer 2: AI vibe review ──────────────────────────────────────
      // Build the prompt and inject as a system event for the agent to process
      // The agent will respond based on its persona + this vibe check instruction
      const recentMessages: RecentMessage[] = []; // TODO: fetch recent messages via Discord API
      const vibePrompt = buildVibeCheckPrompt(content, msg.from || "unknown", recentMessages);

      // For v1, we inject a system event that asks the agent to do the vibe check.
      // The agent should respond with the JSON result based on the prompt.
      // This is a pragmatic approach — the agent handles the AI call natively.
      const sessionKey = `agent:main:discord:${discordChannelId}`;

      api.runtime.system.enqueueSystemEvent(
        `[VIBE CHECK — respond ONLY with JSON, do not post to chat]\n${vibePrompt}`,
        { sessionKey },
      );

      logger.info(`[banano-vibe] Vibe check enqueued for channel ${discordChannelId}`);

      // NOTE: In this v1 architecture, the agent processes the vibe check
      // and responds. The response handling (in-channel message, mod escalation)
      // would need to be handled by the agent's instructions in persona.js.
      //
      // For v2, we could:
      // 1. Use a lightweight direct model call instead of system event
      // 2. Parse the response in a message_sending hook
      // 3. Route to in-channel or mod channel based on severity
    });

    // ── message_sending hook (intercept vibe check responses) ─────────────
    api.on("message_sending", (event: unknown, ctx: unknown) => {
      const msg = event as { to: string; content: string; metadata?: Record<string, unknown> };
      const content = msg.content?.trim();

      // Try to detect if this is a vibe check JSON response from the agent
      if (!content) return;

      try {
        const result = parseVibeResult(content);
        if (!result) return; // Not a vibe check response

        // This IS a vibe check response — intercept it
        const msgCtx = ctx as MessageContext;
        const conversationId = msgCtx.conversationId || "";
        const discordChannelId = conversationId.replace(/^discord:/, "");

        if (result.isToxic) {
          // Send in-channel response if suggested
          if (result.suggestedResponse) {
            sendDiscord(discordChannelId, result.suggestedResponse);
          }

          // Escalate high severity to mod channel
          if (result.severity === "high" && config.modChannelId) {
            sendDiscord(
              config.modChannelId,
              `🚨 **Vibe alert** in <#${discordChannelId}>\n` +
              `Reason: ${result.reason}`,
            );
          }

          logger.info(
            `[banano-vibe] ${result.severity}: ${result.reason} → ` +
            `${result.suggestedResponse ? "responded" : "silent"}` +
            `${result.severity === "high" ? " + mod escalation" : ""}`,
          );
        } else {
          logger.info(`[banano-vibe] False alarm — ${result.reason}`);
        }

        // Block the raw JSON from being sent to the user
        return { cancel: true };
      } catch {
        // Not a vibe check response — let it through
      }
    });
  },
};

export default plugin;

import { Client } from "stoat.js";
import { addXp, all, get, moduleEnabled, run } from "./database";
import { executeCommand, type BotContext } from "./commands";
import { t } from "./i18n";
import { logger } from "../lib/logger";

const prefixDefault = process.env.BOT_PREFIX ?? "!";
const xpCooldowns = new Set<string>();
const spamTracker = new Map<string, number[]>();
const voiceSessions = new Map<string, { guildId: string; userId: string; startedAt: number }>();
const bannedWords = (process.env.BANNED_WORDS ?? "discord.gg/,badword1,badword2").split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);

export const client = new Client({
  baseURL: process.env.STOAT_API_URL ?? "https://api.stoat.chat",
  partials: true,
  eagerFetching: true,
  syncUnreads: false,
  autoReconnect: true,
  messageRewrites: true,
});

const clientState = client as any;
clientState.priceGames = new Map<string, number>();
let connected = false;
let started = false;

export function botStatus(): { configured: boolean; connected: boolean; user?: string } {
  return {
    configured: Boolean(process.env.STOAT_BOT_TOKEN ?? process.env.STOAT_TOKEN),
    connected,
    user: client.user?.displayName ?? client.user?.username,
  };
}

function prefixFor(guildId: string): string {
  return String(get("SELECT prefix FROM prefix_config WHERE guild_id = ?", guildId)?.prefix ?? prefixDefault);
}

function isBotMessage(message: any): boolean {
  return Boolean(message.author?.bot || message.authorId === client.user?.id);
}

function hasBypassRole(message: any): boolean {
  const serverId = message.server?.id;
  const memberRoles = message.member?.roles ?? [];
  if (!serverId || !memberRoles.length) return false;
  const bypass = all("SELECT role_id FROM antilink_bypass_roles WHERE guild_id = ?", serverId).map((row) => String(row.role_id));
  return memberRoles.some((roleId: string) => bypass.includes(roleId));
}

async function autoModerate(message: any): Promise<boolean> {
  if (!message.server || isBotMessage(message) || hasBypassRole(message)) return false;
  const serverId = String(message.server.id);
  const content = String(message.content ?? "").toLowerCase();
  if (moduleEnabled(serverId, "automod") && bannedWords.some((word) => content.includes(word))) {
    await message.delete().catch(() => undefined);
    const warning = await message.channel.sendMessage(`⚠️ ${message.author?.toString?.() ?? `<@${message.authorId}>`}, ton message contenait un lien ou terme interdit.`);
    setTimeout(() => warning.delete().catch(() => undefined), 5_000);
    return true;
  }

  if (moduleEnabled(serverId, "automod")) {
    const key = `${serverId}:${message.authorId}`;
    const now = Date.now();
    const recent = (spamTracker.get(key) ?? []).filter((time) => now - time < 3_000);
    recent.push(now);
    spamTracker.set(key, recent);
    if (recent.length >= 5) {
      await message.delete().catch(() => undefined);
      run("INSERT INTO warns (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)", serverId, message.authorId, client.user?.id ?? "system", "Spam automatique");
      await message.channel.sendMessage(`🚨 <@${message.authorId}> a été averti automatiquement pour spam.`);
      spamTracker.delete(key);
      return true;
    }
  }
  return false;
}

async function handleCounting(message: any): Promise<boolean> {
  if (!message.server || !moduleEnabled(message.server.id, "counting")) return false;
  const game = get("SELECT * FROM counting WHERE guild_id = ? AND channel_id = ?", message.server.id, message.channelId);
  if (!game) return false;
  const raw = String(message.content ?? "").trim();
  const number = Number(raw);
  if (!Number.isInteger(number) || raw !== String(number)) return false;
  const expected = Number(game.current_count) + 1;
  if (game.last_user_id === message.authorId || number !== expected) {
    await message.react("❌").catch(() => undefined);
    const penalty = Number(game.current_count) * 10;
    if (penalty) run("UPDATE economy SET balance = MAX(0, balance - ?) WHERE guild_id = ? AND user_id = ?", penalty, message.server.id, message.authorId);
    run("UPDATE counting SET current_count = 0, last_user_id = NULL WHERE guild_id = ?", message.server.id);
    await message.channel.sendMessage(`💥 **BOOM !** ${game.last_user_id === message.authorId ? "Tu ne peux pas compter deux fois d'affilée." : `Il fallait écrire **${expected}**.`}\n🔄 Le compteur repart à **1**.${penalty ? `\n💸 Malus : **${penalty}** pièces.` : ""}`);
    return true;
  }
  await message.react("✅").catch(() => undefined);
  const highScore = Math.max(number, Number(game.high_score));
  run("UPDATE counting SET current_count = ?, last_user_id = ?, high_score = ? WHERE guild_id = ?", number, message.authorId, highScore, message.server.id);
  if (number % 10 === 0) {
    const reward = number * 5;
    run(
      `INSERT INTO economy (guild_id, user_id, balance) VALUES (?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = balance + excluded.balance`,
      message.server.id,
      message.authorId,
      reward,
    );
    await message.channel.sendMessage(`🎉 Palier **${number}** atteint ! <@${message.authorId}> gagne **${reward}** pièces.`);
  }
  return true;
}

async function addMessageXp(message: any): Promise<void> {
  if (!message.server || isBotMessage(message) || !moduleEnabled(message.server.id, "levels")) return;
  const key = `${message.server.id}:${message.authorId}`;
  if (xpCooldowns.has(key)) return;
  xpCooldowns.add(key);
  setTimeout(() => xpCooldowns.delete(key), 60_000);
  const level = addXp(message.server.id, message.authorId, 15 + Math.floor(Math.random() * 11));
  if (level !== undefined) {
    await message.channel.sendMessage(t(message.authorId, "level_up", { user: `<@${message.authorId}>`, level }));
  }
}

async function onMessage(message: any): Promise<void> {
  if (!message || isBotMessage(message)) return;
  const wasModerated = await autoModerate(message);
  if (wasModerated) return;
  if (await handleCounting(message)) return;
  await addMessageXp(message);
  const content = String(message.content ?? "").trim();
  const guildId = message.server?.id ? String(message.server.id) : "";
  const prefix = prefixFor(guildId);
  if (!content.startsWith(prefix)) return;
  const [, command, argumentString = ""] = content.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\s]+)(?:\\s+([\\s\\S]*))?$`, "i")) ?? [];
  if (!command) return;
  const args = argumentString.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part: string) => part.replace(/^["']|["']$/g, "")) ?? [];
  const context: BotContext = { client, message, args, command: command.toLowerCase(), prefix };
  try {
    await executeCommand(context);
  } catch (error) {
    logger.error({ err: error, command: context.command }, "Command failed");
    await message.channel.sendMessage("❌ Une erreur est survenue pendant l'exécution de cette commande.").catch(() => undefined);
  }
}

function registerEvents(): void {
  client.on("messageCreate", (message) => void onMessage(message));
  client.on("messageUpdate", (message, previous) => {
    if (!message.server || isBotMessage(message) || message.content === previous.content) return;
    const channel = client.channels.get(message.channelId);
    if (moduleEnabled(message.server.id, "messagelogs")) {
      channel?.sendMessage(`✏️ Message modifié par <@${message.authorId}> :\nAvant : ${previous.content}\nAprès : ${message.content}`).catch(() => undefined);
    }
  });
  client.on("messageDelete", (message) => {
    const channel = client.channels.get(message.channelId);
    const serverId = channel?.serverId;
    if (channel && serverId && moduleEnabled(serverId, "messagelogs")) {
      channel.sendMessage(`🗑️ Un message a été supprimé dans ce salon.`).catch(() => undefined);
    }
  });
  client.on("serverMemberJoin", (member) => {
    const currentServer = member.server;
    if (!currentServer || !moduleEnabled(currentServer.id, "welcome")) return;
    const channel = currentServer.defaultChannel;
    if (channel) channel.sendMessage(`👋 Bienvenue ${member.user?.toString?.() ?? `<@${member.id.user}>`} sur **${currentServer.name}** !`).catch(() => undefined);
  });
  client.on("serverMemberLeave", (member) => {
    const currentServer = client.servers.get(member.id.server);
    const user = client.users.get(member.id.user);
    const channel = currentServer?.defaultChannel;
    if (channel && currentServer && moduleEnabled(currentServer.id, "welcome")) channel.sendMessage(`👋 ${user?.displayName ?? member.id.user} a quitté le serveur.`).catch(() => undefined);
  });
  client.on("error", (error) => logger.error({ err: error }, "Stoat client error"));
  client.on("disconnected", () => {
    connected = false;
    logger.warn("Stoat client disconnected; automatic reconnect is enabled");
  });
  client.on("ready", () => {
    connected = true;
    logger.info({ user: client.user?.displayName ?? client.user?.username }, "CutyMowGang connected to Stoat");
    setInterval(() => void monitorVoiceChannels(), 15_000);
    setInterval(() => void settleGiveaways(), 15_000);
  });
}

async function settleGiveaways(): Promise<void> {
  const expired = all("SELECT * FROM giveaways WHERE status = 'open' AND ends_at <= ?", Date.now());
  for (const giveaway of expired) {
    run("UPDATE giveaways SET status = 'closed' WHERE id = ?", giveaway.id);
    const channel = client.channels.get(giveaway.channel_id);
    if (!channel || !giveaway.message_id) continue;
    let winner = "aucun participant";
    try {
      const message = await channel.fetchMessage(giveaway.message_id);
      const participants = [...(message.reactions.get("🎉") ?? [])].filter((id: string) => id !== client.user?.id);
      if (participants.length) winner = `<@${participants[Math.floor(Math.random() * participants.length)]}>`;
    } catch {
      // The giveaway still closes even if the message is no longer available.
    }
    await channel.sendMessage(`🏁 Giveaway terminé — **${giveaway.prize}**\nGagnant : ${winner}`).catch(() => undefined);
  }
}

async function monitorVoiceChannels(): Promise<void> {
  if (!connected) return;
  for (const channel of client.channels.values()) {
    if (!channel.isVoice || !channel.serverId) continue;
    const participantIds = [...channel.voiceParticipants.keys()] as string[];
    const active = new Set(participantIds);

    for (const participantId of active) {
      const key = `${channel.serverId}:${channel.id}:${participantId}`;
      if (!voiceSessions.has(key)) {
        voiceSessions.set(key, { guildId: channel.serverId, userId: participantId, startedAt: Date.now() });
      }
    }

    for (const [key, session] of voiceSessions) {
      if (!key.startsWith(`${channel.serverId}:${channel.id}:`) || active.has(session.userId)) continue;
      const minutes = Math.floor((Date.now() - session.startedAt) / 60_000);
      if (minutes >= 1 && moduleEnabled(session.guildId, "levels")) {
        addXp(session.guildId, session.userId, Math.min(600, minutes * 5));
      }
      voiceSessions.delete(key);
    }
  }
}

export async function startBot(): Promise<void> {
  if (started) return;
  started = true;
  registerEvents();
  const token = process.env.STOAT_BOT_TOKEN ?? process.env.STOAT_TOKEN;
  if (!token) {
    logger.warn("STOAT_BOT_TOKEN is not configured; health server stays online but the bot is idle");
    return;
  }
  try {
    await client.loginBot(token);
  } catch (error) {
    connected = false;
    logger.error({ err: error }, "Unable to connect CutyMowGang to Stoat");
  }
}
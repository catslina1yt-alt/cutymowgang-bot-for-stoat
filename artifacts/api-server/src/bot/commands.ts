import {
  all,
  balance,
  changeBalance,
  cooldownReady,
  cooldownRemaining,
  get,
  moduleEnabled,
  run,
  setBalance,
  setModule,
  xpForLevel,
} from "./database";
import { setLanguage, t, translateText } from "./i18n";

export interface BotContext {
  client: any;
  message: any;
  args: string[];
  command: string;
  prefix: string;
}

const categories: Record<string, string[]> = {
  Administration: ["module", "setup", "ticket-setup", "modlogs", "antilien"],
  Économie: ["balance", "daily", "work", "pay", "shop", "add-shop", "buy", "slots"],
  Jeux: ["justeprix", "counting", "poll", "giveaway"],
  Niveaux: ["rank", "leaderboard"],
  Modération: ["announce", "ban", "clear", "kick", "lock", "mute", "report", "timeout", "unban", "unlock", "unmute", "warn"],
  Utilitaires: ["help", "allfeatures", "botinfo", "commandes", "language", "ping", "role", "role-menu", "serverinfo", "set-counting", "set-suggestions", "staffcommands", "suggest", "test-welcome", "ticket", "close-ticket", "translate", "userinfo", "voice-setup"],
};

const aliases: Record<string, string> = {
  commands: "commandes",
  features: "allfeatures",
  work: "work",
  works: "work",
  giveaway: "giveaway",
  ticketsetup: "ticket-setup",
  tickets: "ticket",
  setcounting: "set-counting",
  setsuggestions: "set-suggestions",
  user: "userinfo",
};

const mention = (id: string) => `<@${id}>`;
const displayName = (ctx: BotContext) => ctx.message.author?.displayName ?? ctx.message.author?.username ?? mention(ctx.message.authorId ?? "user");
const server = (ctx: BotContext) => ctx.message.server;
const guildId = (ctx: BotContext) => String(ctx.message.server?.id ?? "");
const userId = (ctx: BotContext) => String(ctx.message.authorId ?? ctx.message.author?.id ?? "");

async function reply(ctx: BotContext, text: string): Promise<any> {
  return ctx.message.channel.sendMessage(String(text).slice(0, 4000));
}

function requireServer(ctx: BotContext): boolean {
  return Boolean(ctx.message.server?.id);
}

function isAdmin(ctx: BotContext): boolean {
  const currentServer = server(ctx);
  if (!currentServer) return false;
  if (currentServer.ownerId === userId(ctx)) return true;
  try {
    return Boolean(ctx.message.member?.hasPermission(currentServer, "ManageServer", "ManageChannel", "ManageMessages"));
  } catch {
    return false;
  }
}

function isModerator(ctx: BotContext): boolean {
  const currentServer = server(ctx);
  if (!currentServer) return false;
  if (currentServer.ownerId === userId(ctx)) return true;
  try {
    return Boolean(ctx.message.member?.hasPermission(currentServer, "ManageMessages", "KickMembers", "BanMembers", "TimeoutMembers"));
  } catch {
    return false;
  }
}

function targetId(raw?: string): string | undefined {
  if (!raw) return undefined;
  const mentionMatch = raw.match(/[<@!>]([^>]+)>?/);
  return mentionMatch?.[1] ?? raw.replace(/[<@!>]/g, "");
}

function parseDuration(value: string | undefined, fallbackMinutes = 10): number {
  const match = value?.match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return fallbackMinutes * 60_000;
  const amount = Number(match[1]);
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[String(match[2] ?? "m").toLowerCase() as "s" | "m" | "h" | "d"] ?? 60_000;
  return Math.min(amount * multiplier, 28 * 86_400_000);
}

function cooldownText(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function moderationTarget(ctx: BotContext): Promise<{ member: any; id: string } | undefined> {
  const id = targetId(ctx.args[0]);
  if (!id || !server(ctx)) {
    await reply(ctx, `❌ Utilisation : \`${ctx.prefix}${ctx.command} @membre [raison]\``);
    return undefined;
  }
  try {
    const member = await server(ctx).fetchMember(id);
    return { member, id };
  } catch {
    await reply(ctx, "❌ Ce membre n'a pas été trouvé sur ce serveur.");
    return undefined;
  }
}

async function help(ctx: BotContext): Promise<void> {
  const requested = ctx.args[0]?.toLowerCase();
  if (requested && categories[requested]) {
    await reply(ctx, `**${requested}**\n${categories[requested].map((name) => `• \`${ctx.prefix}${name}\``).join("\n")}`);
    return;
  }
  await reply(
    ctx,
    `**CutyMowGang pour Stoat**\nPréfixe : \`${ctx.prefix}\`\n\n${Object.entries(categories)
      .map(([name, commands]) => `**${name}** — ${commands.slice(0, 8).map((command) => `\`${command}\``).join(" ")}`)
      .join("\n")}\n\nUtilise \`${ctx.prefix}help <catégorie>\` pour le détail.`,
  );
}

export async function executeCommand(ctx: BotContext): Promise<void> {
  const command = aliases[ctx.command] ?? ctx.command;
  ctx.command = command;

  switch (command) {
    case "help":
    case "commandes":
    case "allfeatures":
      return help(ctx);
    case "ping":
      return void reply(ctx, "🏓 Pong — CutyMowGang est en ligne sur Stoat.");
    case "botinfo":
      return void reply(ctx, `🤖 **CutyMowGang**\nPlateforme : Stoat\nCommandes : ${Object.values(categories).flat().length}\nBase : SQLite`);
    case "language": {
      const selected = setLanguage(userId(ctx), ctx.args[0] ?? "fr");
      return void reply(ctx, t(userId(ctx), "language_changed", {}) + `\nLangue active : \`${selected}\``);
    }
    case "translate": {
      const language = ctx.args[0] === "en" || ctx.args[0] === "fr" ? ctx.args.shift()! : "fr";
      return void reply(ctx, `🔄 Traduction : **${translateText(ctx.args.join(" "), language)}**`);
    }
    case "serverinfo":
      return void reply(ctx, !server(ctx) ? "❌ Cette commande doit être utilisée sur un serveur." : `🏠 **${server(ctx).name}**\nID : \`${server(ctx).id}\`\nSalons : ${server(ctx).channels.length}\nMembres : synchronisés par Stoat`);
    case "userinfo": {
      const id = targetId(ctx.args[0]) ?? userId(ctx);
      const user = id === userId(ctx) ? ctx.message.author : ctx.client.users.get(id);
      return void reply(ctx, `👤 **${user?.displayName ?? user?.username ?? id}**\nID : \`${id}\`\nCompte : ${user?.createdAt ? user.createdAt.toLocaleDateString("fr-FR") : "inconnu"}`);
    }
    case "roleinfo": {
      if (!server(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const roleName = ctx.args.join(" ").toLowerCase();
      const role = server(ctx).orderedRoles.find((candidate: any) => candidate.name.toLowerCase().includes(roleName));
      return void reply(ctx, role ? `🎭 **${role.name}**\nID : \`${role.id}\`\nRang : ${role.rank}` : "❌ Rôle introuvable.");
    }
    case "balance": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const id = targetId(ctx.args[0]) ?? userId(ctx);
      return void reply(ctx, `💰 ${mention(id)} possède **${balance(guildId(ctx), id)}** pièces.`);
    }
    case "daily": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      if (!cooldownReady(guildId(ctx), userId(ctx), "daily", 86_400)) {
        return void reply(ctx, t(userId(ctx), "cooldown_wait", { time: cooldownText(cooldownRemaining(guildId(ctx), userId(ctx), "daily", 86_400)) }));
      }
      const amount = 250;
      changeBalance(guildId(ctx), userId(ctx), amount);
      return void reply(ctx, t(userId(ctx), "daily_reward", { amount }));
    }
    case "work": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      if (!cooldownReady(guildId(ctx), userId(ctx), "work", 3_600)) {
        return void reply(ctx, `⏳ Reviens dans ${cooldownText(cooldownRemaining(guildId(ctx), userId(ctx), "work", 3_600))}.`);
      }
      const jobs = ["réparé une clôture", "livré des colis", "aidé un voisin", "toiletté un chat"];
      const amount = 80 + Math.floor(Math.random() * 121);
      changeBalance(guildId(ctx), userId(ctx), amount);
      return void reply(ctx, `🛠️ Tu as ${jobs[Math.floor(Math.random() * jobs.length)]} et gagné **${amount}** pièces.`);
    }
    case "pay": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const recipient = targetId(ctx.args[0]);
      const amount = Math.floor(Number(ctx.args[1]));
      if (!recipient || !Number.isFinite(amount) || amount <= 0) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}pay @membre montant\``);
      if (balance(guildId(ctx), userId(ctx)) < amount) return void reply(ctx, "❌ Solde insuffisant.");
      changeBalance(guildId(ctx), userId(ctx), -amount);
      changeBalance(guildId(ctx), recipient, amount);
      return void reply(ctx, `💸 ${mention(userId(ctx))} a envoyé **${amount}** pièces à ${mention(recipient)}.`);
    }
    case "slots": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const bet = Math.max(1, Math.floor(Number(ctx.args[0] ?? 25)));
      if (balance(guildId(ctx), userId(ctx)) < bet) return void reply(ctx, "❌ Solde insuffisant.");
      const symbols = ["🍒", "🍋", "🔔", "⭐", "💎"];
      const result = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
      const won = result[0] === result[1] && result[1] === result[2] ? bet * 5 : result[0] === result[1] || result[1] === result[2] ? bet * 2 : 0;
      changeBalance(guildId(ctx), userId(ctx), -bet);
      if (won) changeBalance(guildId(ctx), userId(ctx), won);
      return void reply(ctx, `🎰 ${result.join(" | ")}\n${won ? `🎉 Gain : **${won}** pièces !` : `Perdu : **${bet}** pièces.`}`);
    }
    case "shop": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const items = all("SELECT id, role_id, price FROM shop WHERE guild_id = ? ORDER BY price", guildId(ctx));
      return void reply(ctx, items.length ? `🛒 **Boutique**\n${items.map((item) => `• \`${item.id}\` rôle \`${item.role_id}\` — **${item.price}** pièces`).join("\n")}` : "🛒 La boutique est vide. Un administrateur peut utiliser `!add-shop`.");
    }
    case "add-shop": {
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      const role = ctx.args[0]?.replace(/[<@&>]/g, "");
      const price = Math.floor(Number(ctx.args[1]));
      if (!role || !Number.isFinite(price) || price <= 0) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}add-shop <role_id> <prix>\``);
      run("INSERT INTO shop (guild_id, role_id, price) VALUES (?, ?, ?)", guildId(ctx), role, price);
      return void reply(ctx, "✅ Article ajouté à la boutique.");
    }
    case "buy": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const item = get("SELECT * FROM shop WHERE guild_id = ? AND id = ?", guildId(ctx), Number(ctx.args[0]));
      if (!item) return void reply(ctx, "❌ Article introuvable.");
      if (balance(guildId(ctx), userId(ctx)) < Number(item.price)) return void reply(ctx, "❌ Solde insuffisant.");
      const member = ctx.message.member;
      if (!member) return void reply(ctx, "❌ Membre introuvable.");
      changeBalance(guildId(ctx), userId(ctx), -Number(item.price));
      const roles = [...(member.roles ?? []), item.role_id];
      await member.edit({ roles } as any);
      return void reply(ctx, `✅ Rôle acheté pour **${item.price}** pièces.`);
    }
    case "rank": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const id = targetId(ctx.args[0]) ?? userId(ctx);
      const row = get("SELECT xp, level FROM levels WHERE guild_id = ? AND user_id = ?", guildId(ctx), id) ?? { xp: 0, level: 0 };
      return void reply(ctx, `📈 ${mention(id)} — niveau **${row.level}**, XP **${row.xp}/${xpForLevel(Number(row.level))}**`);
    }
    case "leaderboard": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const rows = all("SELECT user_id, level, xp FROM levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT 10", guildId(ctx));
      return void reply(ctx, rows.length ? `🏆 **Classement**\n${rows.map((row, index) => `${index + 1}. ${mention(row.user_id)} — niveau ${row.level} (${row.xp} XP)`).join("\n")}` : "🏆 Aucun classement pour le moment.");
    }
    case "announce":
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      return void reply(ctx, `📢 **Annonce**\n${ctx.args.join(" ") || "Message vide."}`);
    case "warn": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const target = await moderationTarget(ctx);
      if (!target) return;
      const reason = ctx.args.slice(1).join(" ") || "Aucune raison donnée";
      run("INSERT INTO warns (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)", guildId(ctx), target.id, userId(ctx), reason);
      return void reply(ctx, `⚠️ ${mention(target.id)} a reçu un avertissement : ${reason}`);
    }
    case "ban":
    case "kick":
    case "unban": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const id = targetId(ctx.args[0]);
      if (!id) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}${command} <user_id>\``);
      try {
        if (command === "ban") await server(ctx).banUser(id, { reason: ctx.args.slice(1).join(" ") || "Modération" } as any);
        if (command === "kick") await server(ctx).kickUser(id);
        if (command === "unban") await server(ctx).unbanUser(id);
        return void reply(ctx, `✅ Action \`${command}\` appliquée à ${mention(id)}.`);
      } catch (error) {
        return void reply(ctx, `❌ Stoat a refusé l'action : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
    }
    case "timeout":
    case "mute": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const target = await moderationTarget(ctx);
      if (!target) return;
      try {
        await target.member.edit({ timeout: command === "mute" ? new Date(Date.now() + 3_600_000) : new Date(Date.now() + parseDuration(ctx.args[1])) } as any);
        return void reply(ctx, `🔇 ${mention(target.id)} a été mis en timeout.`);
      } catch {
        return void reply(ctx, "❌ Le timeout n'a pas pu être appliqué. Vérifie la hiérarchie des rôles.");
      }
    }
    case "unmute": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const target = await moderationTarget(ctx);
      if (!target) return;
      await target.member.edit({ timeout: null } as any);
      return void reply(ctx, `🔊 Timeout retiré pour ${mention(target.id)}.`);
    }
    case "clear": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const count = Math.min(100, Math.max(1, Number(ctx.args[0] ?? 10)));
      const messages = await ctx.message.channel.fetchMessages({ limit: count });
      await ctx.message.channel.deleteMessages(messages.map((item: any) => item.id));
      return void reply(ctx, `🧹 ${messages.length} message(s) supprimé(s).`);
    }
    case "lock":
    case "unlock":
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      await ctx.message.channel.edit({ description: command === "lock" ? "🔒 Salon verrouillé par la modération." : undefined } as any);
      return void reply(ctx, command === "lock" ? "🔒 Salon verrouillé (utilise les permissions Stoat pour empêcher l'écriture)." : "🔓 Salon déverrouillé.");
    case "modlogs":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      run(
        `INSERT INTO modlogs_config (guild_id, channel_id) VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
        guildId(ctx),
        ctx.args[0]?.replace(/[<#>]/g, "") ?? ctx.message.channel.id,
      );
      return void reply(ctx, "✅ Salon des logs de modération configuré.");
    case "antilien": {
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      const role = ctx.args[0]?.replace(/[<@&>]/g, "");
      if (!role) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}antilien <role_id>\``);
      run("INSERT OR IGNORE INTO antilink_bypass_roles (guild_id, role_id) VALUES (?, ?)", guildId(ctx), role);
      return void reply(ctx, "✅ Rôle ajouté à la liste de contournement anti-liens.");
    }
    case "report":
      return void reply(ctx, `🚩 Signalement transmis à la modération : ${ctx.args.join(" ") || "aucun détail"}`);
    case "module": {
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      const name = ctx.args[0];
      const enabled = !["off", "disable", "0", "false"].includes((ctx.args[1] ?? "on").toLowerCase());
      if (!name) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}module <levels|automod|counting|welcome> <on|off>\``);
      setModule(guildId(ctx), name, enabled);
      return void reply(ctx, `✅ Module \`${name}\` ${enabled ? "activé" : "désactivé"}.`);
    }
    case "setup":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      for (const name of ["levels", "automod", "welcome", "counting", "suggestions", "tickets"]) setModule(guildId(ctx), name, true);
      return void reply(ctx, t(userId(ctx), "setup_complete"));
    case "set-counting":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      run(
        `INSERT INTO counting (guild_id, channel_id, current_count, last_user_id, high_score) VALUES (?, ?, 0, NULL, 0)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, current_count = 0, last_user_id = NULL`,
        guildId(ctx),
        ctx.args[0]?.replace(/[<#>]/g, "") ?? ctx.message.channel.id,
      );
      return void reply(ctx, "✅ Jeu du comptage configuré. Le prochain nombre est **1**.");
    case "set-suggestions":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      run(
        `INSERT INTO suggestions_config (guild_id, channel_id) VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id`,
        guildId(ctx),
        ctx.args[0]?.replace(/[<#>]/g, "") ?? ctx.message.channel.id,
      );
      return void reply(ctx, "✅ Salon des suggestions configuré.");
    case "suggest": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const text = ctx.args.join(" ");
      if (!text) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}suggest <idée>\``);
      const channelId = String(get("SELECT channel_id FROM suggestions_config WHERE guild_id = ?", guildId(ctx))?.channel_id ?? ctx.message.channel.id);
      const channel = ctx.client.channels.get(channelId) ?? ctx.message.channel;
      const sent = await channel.sendMessage(`💡 **Suggestion de ${displayName(ctx)}**\n${text}\n\n✅ Réagis avec ✅ pour soutenir, ❌ pour refuser.`);
      await sent.react("✅").catch(() => undefined);
      await sent.react("❌").catch(() => undefined);
      return;
    }
    case "poll": {
      const question = ctx.args.join(" ");
      if (!question) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}poll <question>\``);
      const sent = await ctx.message.channel.sendMessage(`📊 **Sondage**\n${question}\n\n✅ Oui — ❌ Non`);
      await sent.react("✅").catch(() => undefined);
      await sent.react("❌").catch(() => undefined);
      return;
    }
    case "giveaway": {
      if (!isModerator(ctx)) return void reply(ctx, "❌ Permission modération requise.");
      const duration = parseDuration(ctx.args[0], 60);
      const prize = ctx.args.slice(1).join(" ") || "un cadeau";
      const endsAt = Date.now() + duration;
      const sent = await ctx.message.channel.sendMessage(`🎉 **Giveaway** : ${prize}\nRéagis avec 🎉 pour participer !\nFin : <t:${Math.floor(endsAt / 1000)}:R>`);
      await sent.react("🎉").catch(() => undefined);
      run("INSERT INTO giveaways (guild_id, channel_id, message_id, prize, ends_at) VALUES (?, ?, ?, ?, ?)", guildId(ctx), ctx.message.channel.id, sent.id, prize, endsAt);
      return;
    }
    case "justeprix":
      ctx.client.priceGames ??= new Map<string, number>();
      ctx.client.priceGames.set(`${guildId(ctx)}:${ctx.message.channel.id}`, 1 + Math.floor(Math.random() * 100));
      return void reply(ctx, `🎯 Une partie du juste prix est lancée ! Devine avec \`${ctx.prefix}guess <nombre>\` (entre 1 et 100).`);
    case "guess": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const key = `${guildId(ctx)}:${ctx.message.channel.id}`;
      const expected = ctx.client.priceGames?.get(key);
      const guess = Number(ctx.args[0]);
      if (!expected) return void reply(ctx, `❌ Aucune partie en cours. Lance \`${ctx.prefix}justeprix\`.`);
      if (!Number.isInteger(guess) || guess < 1 || guess > 100) return void reply(ctx, "❌ Choisis un nombre entier entre 1 et 100.");
      if (guess === expected) {
        ctx.client.priceGames.delete(key);
        changeBalance(guildId(ctx), userId(ctx), 150);
        return void reply(ctx, `🎉 Bravo ${mention(userId(ctx))} ! Le nombre était **${expected}**. Tu gagnes **150** pièces.`);
      }
      return void reply(ctx, guess < expected ? "⬆️ C'est plus !" : "⬇️ C'est moins !");
    }
    case "role": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const roleId = ctx.args[0]?.replace(/[<@&>]/g, "");
      if (!roleId) return void reply(ctx, `❌ Utilisation : \`${ctx.prefix}role <role_id>\``);
      const member = await server(ctx).fetchMember(userId(ctx));
      const roles = [...(member.roles ?? [])];
      const nextRoles = roles.includes(roleId) ? roles.filter((id: string) => id !== roleId) : [...roles, roleId];
      await member.edit({ roles: nextRoles } as any);
      return void reply(ctx, `${roles.includes(roleId) ? "➖ Rôle retiré" : "➕ Rôle ajouté"} : \`${roleId}\`.`);
    }
    case "role-menu":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      return void reply(ctx, "🎭 Panneau de rôles Stoat : les membres peuvent demander un rôle avec `!role <role_id>`. Les boutons Discord ont été remplacés par des commandes/réactions compatibles.");
    case "ticket-setup": {
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      run(
        `INSERT INTO ticket_config (guild_id, channel_id, role_id) VALUES (?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, role_id = excluded.role_id`,
        guildId(ctx),
        ctx.message.channel.id,
        ctx.args[0]?.replace(/[<@&>]/g, "") ?? null,
      );
      return void reply(ctx, `🎫 Configuration tickets enregistrée. Les membres peuvent utiliser \`${ctx.prefix}ticket <motif>\`.`);
    }
    case "ticket": {
      if (!requireServer(ctx)) return void reply(ctx, "❌ Cette commande doit être utilisée sur un serveur.");
      const existing = get("SELECT channel_id FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'", guildId(ctx), userId(ctx));
      if (existing) return void reply(ctx, `❌ Tu as déjà un ticket ouvert : \`${existing.channel_id}\``);
      try {
        const ticketChannel = await server(ctx).createChannel({ name: `ticket-${userId(ctx).slice(-6)}`, channel_type: "Text" } as any);
        run("INSERT INTO tickets (guild_id, user_id, channel_id, reason) VALUES (?, ?, ?, ?)", guildId(ctx), userId(ctx), ticketChannel.id, ctx.args.join(" ") || "Support");
        await ticketChannel.sendMessage(`🎫 ${mention(userId(ctx))}\nMotif : **${ctx.args.join(" ") || "Support"}**\nUn membre du staff va répondre ici.\nFermer : \`${ctx.prefix}close-ticket\``);
        return void reply(ctx, `✅ Ticket créé : \`${ticketChannel.id}\``);
      } catch {
        return void reply(ctx, "❌ Impossible de créer le ticket. Vérifie les permissions de gestion des salons.");
      }
    }
    case "close-ticket": {
      const ticket = get("SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? AND status = 'open'", guildId(ctx), ctx.message.channel.id);
      if (!ticket || (ticket.user_id !== userId(ctx) && !isModerator(ctx))) return void reply(ctx, "❌ Ce salon n'est pas un ticket ouvert pour toi.");
      run("UPDATE tickets SET status = 'closed' WHERE guild_id = ? AND channel_id = ?", guildId(ctx), ctx.message.channel.id);
      await reply(ctx, "🔒 Ticket fermé. Le salon sera supprimé dans quelques secondes.");
      setTimeout(() => ctx.message.channel.delete(true).catch(() => undefined), 3_000);
      return;
    }
    case "test-welcome":
      return void reply(ctx, `👋 Bienvenue sur **${server(ctx)?.name ?? "le serveur"}**, ${mention(userId(ctx))} !`);
    case "voice-setup":
      if (!isAdmin(ctx)) return void reply(ctx, "❌ Permission administrateur requise.");
      run(
        `INSERT INTO voice_config (guild_id, trigger_channel_id) VALUES (?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET trigger_channel_id = excluded.trigger_channel_id`,
        guildId(ctx),
        ctx.args[0]?.replace(/[<#>]/g, "") ?? ctx.message.channel.id,
      );
      return void reply(ctx, "✅ Surveillance vocale configurée. L'XP vocale est accordée à la sortie des salons et les salons Stoat Voice v2 sont surveillés.");
    case "staffcommands":
      return void reply(ctx, `🛡️ Staff : \`${ctx.prefix}warn\`, \`${ctx.prefix}timeout\`, \`${ctx.prefix}mute\`, \`${ctx.prefix}kick\`, \`${ctx.prefix}ban\`, \`${ctx.prefix}clear\`, \`${ctx.prefix}lock\`, \`${ctx.prefix}modlogs\``);
    default:
      return void reply(ctx, `❓ Commande inconnue. Utilise \`${ctx.prefix}help\`.`);
  }
}

export function knownCommands(): string[] {
  return Object.values(categories).flat();
}
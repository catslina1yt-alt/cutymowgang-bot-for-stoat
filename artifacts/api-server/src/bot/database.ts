import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const databasePath =
  process.env.BOT_DATABASE_PATH ??
  path.join(process.cwd(), "data", "cutymowgang.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS economy (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    last_daily INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS economy_cooldowns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    last_used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, command_name)
  );
  CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    price INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS counting (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    current_count INTEGER NOT NULL DEFAULT 0,
    last_user_id TEXT,
    high_score INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS suggestions_config (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ticket_config (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    category_id TEXT,
    role_id TEXT
  );
  CREATE TABLE IF NOT EXISTS guild_modules (
    guild_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, module_name)
  );
  CREATE TABLE IF NOT EXISTS user_languages (
    user_id TEXT PRIMARY KEY,
    language TEXT NOT NULL DEFAULT 'fr'
  );
  CREATE TABLE IF NOT EXISTS warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS modlogs_config (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS antilink_bypass_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
  );
  CREATE TABLE IF NOT EXISTS prefix_config (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL DEFAULT '!'
  );
  CREATE TABLE IF NOT EXISTS tickets (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winner_count INTEGER NOT NULL DEFAULT 1,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
  );
  CREATE TABLE IF NOT EXISTS voice_config (
    guild_id TEXT PRIMARY KEY,
    trigger_channel_id TEXT NOT NULL
  );
`);

export type Row = Record<string, any>;

export function get<T extends Row = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T extends Row = Row>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: unknown[]): void {
  db.prepare(sql).run(...params);
}

export function balance(guildId: string, userId: string): number {
  return Number(get("SELECT balance FROM economy WHERE guild_id = ? AND user_id = ?", guildId, userId)?.balance ?? 0);
}

export function changeBalance(guildId: string, userId: string, amount: number): number {
  run(
    `INSERT INTO economy (guild_id, user_id, balance) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = MAX(0, economy.balance + excluded.balance)`,
    guildId,
    userId,
    amount,
  );
  return balance(guildId, userId);
}

export function setBalance(guildId: string, userId: string, amount: number): void {
  run(
    `INSERT INTO economy (guild_id, user_id, balance) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET balance = excluded.balance`,
    guildId,
    userId,
    Math.max(0, Math.floor(amount)),
  );
}

export function moduleEnabled(guildId: string, moduleName: string): boolean {
  const row = get("SELECT enabled FROM guild_modules WHERE guild_id = ? AND module_name = ?", guildId, moduleName);
  return row ? Number(row.enabled) === 1 : true;
}

export function setModule(guildId: string, moduleName: string, enabled: boolean): void {
  run(
    `INSERT INTO guild_modules (guild_id, module_name, enabled) VALUES (?, ?, ?)
     ON CONFLICT(guild_id, module_name) DO UPDATE SET enabled = excluded.enabled`,
    guildId,
    moduleName,
    enabled ? 1 : 0,
  );
}

export function cooldownReady(guildId: string, userId: string, commandName: string, seconds: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const row = get(
    "SELECT last_used FROM economy_cooldowns WHERE guild_id = ? AND user_id = ? AND command_name = ?",
    guildId,
    userId,
    commandName,
  );
  if (row && now - Number(row.last_used) < seconds) return false;
  run(
    `INSERT INTO economy_cooldowns (guild_id, user_id, command_name, last_used) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id, command_name) DO UPDATE SET last_used = excluded.last_used`,
    guildId,
    userId,
    commandName,
    now,
  );
  return true;
}

export function cooldownRemaining(guildId: string, userId: string, commandName: string, seconds: number): number {
  const last = Number(
    get(
      "SELECT last_used FROM economy_cooldowns WHERE guild_id = ? AND user_id = ? AND command_name = ?",
      guildId,
      userId,
      commandName,
    )?.last_used ?? 0,
  );
  return Math.max(0, seconds - (Math.floor(Date.now() / 1000) - last));
}

export function xpForLevel(level: number): number {
  return 5 * level ** 2 + 50 * level + 100;
}

export function addXp(guildId: string, userId: string, xp: number): number | undefined {
  const current = get("SELECT xp, level FROM levels WHERE guild_id = ? AND user_id = ?", guildId, userId) ?? {
    xp: 0,
    level: 0,
  };
  let nextXp = Number(current.xp) + xp;
  let nextLevel = Number(current.level);
  let gainedLevel: number | undefined;
  while (nextXp >= xpForLevel(nextLevel)) {
    nextXp -= xpForLevel(nextLevel);
    nextLevel += 1;
    gainedLevel = nextLevel;
  }
  run(
    `INSERT INTO levels (guild_id, user_id, xp, level) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`,
    guildId,
    userId,
    nextXp,
    nextLevel,
  );
  return gainedLevel;
}

export function closeDatabase(): void {
  if (db.open) db.close();
}

process.once("SIGINT", closeDatabase);
process.once("SIGTERM", closeDatabase);
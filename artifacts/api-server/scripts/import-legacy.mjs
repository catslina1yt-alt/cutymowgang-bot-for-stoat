import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const sourcePath = process.argv.slice(2).find((argument) => argument !== "--");
const targetPath = process.env.BOT_DATABASE_PATH ?? path.join(process.cwd(), "data", "cutymowgang.sqlite");

if (!sourcePath || !existsSync(sourcePath)) {
  console.error("Usage: pnpm --filter @workspace/api-server run import:legacy -- /path/to/json.sqlite");
  process.exit(1);
}

mkdirSync(path.dirname(targetPath), { recursive: true });
const source = new Database(sourcePath, { readonly: true });
const target = new Database(targetPath);
target.pragma("journal_mode = WAL");
target.exec(`
  CREATE TABLE IF NOT EXISTS economy (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, balance INTEGER DEFAULT 0, last_daily INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id));
  CREATE TABLE IF NOT EXISTS economy_cooldowns (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, command_name TEXT NOT NULL, last_used INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id, command_name));
  CREATE TABLE IF NOT EXISTS shop (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, role_id TEXT NOT NULL, price INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS levels (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, PRIMARY KEY (guild_id, user_id));
  CREATE TABLE IF NOT EXISTS counting (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, current_count INTEGER DEFAULT 0, last_user_id TEXT, high_score INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS suggestions_config (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ticket_config (guild_id TEXT PRIMARY KEY, channel_id TEXT, category_id TEXT, role_id TEXT);
  CREATE TABLE IF NOT EXISTS guild_modules (guild_id TEXT NOT NULL, module_name TEXT NOT NULL, enabled INTEGER DEFAULT 1, PRIMARY KEY (guild_id, module_name));
  CREATE TABLE IF NOT EXISTS user_languages (user_id TEXT PRIMARY KEY, language TEXT DEFAULT 'fr');
  CREATE TABLE IF NOT EXISTS warns (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, reason TEXT NOT NULL, timestamp INTEGER DEFAULT (unixepoch()));
  CREATE TABLE IF NOT EXISTS modlogs_config (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS antilink_bypass_roles (guild_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (guild_id, role_id));
`);

const tables = [
  ["economy", "guild_id, user_id, balance, last_daily"],
  ["economy_cooldowns", "guild_id, user_id, command_name, last_used"],
  ["shop", "id, guild_id, role_id, price"],
  ["levels", "guild_id, user_id, xp, level"],
  ["counting", "guild_id, channel_id, current_count, last_user_id, high_score"],
  ["suggestions_config", "guild_id, channel_id"],
  ["ticket_config", "guild_id, channel_id, category_id, role_id"],
  ["guild_modules", "guild_id, module_name, enabled"],
  ["user_languages", "user_id, language"],
  ["warns", "id, guild_id, user_id, moderator_id, reason, timestamp"],
  ["modlogs_config", "guild_id, channel_id"],
  ["antilink_bypass_roles", "guild_id, role_id"],
];

target.transaction(() => {
  for (const [table, columns] of tables) {
    const exists = source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const rows = source.prepare(`SELECT ${columns} FROM ${table}`).all();
    const names = columns.split(", ");
    const placeholders = names.map(() => "?").join(", ");
    const insert = target.prepare(`INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`);
    for (const row of rows) insert.run(...names.map((name) => row[name]));
    console.log(`Imported ${rows.length} row(s) from ${table}`);
  }
})();

source.close();
target.close();
console.log(`Legacy data imported into ${targetPath}. Update server/channel/role IDs with the Stoat setup commands before going live.`);
import { get, run } from "./database";

const translations: Record<string, Record<string, string>> = {
  fr: {
    language_changed: "🌐 Votre langue est maintenant **Français**.",
    level_up: "✨ {user} passe au niveau **{level}** !",
    daily_reward: "🎁 Tu as reçu **{amount}** pièces quotidiennes !",
    cooldown_wait: "⏳ Reviens dans **{time}**.",
    setup_complete: "⚙️ Configuration du serveur terminée.",
  },
  en: {
    language_changed: "🌐 Your language is now **English**.",
    level_up: "✨ {user} reached level **{level}**!",
    daily_reward: "🎁 You received **{amount}** daily coins!",
    cooldown_wait: "⏳ Come back in **{time}**.",
    setup_complete: "⚙️ Server setup completed.",
  },
};

export function getLanguage(userId: string): "fr" | "en" {
  const language = String(get("SELECT language FROM user_languages WHERE user_id = ?", userId)?.language ?? process.env.DEFAULT_LANGUAGE ?? "fr");
  return language === "en" ? "en" : "fr";
}

export function setLanguage(userId: string, language: string): "fr" | "en" {
  const safe = language.toLowerCase().startsWith("en") ? "en" : "fr";
  run(
    `INSERT INTO user_languages (user_id, language) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET language = excluded.language`,
    userId,
    safe,
  );
  return safe;
}

export function t(userId: string, key: string, values: Record<string, string | number> = {}): string {
  let text = translations[getLanguage(userId)]?.[key] ?? translations.fr[key] ?? key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

export function translateText(text: string, target: string): string {
  const dictionaries: Record<string, Record<string, string>> = {
    fr: { hello: "bonjour", welcome: "bienvenue", server: "serveur", staff: "équipe", ticket: "ticket", command: "commande", language: "langue" },
    en: { bonjour: "hello", bienvenue: "welcome", serveur: "server", équipe: "staff", ticket: "ticket", commande: "command", langue: "language" },
  };
  const map = dictionaries[target.toLowerCase()] ?? dictionaries.fr;
  return text
    .trim()
    .split(/\s+/)
    .map((word) => map[word.toLowerCase().replace(/[^\p{L}]/gu, "")] ?? word)
    .join(" ");
}
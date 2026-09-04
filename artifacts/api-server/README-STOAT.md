# CutyMowGang pour Stoat

Cette version remplace le runtime Discord par le SDK JavaScript officiel de
Stoat. Les commandes sont textuelles et utilisent par défaut le préfixe `!`.
Les boutons, menus et réponses éphémères Discord sont remplacés par des
réactions, des commandes et des messages dans le salon.

## Démarrage

1. Créer un bot dans Stoat et copier son token dans le secret
   `STOAT_BOT_TOKEN` (ne jamais le mettre dans Git ou dans un message).
2. Lancer `pnpm --filter @workspace/api-server run dev`, ou
   `bash artifacts/api-server/start-bot.sh`.
3. Vérifier `GET /api/healthz`. Le champ `bot.connected` doit passer à `true`.

`STOAT_API_URL` permet de remplacer l'URL API par défaut
`https://api.stoat.chat`. `BOT_PREFIX` change le préfixe, et
`BOT_DATABASE_PATH` change le fichier SQLite.

Sans token, le serveur de santé reste disponible mais le bot ne se connecte
pas : cela permet de valider l'installation sans exposer de secret.

## Commandes portées

- Administration : `module`, `setup`, `ticket-setup`, `modlogs`, `antilien`,
  `voice-setup`
- Économie : `balance`, `daily`, `work`, `pay`, `shop`, `add-shop`, `buy`,
  `slots`
- Jeux : `justeprix`, `poll`, `giveaway`, comptage automatique
- Niveaux : `rank`, `leaderboard`, XP par message et XP vocale
- Modération : `announce`, `ban`, `clear`, `kick`, `lock`, `mute`, `report`,
  `timeout`, `unban`, `unlock`, `unmute`, `warn`, `roleinfo`
- Utilitaires : `help`, `allfeatures`, `botinfo`, `commandes`, `language`,
  `ping`, `role-menu`, `serverinfo`, `set-counting`, `set-suggestions`,
  `staffcommands`, `suggest`, `test-welcome`, `ticket`, `translate`,
  `userinfo`

Exemples : `!help`, `!setup`, `!daily`, `!ticket support`, `!warn @membre
spam`, `!set-counting <channel_id>`.

## Migration de la base Discord

L'ancien fichier `json.sqlite` est compatible avec les tables principales.
Importer une copie avec :

```bash
pnpm --filter @workspace/api-server run import:legacy -- /chemin/json.sqlite
```

L'import ne remplace volontairement pas les identifiants Discord par des
identifiants Stoat : cette correspondance dépend de chaque serveur. Après
l'import, relancer `!setup`, `!set-counting`, `!set-suggestions`,
`!ticket-setup` et `!modlogs` sur les serveurs Stoat.

## Limite vocale Stoat

Le SDK expose les participants des salons Voice v2 mais ne fournit pas
l'ancien événement Discord `voiceStateUpdate`. Le bot surveille donc les
participants connus toutes les 15 secondes et crédite l'XP à leur sortie.
`!voice-setup <channel_id>` enregistre le salon vocal à surveiller. Si
l'installation Stoat utilise une version sans participants Voice v2, le reste
du bot continue de fonctionner et aucune fausse XP n'est accordée.
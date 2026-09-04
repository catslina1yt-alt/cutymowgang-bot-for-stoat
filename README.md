# CutyMowGang pour Stoat

Bot communautaire pour Stoat, avec commandes d'administration, moderation,
economie, jeux, niveaux et tickets. Le projet utilise TypeScript, pnpm,
Express et SQLite.

## Prerequis

- Node.js 24 ou version compatible
- pnpm 11
- Un bot Stoat et son token

## Installation

```bash
git clone https://github.com/catslina1yt-alt/cutymowgang-bot-for-stoat.git
cd cutymowgang-bot-for-stoat
pnpm install
```

## Configuration

Definissez le token du bot dans la variable d'environnement
`STOAT_BOT_TOKEN`. Ne publiez jamais ce token dans GitHub.

Variables facultatives :

- `PORT` : port HTTP, `8080` par defaut
- `STOAT_API_URL` : URL de l'API Stoat
- `BOT_PREFIX` : prefixe des commandes, `!` par defaut
- `BOT_DATABASE_PATH` : chemin de la base SQLite

## Lancer le bot

Sous PowerShell :

```powershell
$env:STOAT_BOT_TOKEN = "votre-token"
pnpm --filter @workspace/api-server run dev
```

Sous Linux ou macOS :

```bash
export STOAT_BOT_TOKEN="votre-token"
pnpm --filter @workspace/api-server run dev
```

Le serveur de sante est disponible sur `GET /api/healthz`.

## Commandes utiles

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server run import:legacy -- chemin/vers/json.sqlite
```

La liste detaillee des commandes Stoat et les informations de migration sont
disponibles dans [README-STOAT.md](artifacts/api-server/README-STOAT.md).

## Licence

MIT# cutymowgang-bot-for-stoat
un bot pour stoat 

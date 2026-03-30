# PlantCareTrackerV2

PlantCareTrackerV2 est une application de suivi d'entretien des plantes, pensée pour un usage maison en réseau local.

Le projet fonctionne avec :
- un serveur local sur PC ou Raspberry Pi
- une application web dans le navigateur
- une application Android via Capacitor
- un mode hors ligne avec file d'actions locale
- une identification IA optionnelle via OpenAI

## Ce Que Fait Le Projet

Fonctionnalités principales :
- liste des plantes actives et archivées
- fiches plante avec photo, notes, emplacement et historiques
- arrosage et fertilisation rapides
- planning mensuel d'arrosage et de fertilisation
- gestion des emplacements
- fonctionnement hors ligne avec synchronisation au retour du réseau
- photos des plantes disponibles hors ligne
- mise à jour inter-devices plus réactive via flux de changements serveur
- interface web et Android à partir du même frontend
- identification IA d'une plante à partir d'une photo

Ce MVP ne comprend pas :
- login
- comptes utilisateurs
- partage multi-utilisateur avec permissions
- cloud public

## Stack

| Couche | Technologie |
|---|---|
| Backend | Fastify + TypeScript |
| Base de données | SQLite + Prisma |
| Frontend | React 18 + Vite |
| Stockage offline | Dexie / IndexedDB |
| Sync | file locale + bootstrap + deltas + SSE |
| Mobile Android | Capacitor |
| IA | OpenAI via backend |
| Monorepo | pnpm workspaces |

## Architecture En Bref

- Le serveur API écoute par défaut sur `http://<ip-du-serveur>:3000`
- Le backend sert aussi les fichiers du frontend buildé
- Les photos sont stockées dans `apps/api/uploads`
- Les données serveur sont stockées en SQLite
- Chaque client garde une copie locale des plantes, emplacements, historiques et photos
- En offline, les actions sont placées dans une file locale puis rejouées au retour du serveur
- Quand un appareil modifie une plante, les autres clients récupèrent ensuite le changement via le flux de deltas

## Structure Du Repo

```text
.
├── apps
│   ├── api
│   │   ├── prisma
│   │   │   ├── schema.prisma
│   │   │   └── migrations
│   │   ├── scripts
│   │   ├── src
│   │   │   ├── plugins
│   │   │   ├── routes
│   │   │   ├── test
│   │   │   ├── utils
│   │   │   └── server.ts
│   │   └── uploads
│   └── web
│       ├── android
│       ├── public
│       ├── src
│       └── capacitor.config.ts
├── backup_V1
└── packages
    └── shared
```

## Prérequis

Minimum :
- Node.js 20+
- pnpm

Pour Android :
- Android Studio
- Java 17
- SDK Android installé

Installation de `pnpm` si besoin :

```bash
npm install -g pnpm
```

## Installation Développeur

Depuis la racine du repo :

```bash
pnpm install
pnpm --filter api db:generate
```

## Variables D'Environnement

Fichier conseillé : `apps/api/.env`

Exemple :

```env
DATABASE_URL="file:./dev.db"
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
UPLOAD_DIR=./uploads
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0
```

Variables utiles :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | chemin SQLite |
| `PORT` | port de l'API |
| `HOST` | hôte réseau, garder `0.0.0.0` pour accès depuis téléphone |
| `UPLOAD_DIR` | dossier des images |
| `OPENAI_API_KEY` | nécessaire pour l'identification IA |
| `OPENAI_MODEL` | modèle OpenAI utilisé |
| `OPENAI_TEMPERATURE` | température du modèle |

Note :
- `JWT_SECRET`, `CORS_ORIGIN` et les variables push existent encore dans l'exemple historique, mais ne sont pas centrales pour le MVP actuel

## Démarrage En Développement

Lancer tout le projet :

```bash
pnpm dev
```

Ou séparément :

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Accès :
- frontend dev : `http://localhost:5173`
- API : `http://localhost:3000`
- healthcheck : `http://localhost:3000/api/health`

## Build

Build complet :

```bash
pnpm build
```

Build backend seulement :

```bash
pnpm --filter api build
```

Build frontend seulement :

```bash
pnpm --filter web build
```

## Tests

Tout :

```bash
pnpm test
```

API :

```bash
pnpm --filter api test
```

Web :

```bash
pnpm --filter web test
```

## Guide Débutant: Mettre En Place Le Serveur Et L'App

Cette section est pensée pour quelqu'un qui veut simplement faire marcher le projet chez lui.

### 1. Préparer Le Serveur

Le serveur peut tourner :
- sur ton PC
- ou sur un Raspberry Pi

Le plus simple pour commencer est de le lancer sur ton PC.

### 2. Installer Les Dépendances

Dans le dossier du projet :

```bash
pnpm install
pnpm --filter api db:generate
```

### 3. Créer Le Fichier `.env`

Dans `apps/api/.env`, mets au minimum :

```env
DATABASE_URL="file:./dev.db"
PORT=3000
HOST=0.0.0.0
UPLOAD_DIR=./uploads
OPENAI_API_KEY=ta-cle-openai-si-tu-veux-l-ia
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0
```

Si tu ne veux pas utiliser l'identification IA tout de suite, laisse `OPENAI_API_KEY` vide.

### 4. Appliquer La Base De Données

Depuis la racine du projet :

```bash
pnpm --filter api db:migrate
```

Si tu as déjà une base existante et que tu viens de mettre à jour le projet, cette étape est importante pour appliquer les nouvelles migrations.

### 5. Lancer Le Serveur

Pour le développement :

```bash
pnpm --filter api dev
```

Ou en version buildée :

```bash
pnpm --filter api build
cd apps/api
node dist/server.js
```

### 6. Vérifier Que Le Serveur Répond

Sur l'ordinateur qui héberge le serveur :

```bash
curl http://127.0.0.1:3000/api/health
```

Tu dois obtenir une réponse JSON avec `ok: true`.

### 7. Trouver L'IP Du Serveur

Sur Linux :

```bash
hostname -I
```

Tu verras une IP du style :

```text
192.168.1.123
```

C'est cette IP qu'il faudra utiliser depuis le téléphone.

### 8. Tester Depuis Le Téléphone

Le téléphone doit être sur le même Wi-Fi que le serveur.

Dans le navigateur du téléphone, ouvre :

```text
http://192.168.1.123:3000/api/health
```

En remplaçant `192.168.1.123` par la vraie IP du serveur.

Si ça ne marche pas :
- vérifie que le téléphone et le serveur sont sur le même réseau Wi-Fi
- évite les réseaux invités
- vérifie que `HOST=0.0.0.0`
- vérifie que le serveur est bien lancé

### 9. Utiliser L'App Web

Une fois le frontend buildé, le backend sert aussi l'application.

Depuis le téléphone ou un autre appareil :

```text
http://192.168.1.123:3000
```

Au premier lancement, l'app utilise l'IP par défaut configurée. Si besoin, tu peux la modifier ensuite dans `Réglages`.

### 10. Installer L'App Android

Depuis la racine :

```bash
pnpm --filter web android:sync
```

Puis :

```bash
pnpm --filter web android:open
```

Dans Android Studio :
- branche le téléphone en USB
- active le débogage USB
- lance l'app avec `Run`

Ou génère un APK avec Gradle depuis `apps/web/android`.

### 11. Configurer L'App Android

Dans l'app :
- ouvre `Réglages`
- vérifie l'IP du serveur
- garde le port `3000` sauf si tu l'as changé

Quand tout est correct :
- le bandeau doit afficher `En ligne`
- une resync doit fonctionner rapidement

## Déploiement Sur Raspberry Pi

### Préparer Le Pi

Installer Node.js 20 et pnpm.

Exemple :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm
```

### Installer Le Projet

```bash
git clone <repo-url> /home/pi/PlantCareTrackerV2
cd /home/pi/PlantCareTrackerV2
pnpm install
pnpm --filter api db:generate
```

Créer `apps/api/.env`, puis :

```bash
pnpm --filter api db:migrate
pnpm --filter web build
pnpm --filter api build
```

### Démarrer En Production

```bash
cd apps/api
NODE_ENV=production node dist/server.js
```

Le serveur sera alors accessible sur :

```text
http://<ip-du-pi>:3000
```

### Démarrage Automatique Avec systemd

Exemple de service :

```ini
[Unit]
Description=PlantCareTrackerV2
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/PlantCareTrackerV2/apps/api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/home/pi/PlantCareTrackerV2/apps/api/.env

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable plantcare
sudo systemctl start plantcare
sudo systemctl status plantcare
```

## Import Des Données V1

Le dossier `backup_V1` peut contenir :
- `plants.json`
- `locations.json`
- `lastClickedTimes.json`

Les photos V1 peuvent être présentes dans `apps/api/uploads`.

Le script d'import est dans :
- `apps/api/scripts/import-v1.mjs`

Après import, pense à relancer une resynchronisation complète côté client.

## Fonctionnement Hors Ligne

Le client garde en local :
- plantes
- emplacements
- historique des soins
- photos
- file d'actions en attente

Exemples d'actions possibles hors ligne :
- créer une plante
- modifier une plante
- supprimer une plante
- créer un emplacement
- enregistrer un arrosage
- enregistrer une fertilisation
- charger une photo

Au retour du réseau :
- la file locale est rejouée
- les IDs temporaires sont remappés
- les autres appareils peuvent ensuite récupérer les changements via le flux serveur

## Synchronisation Entre Devices

Le projet utilise maintenant :
- une file d'actions locale pour les mutations offline
- un endpoint de bootstrap
- un endpoint de deltas `/api/changes`
- un flux SSE `/api/events`

But :
- éviter un rechargement complet permanent
- garder les appareils plus proches de l'état serveur
- conserver un comportement solide en offline

## Commandes Utiles

Depuis la racine :

```bash
pnpm dev
pnpm build
pnpm test
pnpm --filter api db:migrate
pnpm --filter api db:generate
pnpm --filter api test
pnpm --filter web test
pnpm --filter web android:sync
pnpm --filter web android:open
```

## Dépannage Rapide

### Le téléphone ne voit pas le serveur

Vérifie :
- même réseau Wi-Fi
- pas de réseau invité
- bonne IP
- serveur lancé
- `HOST=0.0.0.0`

Test :

```text
http://<ip-du-serveur>:3000/api/health
```

### L'app reste hors ligne

Vérifie :
- que `/api/health` répond depuis le téléphone
- l'IP configurée dans `Réglages`
- que le port est bien `3000`

### Les changements d'un autre appareil n'apparaissent pas

Vérifie :
- que le backend est à jour avec les dernières migrations
- que le serveur a bien été redémarré après mise à jour
- que les clients sont en ligne

### L'identification IA échoue

Vérifie :
- `OPENAI_API_KEY`
- accès Internet depuis le serveur
- présence d'une photo exploitable pour la plante

## Notes

- Le frontend Android autorise le HTTP local pour simplifier l'usage en réseau domestique
- L'app Android s'appelle `PlantCareTrackerV2`
- Le logo utilisé par l'app vient de `apps/api/uploads/placeholder.png`

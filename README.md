# 🌱 PlantCare Tracker v2

Application web PWA pour suivre l'entretien de vos plantes — arrosage, fertilisation, rempotage et plus encore.

## Stack

| Couche | Technologie |
|---|---|
| Backend | Fastify + TypeScript + Prisma |
| Base de données | SQLite (via Prisma) |
| Frontend | React 18 + Vite + TailwindCSS |
| State serveur | TanStack React Query v5 |
| State global | Zustand |
| Offline | Dexie.js (IndexedDB) + Background Sync |
| Auth | JWT (access token 15min + refresh token 30j, httpOnly cookies) |
| Mobile | PWA (Workbox) + Capacitor (Android) |
| Charts | Recharts |
| Monorepo | pnpm workspaces |

---

## Prérequis

- **Node.js 20+**
- **pnpm** : `npm install -g pnpm`

---

## Installation

```bash
# Cloner le repo
git clone <repo-url>
cd plantcaretracker

# Installer toutes les dépendances
pnpm install

# Configurer le backend
cd apps/api
cp .env.example .env
# Éditer .env si nécessaire (JWT_SECRET surtout !)

# Créer la base de données et lancer les migrations
pnpm db:migrate

# Insérer des données de démonstration (optionnel)
pnpm db:seed

# Revenir à la racine
cd ../..
```

---

## Démarrage en développement

```bash
# Lance l'API (port 3000) et le frontend (port 5173) en parallèle
pnpm dev
```

Accès :
- Frontend : http://localhost:5173
- API : http://localhost:3000
- Admin DB : `pnpm db:studio`

Compte de démo (après seed) : `alice@example.com` / `password123`

---

## Déploiement sur Raspberry Pi

### 1. Préparer le Pi

```bash
# Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installer pnpm
npm install -g pnpm
```

### 2. Déployer

```bash
# Sur le Pi
git clone <repo-url> /home/pi/plantcaretracker
cd /home/pi/plantcaretracker
pnpm install

# Configurer
cd apps/api
cp .env.example .env
nano .env  # Changer JWT_SECRET et DATABASE_URL

# Migrations
pnpm db:migrate

# Build du frontend
cd ../web
pnpm build

# Revenir à la racine
cd ../..
```

### 3. Serveur de production

Le backend Fastify sert à la fois l'API et le frontend compilé (dossier `apps/web/dist`).

```bash
# Build de production
cd apps/api
pnpm build

# Démarrer
NODE_ENV=production node dist/server.js
```

### 4. Auto-start avec systemd

```bash
sudo nano /etc/systemd/system/plantcare.service
```

```ini
[Unit]
Description=PlantCare Tracker
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/plantcaretracker/apps/api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/home/pi/plantcaretracker/apps/api/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable plantcare
sudo systemctl start plantcare

# Vérifier
sudo systemctl status plantcare
journalctl -u plantcare -f
```

L'app sera accessible sur le réseau local : `http://<ip-du-pi>:3000`

---

## Variables d'environnement (apps/api/.env)

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | Chemin SQLite | `file:./dev.db` |
| `PORT` | Port du serveur | `3000` |
| `JWT_SECRET` | Clé secrète JWT — **à changer !** | `change-me` |
| `CORS_ORIGIN` | Origine du frontend | `http://localhost:5173` |
| `UPLOAD_DIR` | Dossier des photos | `./uploads` |
| `OPENAI_API_KEY` | Clé API OpenAI (optionnel) | — |
| `OPENAI_MODEL` | Modèle OpenAI | `gpt-4o-mini` |
| `VAPID_PUBLIC_KEY` | Clé publique Web Push (optionnel) | — |
| `VAPID_PRIVATE_KEY` | Clé privée Web Push | — |
| `VAPID_EMAIL` | Email pour Web Push | — |

### Générer les clés VAPID (notifications push)

```bash
npx web-push generate-vapid-keys
```

---

## Fonctionnalités

### Core
- ✅ CRUD plantes avec photo (resize auto 800×800)
- ✅ Suivi arrosage, fertilisation, rempotage, taille, traitement
- ✅ Alertes visuelles (rouge si délai dépassé)
- ✅ Undo de la dernière action
- ✅ Notes par action de soin
- ✅ Historique complet des soins

### Multi-user
- ✅ Inscription / connexion (JWT + refresh token)
- ✅ Jardins partagés avec rôles (Owner / Editor / Viewer)
- ✅ Invitation de membres par email

### Offline
- ✅ Toutes les actions fonctionnent hors ligne (IndexedDB)
- ✅ Sync automatique au retour de la connexion
- ✅ Indicateur d'état et compteur d'actions en attente

### Vues
- ✅ Liste avec filtres (actives / archivées, recherche)
- ✅ Calendrier mensuel des soins
- ✅ Statistiques (score d'assiduité, intervalles moyens, graphiques)
- ✅ Mode sombre

### Mobile
- ✅ PWA installable (manifest + service worker)
- ✅ Notifications push (Web Push API)

### IA
- ✅ Identification de plante via OpenAI Vision
- ✅ Auto-renommage si nom par défaut

---

## Structure du projet

```
plantcaretracker/
├── apps/
│   ├── api/                    # Backend Fastify + TypeScript
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Modèle de données
│   │   │   └── seed.ts         # Données de démo
│   │   └── src/
│   │       ├── plugins/        # Prisma + Auth (JWT)
│   │       ├── routes/         # auth, gardens, plants, locations, care, identify, push
│   │       ├── utils/          # images.ts (resize Sharp)
│   │       └── server.ts       # Entrypoint
│   └── web/                    # Frontend React + Vite
│       └── src/
│           ├── components/     # Layout, PlantCard, IdentifyModal, InviteModal
│           ├── hooks/          # usePlants, useCare, useGarden, useOfflineSync
│           ├── lib/            # api.ts, db.ts (Dexie), sync.ts, notifications.ts
│           ├── pages/          # Login, Register, Home, PlantDetail, PlantForm, Calendar, Stats, Settings
│           └── stores/         # auth.ts (Zustand), offline.ts
└── packages/
    └── shared/
        └── src/types.ts        # Types TypeScript partagés frontend/backend
```

---

## Tests

```bash
# Backend
cd apps/api && pnpm test
```

---

## Notifications push — cron

Pour envoyer les rappels d'arrosage chaque matin :

```bash
# Ajouter au crontab
0 8 * * * curl -X POST http://localhost:3000/api/push/send-reminders \
  -H "Authorization: Bearer <token>"
```

Ou créer un endpoint dédié sans auth pour le cron local (recommandé pour Pi).

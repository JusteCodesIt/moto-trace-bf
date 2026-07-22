# AutoTrack — Migration architecture : Cloudflare Workers → Self-host Node.js

> **Portée** : ce document couvre tous les changements d'infrastructure opérés entre la version initiale
> hébergée sur Cloudflare Workers et la version actuelle auto-hébergée sur un serveur Windows local
> exposé via Tailscale Funnel. Il ne porte pas sur les évolutions fonctionnelles de l'application
> (v3.0 → v3.2 : maintenance, GPX, PWA, i18n, etc.).

---

## 1. Vue d'ensemble

| Dimension | Avant (Cloudflare Workers) | Après (Self-host Node.js) |
|---|---|---|
| **Runtime** | V8 isolate — edge Cloudflare | Node.js 22.16.0 — serveur local |
| **Processus** | Stateless, géré par CF | PM2 (`ecosystem.config.cjs`) |
| **Ingress public** | Réseau CDN Cloudflare | Tailscale Funnel (HTTPS sans ouverture de port) |
| **Accès dashboard** | Public (URL secrète) | VPN-only (Tailscale + header `Tailscale-User-Login`) |
| **Build** | `vite build && wrangler deploy` | `npm run build` → `.output/server/index.mjs` |
| **Secrets** | `wrangler.jsonc vars` + `wrangler secret` | Fichier `.env` chargé par `--env-file` |
| **Coût hébergement** | Facturation Cloudflare Workers | Zéro (machine propre) |
| **URL publique** | `autotrack.codinghub.workers.dev` | `juste-blackops.tail733922.ts.net` |

---

## 2. Avant — Architecture Cloudflare Workers

### 2.1 Modèle d'exécution

L'application tournait en tant que **Cloudflare Worker** : du code JavaScript exécuté dans des
isolates V8 à l'edge, sans processus long et sans accès au système de fichiers. Chaque requête
HTTP démarrait un isolate froid ou réutilisait un chaud, mais il n'y avait pas d'état persistant
en mémoire entre requêtes.

```
Internet ──► Cloudflare CDN (réseau global)
                 │
                 ▼
           V8 Worker isolate
           (src/server.ts)
                 │
                 ▼
           Supabase (base de données cloud)
```

### 2.2 Build et déploiement

```
vite build          →  dist/client/   (assets statiques)
                       dist/server/server.js  (worker bundle)
wrangler deploy     →  Cloudflare Workers
```

Le plugin `@cloudflare/vite-plugin` adaptait le build TanStack Start pour produire un bundle
compatible avec l'environnement V8 de Cloudflare (pas de Node.js APIs).

Le fichier `wrangler.jsonc` déclarait :
- `name: "autotrack"` / `account_id`
- `main: "dist/server/server.js"`
- `assets.directory: "dist/client"` (sert automatiquement les fichiers statiques)
- `vars` : variables d'environnement non-secrètes (URL Supabase, clé publique anon)

### 2.3 Secrets et variables d'environnement

Les variables publiques (URL Supabase, clé anon) étaient déclarées en clair dans `wrangler.jsonc`.
Les secrets sensibles (clé service-role, HMAC master key) étaient injectés via `wrangler secret put`
et stockés dans l'infrastructure Cloudflare — jamais dans le dépôt.

### 2.4 Sécurité d'accès

Il n'existait **aucune couche d'authentification au niveau du serveur** pour le dashboard.
La « sécurité » reposait sur l'obscurité du sous-domaine (`*.workers.dev`). N'importe qui
connaissant l'URL pouvait accéder à la page de connexion.

### 2.5 Problème HTTP pour le firmware SIM800L

Cloudflare force systématiquement HTTPS sur `*.workers.dev` (redirection 301). Le firmware
ESP32 + SIM800L (pas de TLS natif) ne pouvait donc pas poster en HTTP brut. Le contournement
prévu (commenté dans `wrangler.jsonc`) nécessitait un domaine custom avec Cloudflare et la
désactivation de "Always Use HTTPS" sur ce domaine — jamais mis en production.

---

## 3. Après — Architecture Self-host Node.js

### 3.1 Modèle d'exécution

L'application tourne maintenant comme un **processus Node.js classique**, long-running, sur le
serveur Windows local. Nitro (bundler de TanStack Start) est configuré avec le preset `node-server`
et produit un exécutable autonome.

```
Internet
   │
   ▼
Tailscale Funnel (HTTPS, sans NAT)
   │
   │  [header Tailscale-User-Login absent]        [header présent]
   │         │                                           │
   ▼         ▼                                           ▼
/api/public/* → 200              /dashboard, /*, ... → passé au handler
(ingest ESP32)                   uniquement via VPN Tailscale
   │
   ▼
Node.js 22 — PM2 "autotrack"
PORT=3000, HOST=0.0.0.0
.output/server/index.mjs
   │
   ▼
Supabase (base de données cloud)
```

### 3.2 Build et déploiement

```
npm run build       →  .output/server/index.mjs  (serveur Node.js autonome)
                        .output/public/           (assets statiques servis par Nitro)
pm2 restart autotrack --update-env
```

Plus de `wrangler deploy`. Le build produit un fichier `.mjs` que Node.js 22 exécute
directement. Nitro gère lui-même le service des fichiers statiques depuis `.output/public/`.

### 3.3 Gestion du processus : PM2

PM2 remplace la gestion automatique de Cloudflare. Il assure :
- **Redémarrage automatique** en cas de crash
- **Démarrage au boot** via `pm2 startup` + `pm2 save`
- **Logs persistants** (`pm2 logs autotrack`)
- **Reload sans downtime** (`pm2 reload autotrack`)

Configuration dans [`ecosystem.config.cjs`](../ecosystem.config.cjs) :

```js
{
  name: "autotrack",
  script: ".output/server/index.mjs",
  interpreter: "node",
  interpreter_args: "--env-file=<APP_DIR>/.env",
  env: {
    NODE_ENV: "production",
    PORT: "3000",
    HOST: "0.0.0.0",   // écoute sur toutes les interfaces (pas seulement 127.0.0.1)
  },
}
```

`HOST: "0.0.0.0"` est critique : sans lui, le serveur n'écoute que sur `localhost` et Tailscale
ne peut pas router les requêtes entrant par l'interface réseau virtuelle.

### 3.4 Exposition réseau : Tailscale Funnel

Tailscale Funnel expose le port 3000 en HTTPS public **sans ouvrir de port sur le routeur**
et sans VPS. Cela résout le problème CGNAT (opérateurs mobiles, box 4G) qui empêchent
le port forwarding classique.

```
Firmware ESP32
     │
     │ HTTPS POST /api/public/ingest
     ▼
juste-blackops.tail733922.ts.net  (Tailscale infrastructure)
     │
     │ TCP forward → 127.0.0.1:3000
     ▼
Node.js local
```

Le Funnel injecte l'en-tête `Tailscale-User-Login` pour les requêtes provenant de pairs
VPN authentifiés (tes appareils). Les requêtes Internet publiques n'ont pas cet en-tête.

Démarrage du Funnel (idempotent, survit aux redémarrages) :

```bat
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3000
```

### 3.5 Sécurité d'accès : `publicAccessGuard`

Le changement de sécurité le plus significatif. La fonction `publicAccessGuard` dans
[`src/server.ts`](../src/server.ts) constitue une **couche d'authentification réseau**
avant même que TanStack Start ne traite la requête :

```
Requête entrante
       │
       ▼
publicAccessGuard()
       │
       ├─ NODE_ENV !== "production" → null (dev local non bloqué)
       │
       ├─ header Tailscale-User-Login présent → null (pair VPN → accès total)
       │
       ├─ path /api/public/* → null (ingest/share → public autorisé)
       │
       └─ sinon → Response 403 { "error": "forbidden" }
                  (Internet public ne voit jamais le dashboard)
```

Cette garde s'applique **en amont du routeur** de l'application. Même si un attaquant
connaît l'URL, il obtient 403 — le code React ne s'exécute jamais côté serveur.

En dev (`NODE_ENV !== "production"`), la garde est neutralisée pour permettre le
développement local sans Tailscale.

### 3.6 Headers de sécurité HTTP

`withSecurityHeaders()` ajoute les headers suivants à chaque réponse (incluant les 403) :

| Header | Valeur |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self), payment=()` |
| `Content-Security-Policy` | fonts Google, CartoDB tiles, Supabase WSS, nominatim |

### 3.7 Secrets et variables d'environnement

Les secrets sont maintenant dans un fichier `.env` local (jamais commité, listé dans
`.gitignore`). Node.js les charge via le flag natif `--env-file` (Node 22+), sans
dépendance à `dotenv`.

Variables requises :

```env
NODE_ENV=production
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # clé privée — jamais dans wrangler.jsonc
HMAC_MASTER_KEY=...
VITE_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Contrairement à l'époque Cloudflare, la clé service-role n'est **plus séparée** dans un
système tiers (Wrangler secrets) — elle est dans `.env` au même titre que les autres.
Cela simplifie la gestion mais impose une discipline stricte sur la protection du fichier.

### 3.8 Démarrage automatique Windows

Le fichier [`scripts/start-autotrack.bat`](../scripts/start-autotrack.bat) est placé dans
le dossier **Démarrage Windows** (`shell:startup`) pour s'exécuter à chaque connexion :

```bat
pm2 resurrect           ← restaure la liste des apps sauvegardées
pm2 start ecosystem.config.cjs
pm2 save                ← persiste l'état pour le prochain resurrect
tailscale funnel --bg 3000
```

L'ordre est important : `resurrect` avant `start` (évite les doublons), `save` après
`start` (capture le nouvel état).

---

## 4. Changements de build en détail

### 4.1 Preset Nitro

Le paramètre qui commande tout le reste. Dans `vite.config.ts`, via `@lovable.dev/vite-tanstack-config`,
le preset est passé de `cloudflare-module` (V8 Cloudflare) à `node-server` (Node.js standard).

| | Cloudflare | Node.js |
|---|---|---|
| **Preset Nitro** | `cloudflare-module` | `node-server` |
| **Output** | `dist/server/server.js` | `.output/server/index.mjs` |
| **APIs disponibles** | V8 (pas de `fs`, `crypto` natif Node) | Node.js complet (`crypto`, `fs`, etc.) |
| **Exécution** | `wrangler deploy` | `node .output/server/index.mjs` |

### 4.2 API Node.js maintenant disponibles

En passant au runtime Node.js, on gagne l'accès aux APIs Node.js natives dans le code serveur.
L'endpoint `/api/public/ingest` utilise notamment :

```ts
import { createHmac, timingSafeEqual } from "crypto"; // Node.js natif
```

Ces imports auraient nécessité une polyfill Cloudflare ou `nodejs_compat` flag.
En Node.js, ils fonctionnent sans configuration supplémentaire.

### 4.3 Package manager

| | Avant | Après |
|---|---|---|
| **Package manager** | Bun (Dockerfile `oven/bun:1.2`) | npm / Node 22 |
| **Lock file** | `bun.lock` | `package-lock.json` |

Le passage à npm s'est fait naturellement avec l'environnement Windows (Node 22 via nvm).
Le Dockerfile reste présent dans le dépôt (pour un usage dev éventuel) mais n'est plus
utilisé en production.

---

## 5. Accès au dashboard depuis différents points

### 5.1 Depuis un pair Tailscale (téléphone, PC)

```
https://juste-blackops.tail733922.ts.net
  │
  ▼
Tailscale injecte Tailscale-User-Login: <ton-email>
  │
  ▼
publicAccessGuard → null (accès accordé)
  │
  ▼
Dashboard complet
```

**Important** : utiliser l'URL HTTPS Tailscale, pas l'IP `100.x.x.x:3000`. L'IP directe
bypass le proxy Tailscale et n'injecte pas le header → 403.

### 5.2 Depuis le réseau local (développement)

```
http://localhost:3000  ou  http://127.0.0.1:3000
  │
  ▼
publicAccessGuard → NODE_ENV !== "production" → null
  │
  ▼
Dashboard complet (mode dev)
```

### 5.3 Firmware ESP32 / Internet public

```
HTTPS POST https://juste-blackops.tail733922.ts.net/api/public/ingest
  │
  ▼
publicAccessGuard → path /api/public/* → null
  │
  ▼
Endpoint ingest → 200 OK
```

---

## 6. Ce qui n'a pas changé

- **Supabase** : base de données et Edge Functions restent sur Supabase cloud (inchangé)
- **Schéma de données** : aucune migration liée à l'hébergement
- **Code applicatif** : routes, composants, logique métier identiques
- **HMAC sur l'ingest** : même schéma de vérification (x-device-id, x-signature)
- **Rate limiting** : même logique en mémoire dans `src/lib/rate-limiter.ts`
- **CSP** : adapté pour inclure CartoDB Voyager (v3.2), sinon identique dans l'esprit

---

## 7. Compromis et points de vigilance

### 7.1 Single point of failure

Sur Cloudflare, l'infrastructure était globalement redondante. Ici, si le PC s'éteint,
l'application est inaccessible. PM2 redémarre les crashs applicatifs mais ne peut pas
redémarrer la machine.

**Mitigation** : le firmware ESP32 a un buffer local (NVS) et retente l'envoi. Les données
ne sont pas perdues en cas d'indisponibilité temporaire.

### 7.2 Protection du fichier `.env`

La clé service-role Supabase est dans `.env` sur disque. Elle était auparavant stockée
dans l'infrastructure Cloudflare (chiffrée à l'atelier). Vérifier régulièrement que
`.env` n'apparaît pas dans `git status`.

### 7.3 Renouvellement des certificats Tailscale

Tailscale gère les certificats TLS automatiquement. Ils se renouvellent sans intervention
manuelle, contrairement à un setup Nginx + Let's Encrypt.

### 7.4 Redéploiement

La commande de déploiement n'est plus un one-liner `wrangler deploy` mais une séquence :

```bash
git pull                              # optionnel
npm run build
pm2 restart autotrack --update-env
```

---

## 8. Récapitulatif des fichiers ajoutés ou modifiés

| Fichier | Rôle |
|---|---|
| `ecosystem.config.cjs` | Config PM2 (script, env, host, port) |
| `scripts/start-autotrack.bat` | Script démarrage Windows (PM2 + Funnel) |
| `src/server.ts` | Ajout de `publicAccessGuard` + `withSecurityHeaders` |
| `wrangler.jsonc` | Mis à jour (main pointe sur `dist/server/server.js`, plus `account_id`) |
| `.env` | Fichier secrets local (gitignored) |
| `.gitignore` | `.env` listé explicitement |

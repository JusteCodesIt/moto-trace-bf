# Migration vers projet Supabase personnel — Contournement organisation Lovable

> **Objectif** : sortir AutoTrack de l'organisation Lovable qui restreint
> votre PAT personnel et le MCP Supabase, tout en préservant l'intégralité
> des données, schéma, Edge Functions, secrets et abonnements push.

## 1. Contexte du blocage

Le projet Supabase actuel `ayywtogmjlkrauluurse` appartient à l'organisation
Lovable, créée automatiquement lorsque vous avez initialisé le projet via
[lovable.dev](https://lovable.dev). Cette appartenance organisationnelle
entraîne trois limitations bloquantes :

1. **API Management restreinte** : votre PAT personnel
   (`sbp_b386c09a6dfaf35bd2f9cf4c65a0c2fe6451d6af`) reçoit un HTTP 403 sur
   les endpoints `/v1/projects/{ref}/secrets`, `/v1/projects/{ref}/functions`
   et `/v1/projects/{ref}/database/migrations`.
2. **MCP Supabase bloqué** : le serveur MCP Supabase de votre installation
   Claude Code retourne `MCP error -32600: You do not have permission`
   sur `apply_migration`, `deploy_edge_function`, `execute_sql`.
3. **Dépendance opérationnelle** : toute évolution serveur (migration,
   Edge Function, secret VAPID) doit transiter par l'assistant Lovable,
   imposant des cycles d'attente externes.

La seule solution pérenne consiste à **recréer le projet dans votre
organisation personnelle** où vos jetons ont les droits propriétaire.

## 2. Préparation (15 minutes)

### 2.1 Créer un compte Supabase indépendant si nécessaire

Si votre compte actuel `ibrayago06@gmail.com` est lié uniquement à l'organisation
Lovable, créez ou utilisez votre organisation personnelle :

1. Connectez-vous sur [supabase.com/dashboard](https://supabase.com/dashboard).
2. En haut à gauche, cliquez sur le sélecteur d'organisation.
3. Si vous voyez uniquement « Lovable » : cliquez **New organization**,
   nommez-la « Faso Mêbo » ou « Yago Personal », sélectionnez le **Free Plan**.

### 2.2 Créer le nouveau projet AutoTrack

Toujours dans l'organisation personnelle :

1. **New project**.
2. **Name** : `autotrack-faso-mebo`.
3. **Database password** : générer une chaîne forte (au moins 32 caractères),
   la stocker dans votre coffre-fort.
4. **Region** : Frankfurt (`eu-central-1`) — le plus proche du Burkina Faso
   parmi les régions disponibles, environ 145 ms de latence depuis Ouagadougou
   (mesure empirique janvier 2026).
5. **Plan** : Free (suffisant pour 30 engins en pilote, passage Pro à 25 USD/mois
   à partir de 100 engins ou si la limite de 500 Mo de DB est atteinte).
6. Attendez 2 à 3 minutes que le projet soit provisionné.

### 2.3 Récupérer les identifiants du nouveau projet

Dans le dashboard du nouveau projet, **Project Settings → API** :

- `Project URL` : `https://<NEW_REF>.supabase.co`
- `anon public key` : `eyJh...`
- `service_role key` : `eyJh...` (secrète)

## 3. Export et import des données existantes (30 minutes)

### 3.1 Export du schéma (anciennes migrations)

Toutes les migrations sont déjà versionnées dans le repo Git
`moto-trace-bf` sous `supabase/migrations/`. Pas d'export schema nécessaire :
les nouvelles instances appliqueront les migrations dans l'ordre chronologique.

### 3.2 Export des données utilisateur (si nécessaire)

Si vous avez déjà des comptes utilisateur, des engins enregistrés ou des
trames télémétrie sur le projet Lovable que vous voulez conserver :

1. Dashboard Lovable → **Database → Backups** → générer un backup SQL.
2. Téléchargez le `.sql` (en SQL Editor) ou utilisez la CLI :
   ```bash
   supabase db dump --db-url postgresql://postgres:[PASSWORD]@db.ayywtogmjlkrauluurse.supabase.co:5432/postgres \
     --data-only \
     -f autotrack_data_export.sql
   ```
3. Cet export contient toutes les tables `public.*` avec leurs données.

> **Recommandation** : si votre projet pilote a moins de 1 000 trames, partez
> sur une base vide. Les anciennes données peuvent être réimportées plus tard
> au cas par cas si nécessaire.

## 4. Provisionnement du nouveau projet (45 minutes)

### 4.1 Configurer votre nouveau PAT personnel

Dans le **nouveau** projet (dans votre organisation personnelle) :

1. **Settings → Access Tokens** → **Generate new token**.
2. Nom : `autotrack-cli-yago`.
3. Copiez le token (commence par `sbp_…`). Stockez-le dans votre coffre.

Définissez-le comme variable d'environnement sur votre poste :
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_<votre_nouveau_token>"
```

### 4.2 Lier le repo Git au nouveau projet (Supabase CLI)

```bash
cd C:\Users\dell\Downloads\Files_AutoTrack_Firmware\_push2
# Installer la CLI si nécessaire
npm install -g supabase
# Login (utilise SUPABASE_ACCESS_TOKEN)
supabase login
# Lier le repo au nouveau projet
supabase link --project-ref <NEW_REF>
# Vous sera demandé le password DB du nouveau projet
```

### 4.3 Appliquer toutes les migrations

```bash
# Pousse toutes les migrations supabase/migrations/*.sql dans l'ordre
supabase db push
```

Cette commande applique automatiquement :
- `000001_security_phase1.sql` (audit_logs)
- `000002_fleet_scale.sql` (device_positions + get_fleet_positions)
- `000003_vehicle_types.sql` (FM-XXX-NNN sequences)
- `000004_push_subscriptions.sql` (Web Push VAPID)
- `000005_v3_extensions.sql` (J1939 + IMU + geofence_states + maintenance_reminders)
- `000006_v31_drivers_webhooks_graphql.sql` (engine_scores + webhooks + pg_graphql + data_subject_requests)

### 4.4 Déployer les Edge Functions

```bash
supabase functions deploy send-push                       --no-verify-jwt
supabase functions deploy daily-maintenance-reminders     --no-verify-jwt
supabase functions deploy anomaly-detector                --no-verify-jwt
supabase functions deploy engine-score                    --no-verify-jwt
supabase functions deploy webhooks-dispatch               --no-verify-jwt
supabase functions deploy rotate-hmac-keys                --no-verify-jwt
supabase functions deploy fleet-ws
```

### 4.5 Configurer les secrets

```bash
# Générer une nouvelle paire VAPID (rotation de sécurité recommandée)
npx web-push generate-vapid-keys
# Récupérer Public_Key et Private_Key

supabase secrets set \
  VAPID_PUBLIC_KEY="<nouvelle_clé_publique>" \
  VAPID_PRIVATE_KEY="<nouvelle_clé_privée>" \
  ASSISTNOW_TOKEN="<jeton_u_blox_AssistNow>"
```

### 4.6 Configurer les cron jobs

Dans **Database → Cron Jobs** (active l'extension `pg_cron` si demandé) :

| Schedule | Function URL | Description |
|---|---|---|
| `0 4 * * *`   | `https://<NEW_REF>.supabase.co/functions/v1/rotate-hmac-keys`            | Rotation HMAC > 90 j |
| `0 6 * * *`   | `https://<NEW_REF>.supabase.co/functions/v1/daily-maintenance-reminders` | Rappels J-7 et J-1 |
| `0 7 * * *`   | `https://<NEW_REF>.supabase.co/functions/v1/anomaly-detector`            | Détection anomalies |
| `0 5 * * 1`   | `https://<NEW_REF>.supabase.co/functions/v1/engine-score`                | Score d'usage par engin hebdo lundi |
| `*/2 * * * *` | `https://<NEW_REF>.supabase.co/functions/v1/webhooks-dispatch`           | Webhooks toutes 2 min |

Le SQL pour créer un cron job est :
```sql
SELECT cron.schedule(
  'rotate-hmac-keys', '0 4 * * *',
  $$SELECT net.http_post(
    'https://<NEW_REF>.supabase.co/functions/v1/rotate-hmac-keys',
    '{}'::jsonb,
    '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );$$
);
```

## 5. Mise à jour de l'application (10 minutes)

### 5.1 Mettre à jour `.env`

```env
VITE_SUPABASE_URL=https://<NEW_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
VITE_VAPID_PUBLIC_KEY=<nouvelle_clé_publique_VAPID>
SUPABASE_URL=https://<NEW_REF>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<NEW_ANON_KEY>
SUPABASE_PROJECT_ID=<NEW_REF>
VITE_SUPABASE_PROJECT_ID=<NEW_REF>
```

### 5.2 Mettre à jour `wrangler.jsonc` (variables Cloudflare Workers)

Dans le dashboard Cloudflare Workers, déclarez les mêmes variables sous
**Settings → Variables → Secret Variables** pour la production.

### 5.3 Push GitHub

```bash
git add .env wrangler.jsonc
git commit -m "feat: migration vers projet Supabase personnel <NEW_REF>"
git push origin main
```

Cloudflare Workers redéploie automatiquement avec les nouvelles credentials.

## 6. Création du compte administrateur

Dans le nouveau projet, **Authentication → Users → Add user**, créez le compte
administrateur :

- Email : `ibrayago06@gmail.com`
- Password : généré, à stocker dans le coffre

À la première connexion sur l'application, allez sur `/fleet` et créez les
engins. Si vous avez exporté des données du projet Lovable (étape 3.2),
appliquez `autotrack_data_export.sql` via SQL Editor en remplaçant l'UUID
`owner_id` par l'ID du nouveau compte.

## 7. Validation et bascule

### 7.1 Tests de smoke

| Test | Critère de succès |
|---|---|
| Connexion utilisateur | Login OK avec le nouveau compte |
| Création d'un engin | FM-BUL-001 généré automatiquement |
| Push notification | Bouton « Tester » dans /settings affiche une notification |
| Carte temps réel | Marqueur affiché si trame télémétrie envoyée manuellement via curl |

### 7.2 Reflashage des trackers

Les trackers existants pointent vers `INGEST_URL=https://ayywtogmjlkrauluurse.supabase.co/api/public/ingest`.

Deux options :

- **Option A — DNS** : si vous avez un domaine personnalisé pointant vers
  Cloudflare Workers, mettez à jour le routage Worker pour rediriger
  `/api/public/ingest` vers la nouvelle origine. Aucun reflashage requis.

- **Option B — Reflash** : mettez à jour `include/secrets.h` avec la nouvelle
  `INGEST_URL` et flashez chaque tracker. Si OTA Wi-Fi est activé (v3.0),
  la mise à jour se fait sans démontage.

### 7.3 Déprovisionner l'ancien projet

Une fois la nouvelle instance validée pendant 7 jours sans incident :

1. Dashboard Lovable → **Settings → General → Pause project**.
2. Après 30 jours additionnels : **Delete project** (irréversible).

## 8. Bénéfices acquis

- **Autonomie totale** : votre PAT a tous les droits sur le nouveau projet.
- **MCP Supabase fonctionnel** : `apply_migration`, `deploy_edge_function`,
  `execute_sql` ne renvoient plus 403.
- **Coût** : 0 USD/mois sur le Free Plan, 25 USD/mois en Pro si dépassement.
- **Aucune perte fonctionnelle** : architecture identique, données migrables.
- **Rotation des secrets** : opportunité saisie pour générer de nouvelles
  clés VAPID et HMAC, neutralisant toute fuite éventuelle.

## 9. Sauvegarde de la procédure

Ce document doit être conservé dans le repo Git du projet pour assurer la
reproductibilité de la migration en cas de besoin futur (par exemple si
votre compte personnel devait être migré vers un compte d'organisation
Faso Mêbo officielle).

Dernière mise à jour : 2026-06-17.

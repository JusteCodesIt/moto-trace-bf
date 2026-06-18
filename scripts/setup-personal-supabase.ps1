# =============================================================================
# AutoTrack v3.1 - Script de migration vers projet Supabase personnel
#
# Automatise l'étape 4 de docs/MIGRATION_LOVABLE_BYPASS.md :
#   - Vérification CLI Supabase
#   - Lien au nouveau projet
#   - Application des migrations
#   - Déploiement des Edge Functions
#   - Configuration des secrets
#   - Création des cron jobs SQL
#
# Pré-requis :
#   - Vous avez créé le nouveau projet Supabase dans VOTRE organisation
#   - Vous avez le NEW_REF (project ref de 20 caractères)
#   - Vous avez le DB_PASSWORD du nouveau projet
#   - Vous avez le SERVICE_ROLE_KEY du nouveau projet
#   - Vous avez généré une paire VAPID (npx web-push generate-vapid-keys)
#
# Usage :
#   pwsh ./scripts/setup-personal-supabase.ps1 `
#     -NewRef "xxxxxxxxxxxxxxxxxxxx" `
#     -DbPassword "votre-mdp-fort" `
#     -ServiceRoleKey "eyJh..." `
#     -VapidPublicKey "BHkh..." `
#     -VapidPrivateKey "7ALu..." `
#     -AssistNowToken "votre-token-u-blox"
# =============================================================================

param(
    [Parameter(Mandatory=$true)]  [string]$NewRef,
    [Parameter(Mandatory=$true)]  [string]$DbPassword,
    [Parameter(Mandatory=$true)]  [string]$ServiceRoleKey,
    [Parameter(Mandatory=$true)]  [string]$VapidPublicKey,
    [Parameter(Mandatory=$true)]  [string]$VapidPrivateKey,
    [Parameter(Mandatory=$false)] [string]$AssistNowToken = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== AutoTrack v3.1 - Migration vers projet Supabase personnel ===" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------
# 1) Vérification CLI Supabase
# ---------------------------------------------------------------------
Write-Host "[1/6] Vérification de la CLI Supabase..." -ForegroundColor Yellow
$cli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $cli) {
    Write-Host "  CLI absente. Installation via npm..." -ForegroundColor Yellow
    npm install -g supabase
    if ($LASTEXITCODE -ne 0) { throw "Échec installation supabase CLI" }
}
$version = supabase --version
Write-Host "  Version : $version" -ForegroundColor Green

# ---------------------------------------------------------------------
# 2) Lien au nouveau projet
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "[2/6] Lien au projet $NewRef..." -ForegroundColor Yellow
Push-Location $PSScriptRoot/..
$env:SUPABASE_DB_PASSWORD = $DbPassword
supabase link --project-ref $NewRef
if ($LASTEXITCODE -ne 0) { throw "Échec supabase link" }
Write-Host "  Projet lié avec succès" -ForegroundColor Green

# ---------------------------------------------------------------------
# 3) Application des migrations
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "[3/6] Application des migrations SQL..." -ForegroundColor Yellow
supabase db push
if ($LASTEXITCODE -ne 0) { throw "Échec supabase db push" }
Write-Host "  Toutes les migrations appliquées" -ForegroundColor Green

# ---------------------------------------------------------------------
# 4) Déploiement des Edge Functions
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "[4/6] Déploiement des Edge Functions..." -ForegroundColor Yellow
$functions = @(
    @{ name = "send-push";                       verify_jwt = $false },
    @{ name = "daily-maintenance-reminders";     verify_jwt = $false },
    @{ name = "anomaly-detector";                verify_jwt = $false },
    @{ name = "engine-score";                    verify_jwt = $false },
    @{ name = "webhooks-dispatch";               verify_jwt = $false },
    @{ name = "rotate-hmac-keys";                verify_jwt = $false },
    @{ name = "fleet-ws";                        verify_jwt = $true  }
)
foreach ($fn in $functions) {
    $verifyArg = if ($fn.verify_jwt) { "" } else { "--no-verify-jwt" }
    Write-Host "  $($fn.name)..." -ForegroundColor Gray
    if ($verifyArg) {
        supabase functions deploy $fn.name $verifyArg
    } else {
        supabase functions deploy $fn.name
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    AVERTISSEMENT : déploiement $($fn.name) a échoué (sera à reprendre manuellement)" -ForegroundColor Yellow
    } else {
        Write-Host "    OK" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------------
# 5) Configuration des secrets
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "[5/6] Configuration des secrets..." -ForegroundColor Yellow
$secretArgs = @(
    "VAPID_PUBLIC_KEY=$VapidPublicKey",
    "VAPID_PRIVATE_KEY=$VapidPrivateKey"
)
if ($AssistNowToken) { $secretArgs += "ASSISTNOW_TOKEN=$AssistNowToken" }
& supabase secrets set @secretArgs
if ($LASTEXITCODE -ne 0) { throw "Échec supabase secrets set" }
Write-Host "  Secrets configurés" -ForegroundColor Green

# ---------------------------------------------------------------------
# 6) Création des cron jobs SQL
# ---------------------------------------------------------------------
Write-Host ""
Write-Host "[6/6] Création des cron jobs..." -ForegroundColor Yellow
$cronSql = @"
-- Activer pg_cron si nécessaire
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rotation HMAC 04:00 UTC
SELECT cron.schedule(
  'rotate-hmac-keys', '0 4 * * *',
  `$`$SELECT net.http_post(
    'https://$NewRef.supabase.co/functions/v1/rotate-hmac-keys',
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer $ServiceRoleKey')
  );`$`$
);

-- Rappels maintenance 06:00 UTC
SELECT cron.schedule(
  'daily-maintenance-reminders', '0 6 * * *',
  `$`$SELECT net.http_post(
    'https://$NewRef.supabase.co/functions/v1/daily-maintenance-reminders',
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer $ServiceRoleKey')
  );`$`$
);

-- Détection anomalies 07:00 UTC
SELECT cron.schedule(
  'anomaly-detector', '0 7 * * *',
  `$`$SELECT net.http_post(
    'https://$NewRef.supabase.co/functions/v1/anomaly-detector',
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer $ServiceRoleKey')
  );`$`$
);

-- Score d'usage par engin hebdomadaire (lundi 05:00 UTC)
SELECT cron.schedule(
  'engine-score', '0 5 * * 1',
  `$`$SELECT net.http_post(
    'https://$NewRef.supabase.co/functions/v1/engine-score',
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer $ServiceRoleKey')
  );`$`$
);

-- Webhooks dispatch toutes les 2 minutes
SELECT cron.schedule(
  'webhooks-dispatch', '*/2 * * * *',
  `$`$SELECT net.http_post(
    'https://$NewRef.supabase.co/functions/v1/webhooks-dispatch',
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer $ServiceRoleKey')
  );`$`$
);
"@

$cronFile = Join-Path $env:TEMP "autotrack-cron-$NewRef.sql"
$cronSql | Out-File -FilePath $cronFile -Encoding utf8
Write-Host "  SQL des cron jobs écrit dans : $cronFile" -ForegroundColor Gray
Write-Host "  Exécution sur le projet..." -ForegroundColor Gray
supabase db execute --file $cronFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "  AVERTISSEMENT : execute du fichier SQL a échoué" -ForegroundColor Yellow
    Write-Host "  Exécutez le SQL manuellement dans le SQL Editor du dashboard." -ForegroundColor Yellow
} else {
    Write-Host "  Cron jobs créés" -ForegroundColor Green
}

# ---------------------------------------------------------------------
# Finalisation
# ---------------------------------------------------------------------
Pop-Location
Write-Host ""
Write-Host "=== Migration terminée ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Prochaines étapes (à faire à la main) :" -ForegroundColor Yellow
Write-Host "  1) Mettre à jour .env avec VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY" -ForegroundColor White
Write-Host "  2) Mettre à jour VITE_VAPID_PUBLIC_KEY=$VapidPublicKey" -ForegroundColor White
Write-Host "  3) Créer le compte admin via Dashboard > Authentication > Users" -ForegroundColor White
Write-Host "  4) git add .env && git commit && git push (Cloudflare Workers redéploie)" -ForegroundColor White
Write-Host "  5) Reflasher les trackers ou rediriger le DNS d'INGEST_URL" -ForegroundColor White
Write-Host ""

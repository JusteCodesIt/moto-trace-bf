@echo off
REM AutoTrack — demarrage automatique
REM Lance l'app au demarrage de session Windows

set PATH=C:\Users\dell\AppData\Local\nvm\v22.16.0;%PATH%
set APP_DIR=C:\Users\dell\Downloads\Files_AutoTrack_Firmware\webapp

cd /d "%APP_DIR%"
pm2 resurrect
timeout /t 3 /nobreak >nul
pm2 start ecosystem.config.cjs 2>nul
pm2 save

REM Reactive Tailscale Funnel (ingest public HTTPS)
"C:\Program Files\Tailscale\tailscale.exe" funnel --bg 3000

# SUNU TAC — Windows deployment bundle

This folder is **everything** the Windows machine needs. No source code, no build: Docker pulls ready-made
images from GitHub's registry (`ghcr.io/tro-jean-cedric/sunu-tac-api` and `-web`).

```
windows-deploy\
  docker-compose.yml   the stack (db + api + web)
  .env                 settings and secrets (created by build-and-push.sh, never committed)
  update.bat           pull latest images + (re)start  — also the first start
  backup.bat           database dump into backups\  (same .dump format as ./tac.sh backup)
  restore.bat          replace the database with a dump
```

## On the developer Mac (each release)

```bash
./build-and-push.sh          # builds linux/amd64 images, pushes :<git-sha> and :latest to ghcr.io
```

The first run also creates `windows-deploy/.env` with random secrets: fill in `LDAP_BIND_DN`,
`LDAP_BIND_PASSWORD` and the optional API keys before copying it.

## On the Windows PC — once

1. Install **Docker Desktop** (WSL 2 backend), reboot. Settings → General → *Start Docker Desktop when you sign in*.
2. Copy this folder to e.g. `C:\sunu-tac\` (with the filled-in `.env`).
3. Log in to the registry once (the images are private). Create a GitHub token
   (github.com → Settings → Developer settings → Personal access tokens (classic) → scope **read:packages** only):
   ```powershell
   docker login ghcr.io -u tro-jean-cedric      # paste the token as password
   ```
4. Open the port to the network (admin PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "SUNU TAC 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
   ```
5. Double-click **update.bat**. Open `http://localhost:8080/admin/`, log in as `admin.drh` with the
   `ADMIN_PASSWORD` from `.env`, then *Administration → Synchroniser l'annuaire*
   (or bring the existing data over: `./tac.sh backup` on the Mac, then `restore.bat <file>.dump` here).

Employees: `http://<pc-name-or-ip>:8080/` — HR console: `http://<pc-name-or-ip>:8080/admin/`.

## Day to day

- **Update:** after `./build-and-push.sh` on the Mac, double-click `update.bat`.
- **Roll back:** set `TAG=<previous git sha>` in `.env`, run `update.bat` (set back to `latest` afterwards).
- **Backup:** Task Scheduler → daily task running `C:\sunu-tac\backup.bat`. Copy `backups\` off the PC.
- **Restore:** `restore.bat backups\tac-XXXX.dump`
- **Logs:** `docker compose logs -f api`
- Keep the PC awake (Settings → Power → Sleep: Never). After a reboot Docker starts at sign-in, the app follows.

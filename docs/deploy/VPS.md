# Deploying Revaro to a VPS

This is the operator's half of `.github/workflows/work.yml`. The workflow builds,
tests and audits every push, then — for `main` only, after `verify` passes —
uploads the release, backs up the database, migrates, flips a symlink, restarts
the API and health-checks it. This document covers what has to exist on the
server for that to work, and what to do by hand when it doesn't.

Nothing here contains a secret value, and nothing here should: every credential
lives either in GitHub Secrets or in the server's `$SSH_PATH/shared/.env`.

---

## 1. Layout the workflow expects

`$SSH_PATH` is a single absolute path (the `SSH_PATH` secret), e.g.
`/var/www/revaro`. It must not contain spaces.

```text
$SSH_PATH/
├── releases/
│   ├── <git-sha-1>/          immutable release: dist/, server/, src/lib/, drizzle/, manifests
│   ├── <git-sha-2>/          ← newest; pruned to the 5 most recent
│   └── ...
├── shared/
│   ├── .env                  the real environment file (mode 600)
│   └── uploads/              seller uploads; survived every deploy
├── backups/                  <utc-stamp>-<sha12>.sql.gz — 10 most recent kept
└── current -> releases/<git-sha-N>    the live release (atomic symlink)
```

Two symlinks are re-created inside each release, so state survives the swap:

| In the release        | Points at                    |
| --------------------- | ---------------------------- |
| `$RELEASE/.env`       | `$SSH_PATH/shared/.env`      |
| `$RELEASE/server/uploads` | `$SSH_PATH/shared/uploads` |

The second one matters: `server/lib/storage/dev.ts` resolves uploads relative to
the process working directory (`<release>/server/uploads`), so the symlink is
what keeps images across releases *and* across a rollback.

---

## 2. Server prerequisites

Assume a current Ubuntu LTS (22.04/24.04) box you can SSH into as a sudo-capable
user.

### 2.1 Users

```bash
# The service account the API runs as. No login shell, no sudo.
sudo useradd --system --home /var/www/revaro --shell /usr/sbin/nologin revaro

# The deploy account GitHub Actions connects as.
sudo useradd --create-home --shell /bin/bash revaro-deploy
sudo usermod -aG revaro revaro-deploy
```

### 2.2 Node.js 22 and pnpm 10

The workflow pins Node 22 and pnpm 10; the server must match, so a release built
for one runs on the other.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo npm install -g pnpm@10
pnpm --version   # must print 10.x
```

`pnpm` must be on the default `PATH` for **non-interactive** SSH sessions — the
GitHub Actions SSH commands do not read your shell profile. `/usr/local/bin/pnpm`
from the global install is fine; a `pnpm` installed through a version manager
under `$HOME` is not.

### 2.3 MariaDB with a least-privilege application user

Install MariaDB, then create the database and one user that owns only what the
app and the migrations need — never `root`, and never `ALL PRIVILEGES`.

```sql
CREATE DATABASE reloop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'revaro_app'@'localhost' IDENTIFIED BY '<generated-password>';

-- Runtime: ordinary DML only.
GRANT SELECT, INSERT, UPDATE, DELETE ON reloop.* TO 'revaro_app'@'localhost';

-- Migrations: drizzle-kit issues DDL (CREATE/ALTER/DROP/INDEX).
GRANT CREATE, ALTER, DROP, INDEX, REFERENCES ON reloop.* TO 'revaro_app'@'localhost';

FLUSH PRIVILEGES;
```

`mysqldump --single-transaction` (what the workflow runs) only needs `SELECT`
plus `PROCESS` on some MariaDB builds; grant `PROCESS` globally, or point the
backup at a separate `SELECT`-only account, if your build asks for it.

Confirm it is a local-only listener — 3306 is not a public port:

```ini
# /etc/mysql/mariadb.conf.d/50-server.cnf
bind-address = 127.0.0.1
```

### 2.4 Reverse proxy and HTTPS

The API is plain HTTP on `127.0.0.1:<API_PORT>` (default `3001`) and serves
`/api/*`; the SPA is static files in `$SSH_PATH/current/dist`. Terminate TLS at
the proxy.

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  # certbot fills these in; `sudo certbot --nginx -d example.com`
  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  # The built SPA. `current` is the symlink the workflow flips.
  root /var/www/revaro/current/dist;
  location / {
    try_files $uri /index.html;
  }

  # The API. Uploaded images are served through it too (/api/storage/local).
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;   # uploads
  }
}

server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}
```

Bump `client_max_body_size` to match the API's own upload limit.

### 2.5 Firewall

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Port `3001` stays closed to the world; the health check runs on the box itself
against `127.0.0.1`.

### 2.6 The service account's environment file

Create `$SSH_PATH/shared/.env` once, owned by `revaro`, mode `600`. It is the
only place production credentials live. At minimum it needs:

```env
NODE_ENV=production          # required: refuses the dev payment/storage mocks
API_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=revaro_app
DB_PASSWORD=<from the MariaDB step>
DB_NAME=reloop
# …plus the real JWT/MFA/session secrets and a real PAYMENT_PROVIDER, copied from
# .env.example. Never prefix any of these with VITE_ — that makes them public.
```

`NODE_ENV=production` is not cosmetic: `server/lib/env.ts` refuses to start
without the required secrets, and the development payment provider is refused
outright in production.

```bash
sudo install -d -m 750 -o revaro -g revaro /var/www/revaro/shared
sudo install -d -m 750 -o revaro -g revaro /var/www/revaro/shared/uploads
sudo install -d -m 750 -o revaro -g revaro /var/www/revaro/backups
sudo install -d -m 755 -o revaro-deploy -g revaro /var/www/revaro/releases
sudo -e /var/www/revaro/shared/.env      # paste the real values, then: chmod 600
sudo chown revaro:revaro /var/www/revaro/shared/.env
sudo chmod 600 /var/www/revaro/shared/.env
```

---

## 3. Required GitHub secrets

Add these under **Settings → Secrets and variables → Actions**. Every one is a
repository secret; the workflow references the *names* only.

| Secret            | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `SSH_HOST`        | Hostname or IP of the VPS.                                              |
| `SSH_USER`        | `revaro-deploy` (the deploy account).                                    |
| `SSH_PATH`        | Absolute deploy root, e.g. `/var/www/revaro`. **No spaces.**            |
| `SSH_KEY`         | Private half of the dedicated deploy key (all lines, including the `BEGIN`/`END` ones). |
| `SSH_KNOWN_HOSTS` | Verbatim `ssh-keyscan` output for the host (see below).                  |
| `SSH_PORT`        | Optional. Omitted ⇒ `22`. Use it if SSH is on a non-standard port.       |

The production environment (**Settings → Environments → `production`**) is where
you attach a required reviewer if you want deploys to pause for approval, and
where you can scope environment-specific secrets.

`sanity`: never paste the contents of `shared/.env` into a repository secret, an
issue, or a CI log. The workflow reads database credentials on the server, from
that file, which is why no `DB_*` secret appears above.

### 3.1 Generate the deploy key pair

On your workstation:

```bash
ssh-keygen -t ed25519 -C "revaro-deploy@github-actions" -f ./revaro_deploy -N ""
```

Public half → the deploy account's `authorized_keys`, restricted to this nginx
box's needs:

```bash
# On the VPS, as the sudo-capable admin user:
sudo install -d -m 700 -o revaro-deploy -g revaro-deploy /home/revaro-deploy/.ssh
sudo tee -a /home/revaro-deploy/.ssh/authorized_keys < revaro_deploy.pub
sudo chown revaro-deploy:revaro-deploy /home/revaro-deploy/.ssh/authorized_keys
sudo chmod 600 /home/revaro-deploy/.ssh/authorized_keys
```

Private half → the `SSH_KEY` secret (e.g. `gh secret set SSH_KEY < revaro_deploy`).
Then delete both local copies, or move them into your password manager.

### 3.2 Pin the host key into `SSH_KNOWN_HOSTS`

The workflow runs `StrictHostKeyChecking yes`, so the *exact* host-key line must
be present. Capture it yourself — do not accept it on first connect:

```bash
ssh-keyscan -H -p 22 <your-host> > revaro_known_hosts
# Non-standard port: the entry is stored as [host]:port, which is what ssh expects:
ssh-keyscan -H -p 2222 <your-host> > revaro_known_hosts

cat revaro_known_hosts                                  # verify the fingerprints out of band
gh secret set SSH_KNOWN_HOSTS < revaro_known_hosts
```

Re-run this only when the server's host key legitimately changes, and after
verifying the new fingerprint with whoever rebuilt the box.

### 3.3 Allow the one privileged command

The restart is the only step that needs root. Grant exactly that, non-interactive:

```bash
sudo tee /etc/sudoers.d/revaro-deploy >/dev/null <<'EOF'
revaro-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart revaro-api
EOF
sudo chmod 440 /etc/sudoers.d/revaro-deploy
sudo visudo -c
```

The workflow calls `sudo -n systemctl restart revaro-api`; `-n` fails rather than
prompting, so a misconfigured rule fails the deploy instead of hanging it.

### 3.4 Install the systemd unit

See `docs/deploy/revaro-api.service` for the unit itself.

```bash
sudo cp docs/deploy/revaro-api.service /etc/systemd/system/revaro-api.service
sudo systemctl daemon-reload
sudo systemctl enable revaro-api
```

The unit is not started by hand: the first deploy creates `current` and restarts
it. To smoke-test before the first deploy, create the symlink yourself (§5).

---

## 4. What each deploy does

In order, and why the order matters:

1. **Upload** `dist/`, `server/`, `src/lib/`, `drizzle/` and the manifests into
   `releases/<sha>/`. The live `current` folder is never written to.
2. **Install** `pnpm install --frozen-lockfile --prod` inside the release, then
   symlink `shared/.env` and `shared/uploads`.
3. **Back up**: `mysqldump --single-transaction` → `backups/<utc>.sql.gz`, keeping
   the 10 most recent. Taken *before* any schema change.
4. **Migrate**: `pnpm db:migrate` from the new release. A failure aborts here —
   the old release is still serving and the schema is whatever the dump captured.
5. **Switch**: atomically rename a symlink over `current`, then
   `systemctl restart revaro-api`.
6. **Health check**: `GET /api/health` up to 12 times, 5 s apart. That endpoint
   runs `SELECT 1` and answers 503 when the database is unreachable, so it tests
   the whole path, not just "a process is listening". On failure the symlink goes
   back to the previous release, the service restarts, and the job exits non-zero.
7. **Prune**: keep the 5 most recent release folders, skipping the one `current`
   points at.

### A caveat worth knowing: `--prod` and the dev tools

`pnpm start:api` runs `tsx server/index.ts` and `pnpm db:migrate` runs
`drizzle-kit migrate` — both are **dev** dependencies, which
`pnpm install --frozen-lockfile --prod` deliberately does not install. If the
deploy fails at "Run migrations from the new release" with
`drizzle-kit: not found`, the server is missing them. Two supported fixes:

```bash
# Either install the two tools globally on the server:
sudo npm install -g tsx@4 drizzle-kit@0.31

# …or install the full dependency set in the release instead of --prod, by
# editing the "Install release dependencies and link shared state" step.
```

(Alternatively, promote `tsx` and `drizzle-kit` to `dependencies` in
`package.json` — a repository change, not a server one.)

---

## 5. Manual rollback

A rollback is a symlink flip plus a restart: releases are self-contained, so
going back is choosing the old folder. No build, no upload.

```bash
# As the deploy account (or via sudo -u revaro-deploy).
ssh revaro-deploy@<host>

BASE=/var/www/revaro
ls -1dt "$BASE"/releases/*/ | head -n 6     # newest first: [0] is live-ish, [1] is the one before

# Point at the release you want. Use the full path, never a relative one.
ln -sfn "$BASE/releases/<previous-sha>" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
sudo -n systemctl restart revaro-api
curl -fsS http://127.0.0.1:3001/api/health && echo OK

systemctl status revaro-api --no-pager
```

If the schema also has to go back, do it in this order:

1. Stop the API: `sudo systemctl stop revaro-api` — nothing should be writing.
2. Roll the **code** back (symlink above) so the old code is what reads the data.
3. Take a dump of the current (bad) state anyway, so nothing is lost:
   `mysqldump … > /var/www/revaro/backups/pre-rollback.sql.gz` (see §6 for the
   credential pattern).
4. Restore the dump that matches the release (see §6).
5. `sudo systemctl start revaro-api` and re-run the health check.

Confirm the SPA is also serving the rolled-back build — nginx reads
`current/dist`, so it follows the same symlink with no reload.

---

## 6. Restoring a backup

The dumps are plain `mysqldump` output, gzipped. Take a fresh safety dump first
so the restore itself is reversible.

```bash
BASE=/var/www/revaro
cd "$BASE"

# 1. Load credentials from the shared env file. Never paste them on the command
#    line: MYSQL_PWD keeps the password out of argv and out of shell history.
set -a; . "$BASE/shared/.env"; set +a

# 2. Safety dump of the current state.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --quick \
  -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" \
  | gzip -9 > "$BASE/backups/$STAMP-pre-restore.sql.gz"

# 3. Pick the dump. Names are <utc-stamp>-<sha12>.sql.gz, so the release it
#    belongs to is in the filename.
ls -1t "$BASE/backups"/*.sql.gz | head

# 4. Stop writing.
sudo systemctl stop revaro-api

# 5. Restore. `--one-database` guards against a dump that names other schemas.
gunzip -c "$BASE/backups/<stamp>-<sha12>.sql.gz" \
  | MYSQL_PWD="$DB_PASSWORD" mariadb \
      -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME"

# 6. Put the code that matches the dump back in place (see §5), then start.
sudo systemctl start revaro-api
curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" && echo OK
```

Notes:

- Restoring is **destructive**: the dump recreates tables, it does not merge.
- The dump is taken before migrations, so pairing it with the release that was
  live at the time is what keeps code and schema consistent.
- `server/seed*.ts` refuses to run with `NODE_ENV=production`; never try to
  "fix" a restored database by seeding it on the server.
- If only a few tables are suspect, restore into a scratch database
  (`CREATE DATABASE reloop_restore`) and copy the tables across by hand.

---

## 7. Rehearsing the rollback

Do this drill once, on a quiet moment, before trusting the path.

1. Note the live release: `readlink -f /var/www/revaro/current`.
2. Force a failing health check by making the API stop answering while it is
   still "running": temporarily break the health endpoint on the server, e.g.
   stop MariaDB (`sudo systemctl stop mariadb`) — `/api/health` then answers 503
   and `curl -f` fails, which is exactly the signal the workflow keys on.
3. Re-run the deploy job (Actions → the workflow → **Re-run jobs**, or push an
   empty commit — do not run `.github/workflows/work.yml` steps manually against
   production).
4. Watch the log: `health check attempt n/12 failed` twelve times, then
   `rolling back to <sha>`, then `Error: Process completed with exit code 1`.
   Confirm `readlink -f /var/www/revaro/current` is the *old* release again and
   the job failed rather than reporting success.
5. Restore what you broke (`sudo systemctl start mariadb`) and re-run the deploy
   once; it should pass and leave `current` on the new release.

A cheaper variant that does not touch MariaDB: temporarily point nginx's
`/api/` upstream at a closed port, so the proxy answers 502 and the health check
fails the same way.

---

## 8. Routine maintenance

```bash
# Is the API up, and what is it running?
systemctl status revaro-api --no-pager
journalctl -u revaro-api -n 100 --no-pager
readlink -f /var/www/revaro/current

# Disk: releases (5 × ~node_modules) and dumps (10) are the usual culprits.
du -sh /var/www/revaro/releases/* | sort -h | tail
```

- **Rotate the deploy key** the same way it was created (§3.1): add the new
  public key, update the `SSH_KEY` secret, verify a deploy, then remove the old
  line from `authorized_keys`.
- **Certificate renewal** is certbot's job (`systemctl list-timers | grep certbot`);
  if it is not enabled: `sudo systemctl enable --now certbot.timer`.
- **Never** `rsync --delete` into `current`, `git pull` inside a release, or edit
  files inside a release folder — the next deploy replaces it, and the change is
  invisible to `git status`.

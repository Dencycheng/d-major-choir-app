# Production Runbook

## Current Production Mode

The live trial environment uses Docker Compose, PostgreSQL, FastAPI, two static web frontends, and the WeChat miniapp.

- API: `https://api.dmajorchoir.com`
- Admin web: `https://admin.dmajorchoir.com`
- Member web: `https://member.dmajorchoir.com`

Until an enterprise SMS qualification is available, production can run in internal trial mode:

```env
ALLOW_DEMO_LOGIN_CODE=false
AUTH_ALLOW_OPEN_REGISTRATION=false
AUTH_ALLOW_FIRST_USER_BOOTSTRAP=true
SMS_PROVIDER=internal
INTERNAL_LOGIN_CODE=<temporary internal code>
```

`AUTH_ALLOW_FIRST_USER_BOOTSTRAP=true` allows the first verified user to create the first admin account even when open registration is closed. After the first admin and choir exist, keep `AUTH_ALLOW_OPEN_REGISTRATION=false`.

## Deploy Or Restart

```bash
cd /home/ubuntu/choir_app_mvp
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml build
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml up -d
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml ps
```

Health check:

```bash
curl https://api.dmajorchoir.com/health
```

Expected response:

```json
{"status":"ok","service":"choir-app-backend","version":"0.6.0"}
```

## Nginx Routing

Nginx should route:

```text
api.dmajorchoir.com    -> 127.0.0.1:8000
admin.dmajorchoir.com  -> 127.0.0.1:8080
member.dmajorchoir.com -> 127.0.0.1:8090
```

If an old page appears, check for conflicting Nginx sites:

```bash
sudo grep -R "dmajorchoir.com" -n /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
```

Only the current `dmajor.conf` should handle these domains.

## Backup

Run before releases and before data operations:

```bash
cd /home/ubuntu/choir_app_mvp
sudo scripts/prod_backup.sh
```

This writes PostgreSQL and upload backups into `backups/`.

## Restore

Use only during maintenance windows:

```bash
cd /home/ubuntu/choir_app_mvp
sudo scripts/prod_restore.sh backups/postgres_YYYYmmdd_HHMMSS.dump backups/uploads_YYYYmmdd_HHMMSS.tar.gz
```

## Restore Legacy Uploads

After copying old `backend/uploads` files into the server project and making sure a choir/admin exists:

```bash
cd /home/ubuntu/choir_app_mvp
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml build backend
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml rm -sf backend
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml up -d backend
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml exec backend python -m app.tools.restore_legacy_uploads
```

The script creates a work named `历史谱库恢复` and attaches supported PDF/audio/video files as resources.

## Sync Tencent COS Library

If score files already exist in Tencent COS, register them into the backend library after making sure a choir/admin exists.

Add these values to `/home/ubuntu/choir_app_mvp/.env.production` on the Tencent Cloud server:

```bash
COS_BUCKET=your-bucket-name-1234567890
COS_REGION=ap-guangzhou
COS_PREFIX=optional/folder/prefix
COS_PUBLIC_BASE=https://your-bucket-name-1234567890.cos.ap-guangzhou.myqcloud.com
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_SYNC_WORK_TITLE=COS谱库同步
```

Then rebuild the backend and run a dry run first:

```bash
cd /home/ubuntu/choir_app_mvp
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml build backend
sudo docker rm -f choir_app_mvp_backend_1
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml up -d backend
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml exec backend python -m app.tools.sync_cos_library --dry-run
```

If the dry run count is correct, run the real sync:

```bash
sudo docker-compose --env-file .env.production -f docker-compose.prod.yml exec backend python -m app.tools.sync_cos_library
```

The script creates works from COS folder names and resources from every non-empty object under `COS_PREFIX`. It is idempotent: running it again skips resources with the same COS URL. Private COS buckets are supported through `/api/resources/{resource_id}/signed-url` when COS credentials are configured.

## WeChat Miniapp

Configure legal domains in the WeChat Mini Program console:

```text
request:      https://api.dmajorchoir.com
uploadFile:   https://api.dmajorchoir.com
downloadFile: https://api.dmajorchoir.com
```

If miniapp users need to open COS-hosted scores directly, also add the COS bucket domain, for example:

```text
downloadFile: https://your-bucket-name-1234567890.cos.ap-guangzhou.myqcloud.com
```

Use the real AppID in `miniapp/project.config.json` and upload a trial version before publishing.

## Before Public Launch

- Replace `SMS_PROVIDER=internal` with `SMS_PROVIDER=tencent` after enterprise SMS qualification, approved signature, and template are ready.
- Keep `ALLOW_DEMO_LOGIN_CODE=false`.
- Keep `AUTH_ALLOW_OPEN_REGISTRATION=false` unless intentionally running a public registration campaign.
- Confirm automated backups are scheduled and tested.
- Confirm the GitHub repository contains the latest production code.

# Production deployment — scraptox.com

Shared VPS `178.16.139.252` (Ubuntu 24.04). Other projects run on this server; only touch the Scraptox items listed here.

| Item | Value |
|---|---|
| Site | https://scraptox.com (`www` and `http` redirect here) |
| API base | https://scraptox.com/api (also `/api/v1`) |
| Socket.io | https://scraptox.com/socket.io |
| Health | https://scraptox.com/health |
| Linux user | `scrapto` (no sudo) |
| Code | `/home/scrapto/app/backend`, `/home/scrapto/app/frontend` |
| Backend port | `5620`, bound to `127.0.0.1` only (`HOST`/`PORT` in `backend/.env`) |
| Process manager | pm2 under user `scrapto`, app `scraptox-backend`, boot service `pm2-scrapto` |
| nginx site | `/etc/nginx/sites-available/scraptox.com` (root only) |
| SSL | Let's Encrypt `scraptox.com` + `www`, webroot renewal, reloads nginx on renew |
| Mobile apps | `PROD_API_URL = 'https://scraptox.com'` in each app's `src/config/env.ts` (client appends `/api`) |

## Update the backend (as `scrapto`)

```bash
cd ~/app/backend
# copy new code here (keep .env), then:
npm install --omit=dev
pm2 restart scraptox-backend --update-env
pm2 logs scraptox-backend --lines 50
```

## Update the frontend (as `scrapto`)

```bash
cd ~/app/frontend
# copy new code here (keep .env: VITE_API_BASE_URL=/api), then:
npm ci && npm run build
```

nginx serves `dist/` directly, so no reload is needed.

## Notes

- `backend/.env` on the server has secrets created only for production: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET`, `KYC_ENCRYPTION_KEY`. **Back up `KYC_ENCRYPTION_KEY`**: if it's lost, encrypted KYC data can't be decrypted.
- **Test logins are ON (temporary).** `OTP_TEST_NUMBERS_IN_PRODUCTION=true` and `OTP_TEST_NUMBERS` in the server `.env` let one test user and one test partner log in with a fixed OTP and no SMS (the numbers are only in the server `.env`, never in this public repo). Remove both lines from `backend/.env` and run `pm2 restart scraptox-backend --update-env` before the real launch.
- **SMS OTP is broken.** SMSIndiaHub rejects sender ID `SMSHUB` (`Failed#senderid not valid`). Set `SMSINDIAHUB_SENDER_ID` to the approved DLT sender ID, and make sure the message text in `services/smsIndiaHubService.js` matches the approved template.
- `backend/package-lock.json` is out of sync with `package.json`, so `npm ci` fails. Run `npm install` locally and commit the lock file.

# Checking pulled code for malware

## What happened (2026-11-19)

GitHub `main` had a commit replaced by a force-push. The new commit `e365b01` still showed the owner's name, but it added malware:

- **Hidden payload:** obfuscated JavaScript in `backend/init`, `frontend/init`, `user-app/init`, `scrapper-app/init` and `frontend/vite.config.js`. The code sits after hundreds of spaces or tabs, so it is off-screen in an editor.
- **Trigger:** `npm start`, `npm run dev` and `npm run build` were changed to `node init && …`.
- **Hiding place:** `config.bat` was added to `.gitignore`.

This type of malware steals saved passwords, browser sessions, crypto wallets, `.env` files and GitHub logins. It then spreads by pushing itself into other repos.

The cleanup commit removes all of it. Your real work from that period, `52191de`, is kept.

**If you ran `npm start`, `npm run dev` or `npm run build` on code from `e365b01` or `52191de`, treat that PC as infected:**
1. Scan it or reinstall it.
2. Change your passwords.
3. Sign out of all GitHub sessions.
4. Rotate the backend secrets: MongoDB, JWT, Razorpay, SMS, Cloudinary and Firebase.

## How to pull from now on

Use the safe pull, never a plain `git pull`:

```
bash scripts/safe-pull.sh
```

It fetches the code, scans it before it reaches your files, and merges only if the scan passes.

Run this once per clone, so every merge and rebase is also re-scanned:

```
git config core.hooksPath .githooks
```

To scan any branch or commit yourself:

```
bash scripts/scan-malware.sh origin/main
```

## What the scanner looks for

- the known signatures of this payload
- code after 150 or more spaces or tabs
- obfuscated `_0x…` JavaScript
- extension-less `init` files
- npm scripts that run a hidden file before the real command
- npm install hooks
- `.gitignore` entries that hide dropper files
- `eval`, `Function`, `child_process` or `constructor` inside build config files

If it reports anything, don't run `npm`, `node`, `vite` or `metro`. Clean the code on a separate branch first.

## Rules

- Never force-push `main`. Turn on branch protection on GitHub to block it.
- Review every change to `package.json` scripts and `*.config.js` files before running them.
- The scanner is in the repo, so an attacker could edit it too. A change to `scripts/scan-malware.sh` or `.githooks/` needs a second person to look at it.

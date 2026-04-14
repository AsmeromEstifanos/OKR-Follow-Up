# Deployment

## GitHub Actions to cPanel

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-cpanel.yml`.

It deploys on:

- pushes to `main`
- manual runs from `workflow_dispatch`

The workflow does this:

1. checks out the repo
2. installs dependencies
3. runs TypeScript verification
4. runs `npm run build`
5. uploads a deployment archive to your cPanel server over SSH
6. extracts the archive into the app directory
7. runs `npm ci` and `npm run build` on the server
8. restarts the app

## Required GitHub Secrets

Add these repository secrets in GitHub:

- `CPANEL_HOST`: your cPanel SSH host
- `CPANEL_PORT`: SSH port, usually `22`
- `CPANEL_USERNAME`: SSH username
- `CPANEL_SSH_KEY`: private key used by GitHub Actions
- `CPANEL_APP_DIR`: absolute path to the deployed app on the server

Optional secrets:

- `CPANEL_APP_PORT`: app port if your cPanel setup depends on it
- `CPANEL_RESTART_COMMAND`: exact restart command for your host

## Restart behavior

If `CPANEL_RESTART_COMMAND` is set, the workflow runs it after build.

If it is not set, the workflow falls back to:

```sh
touch tmp/restart.txt
```

That fallback is useful for Passenger-based cPanel setups.

## Server assumptions

The workflow assumes:

- Node.js is already available on the cPanel server
- the app has already been created/configured in cPanel
- your server-side `.env` file already exists in `CPANEL_APP_DIR`

The workflow preserves:

- `.env`
- `tmp`
- `logs`

## Recommended cPanel restart command

This depends on how your hosting provider wired the Node.js app.

Common cases:

- Passenger app: leave `CPANEL_RESTART_COMMAND` empty and let `tmp/restart.txt` handle it
- Custom startup script: set `CPANEL_RESTART_COMMAND` to the exact command your host requires

## Notes

- The workflow currently deploys from `main`. Change the branch in `.github/workflows/deploy-cpanel.yml` if needed.
- The application startup entry for cPanel remains `npm run start:cpanel`, which uses `app.js`.

# reps – reps.pusiaczkowo.pl

A gym log in the style of FitNotes: exercises grouped by body part (EN/PL),
sets with kg and reps, records and stats. Runs serverless on AWS, built with
Terraform, same setup as Our To-Dos and Our Trips. See [PLAN.md](PLAN.md) for
the features and build stages.

## Login

reps uses the shared `pusiaczkowo.pl` login (`login.pusiaczkowo.pl`, managed in
[jablon1989/aura-the-husky](https://github.com/jablon1989/aura-the-husky),
`terraform/reps.tf`), with three groups:

| Group | Meaning |
|---|---|
| `reps` | may use reps (the API turns everyone else away) |
| `reps-admin` | may invite friends (Settings → People) |
| `reps-only` | friends invited from reps: the other apps turn them away |

An invite creates the login, puts it in `reps-only` + `reps`, and Cognito
e-mails a temporary password (the reps text comes from a trigger in
aura-the-husky). Someone who already has a login just gets `reps`.

Each person's data is keyed by their login's `sub`: exercises (`EX#`, `PREF#`),
sets (`SET#`), and small documents (`DOC#<kind>#<id>`: routines, body
measurements, goals, day notes, the routine started on a day).

## Offline

reps is an installable app (PWA: `public/manifest.json`, `public/sw.js`). The
service worker keeps the app itself; the app keeps your profile, exercises and
all your sets in IndexedDB (`src/idb.ts`) and reads everything from there.
Changes go into a sync queue (`src/sync.tsx`) that is sent in order when
there's signal. Every queued call is safe to send twice (sets have ids made on
the phone), so nothing doubles. New/renamed exercises, import and invites
need a connection.

## Layout

```
app/backend/api      Python Lambda: the API (handler.py, people.py, workouts.py, docs.py, importer.py)
                     + catalogue.json: the built-in exercises, EN/PL, by body part
app/frontend         React + Vite, dark and phone-first, EN/PL (src/i18n.tsx)
terraform/bootstrap  state bucket + GitHub deploy roles (run once, by hand)
terraform/envs/prod  the app: CloudFront, API Gateway, Lambda, DynamoDB
tools/dev_server.py  fake backend for `make local`
tools/make_icons.py  draws the app icons (PNG) into app/frontend/public/icons
```

## Run it

```bash
make local     # fake backend + app on http://localhost:5174, no AWS
make test      # backend + frontend tests
make lint
```

First deploy:

1. In aura-the-husky: `terraform apply` (reps groups, invite e-mail, tile).
2. `make bootstrap`, then set the GitHub variables `AWS_PLAN_ROLE_ARN`,
   `AWS_APPLY_ROLE_ARN`, `TF_STATE_BUCKET`, the secret `TF_VAR_ALERT_EMAIL`,
   and a `prod` environment.
3. `export TF_STATE_BUCKET=reps-tfstate-<account id>`, `make tf-init`, `make deploy`.

After that, pushes to `main` deploy through GitHub Actions.

## Google Drive backups (one-time setup)

Each person can connect their own Google Drive (Settings → Google Drive
backup). Every Monday at 03:00 (Polish time) reps writes `reps-<date>.csv`
(FitNotes-style, importable back) and `reps-<date>.json` (everything) into a
`reps` folder. reps asks only for `drive.file`: it sees just the files it made.

reps needs one Google OAuth client, kept in SSM (never in git):

1. <https://console.cloud.google.com> → new project "reps".
2. APIs & Services → Library → enable **Google Drive API**.
3. OAuth consent screen → External; app name "reps", your e-mail; scopes:
   `openid`, `email`, `.../auth/drive.file` (all non-sensitive: no review).
   Then **Publish app** (In production). In "Testing" Google drops the
   access after 7 days.
4. Credentials → Create credentials → OAuth client ID → Web application.
   Authorised redirect URIs:
   `https://reps.pusiaczkowo.pl/drive/callback`,
   `https://<cloudfront domain>/drive/callback` (`terraform output cloudfront_domain`),
   `http://localhost:5174/drive/callback`.
5. Save the id and secret in SSM:

   ```bash
   aws ssm put-parameter --region eu-central-1 --type SecureString \
     --name /reps/prod/google-oauth \
     --value '{"client_id":"<id>","client_secret":"<secret>"}'
   ```

Until the parameter exists, Settings shows "Not set up on the server yet".
The refresh tokens are stored per person in the data table (encrypted at
rest); "Disconnect" revokes the token at Google and deletes it.

Personal data (FitNotes backups, CSV exports) is gitignored: this repo is public.

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

Personal data (FitNotes backups, CSV exports) is gitignored: this repo is public.

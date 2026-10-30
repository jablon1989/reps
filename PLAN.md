# reps – plan

A gym log in the style of FitNotes, at **https://reps.pusiaczkowo.pl**.
Same setup as our other apps: S3 + CloudFront, API Gateway + Lambda (Python),
DynamoDB, Cognito, Terraform, GitHub Actions. The frontend is React + Vite.

## Decisions

| Topic | Decision |
|---|---|
| Accounts | Us two plus invited friends. No public sign-up. Shared pusiaczkowo.pl login; access by Cognito group (see README). |
| Invites | Admin page: add an email address; they get an invite email with a temporary password. Friends are reps-only: the other apps turn them away. |
| Privacy | Each log is private. An optional shared "us" page compares stats such as weekly volume and PRs. |
| Offline | Installable phone app (PWA). Sets are saved on the phone and synced when back online. |
| Language | Each user picks EN or PL. The whole app switches: interface, built-in exercises and categories. |
| Units | kg only. |
| Look | Dark, gym-style, phone-first, with big tap targets. Light mode available. |
| Import | `.fitnotes` backup (SQLite) and FitNotes CSV export, for any user. |
| Export | Each user connects their Google Drive once. Every week the app saves a CSV (FitNotes-compatible) and a JSON backup to a `reps` folder. There's also an "Export now" button. |

## Features

**Exercises**
- Built-in list with EN and PL names, grouped by body part: Chest, Back, Shoulders, Biceps, Triceps, Legs, Abs, Cardio.
- Your own exercises: name them in one or both languages, pick a category, and pin them as favourites.
- Exercise types:
  - weight + reps
  - bodyweight + reps (added weight optional)
  - cardio (time and/or distance)

**Logging**
- A day view like FitNotes: pick an exercise, then enter kg and reps.
- The weight and reps buttons step by +/- 1 kg, and the step can be set per exercise.
- Copy a previous workout.
- Rest timer with vibration.
- A comment per workout and per exercise.

**Routines**
- Saved plans (for example Push / Pull / Legs) that start a workout in one tap.

**Body**
- Body weight and measurements, with graphs.

**Goals**
- Targets per exercise (for example 100 kg bench) with progress.

**Records and stats**
- PRs:
  - best weight for each rep count (1RM … 15RM)
  - estimated 1RM (Epley)
  - best volume set and best session
  - a PR badge as soon as you beat one
- Graphs per exercise: max weight, estimated 1RM, volume, reps, over 1 m / 3 m / 1 y / all.
- Volume per body part: sets and tonnage per week and per month.
- Calendar of training days, streaks, workouts per week, time trained.
- The home screen shows recent PRs, this week's volume by body part, and the streak.

## Build stages

1. **Skeleton** ✅
   - repo from the to-do-list template, Terraform (bootstrap + prod)
   - `reps.pusiaczkowo.pl`, shared login with reps groups, admin invites
   - CI, and a tile on pusiaczkowo.pl
2. **Logging** ✅
   - exercise catalogue (EN/PL)
   - custom exercises and favourites
   - the day log
   - the rest timer
3. **Import** ✅
   - `.fitnotes` and CSV importer
   - our history loaded in
4. **Records and stats** ✅
   - PRs and PR badges
   - graphs
   - volume per body part
   - calendar and streaks
   - home screen
5. **Offline** ✅
   - PWA install
   - local queue and sync
6. **Routines, body weight and measurements, goals, comments** ✅
7. **Google Drive export** ✅
   - one-time connect (OAuth)
   - weekly scheduled export and "Export now"
8. **Shared "us" stats page** ✅
   - opt-in sharing, summary sent from the phone
   - this week, workouts/kg per week, head to head on common lifts, PRs, body parts, all time

## Needed from you later

- A Google Cloud project with an OAuth client, saved in SSM: steps in the
  README ("Google Drive backups").
- The bootstrap apply for the deploy roles, which I can't run myself.
- The aura-the-husky apply (reps groups, invite e-mail, tile) before the first reps deploy.

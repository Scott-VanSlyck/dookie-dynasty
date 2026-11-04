# Dookie Dynasty site

Website for a 12-team superflex dynasty fantasy football league on Sleeper.
Main feature: **trade rewind** — score every trade at trade time, +3 months, +1 year and today.

## League
- Current league ID (2026): `1313238117100056576`
- Earlier seasons: follow `previous_league_id` (2025 `1180090570030120960`, 2024 `1048300314966831104`, 2023 `958843674790510592`)
- Scoring: PPR, 4-pt pass TD, +0.5 TE reception bonus. Lineup: QB, 2 RB, 2 WR, TE, 2 FLEX, SUPER_FLEX.
- `roster_id` → manager mapping can change between seasons; always resolve per season.

## Data sources
- Sleeper API (free, no key): trades via `/league/{id}/transactions/{week}` (weeks 0–18),
  weekly player points via `/league/{id}/matchups/{week}` (`players_points`, `starters`),
  drafts via `/league/{id}/drafts` and `/draft/{id}/picks`. Fetch `/players/nfl` (~5 MB) at most once a day.
- Trade values: DynastyProcess `files/values-players.csv` and `values-picks.csv` on GitHub
  (dynastyprocess/data). Weekly snapshots live in the file's git history back before 2023.
  Use `value_2qb` (superflex). Map to Sleeper IDs with `db_playerids.csv`.

## Trade scoring plan
- Value: sum each side's DynastyProcess value at the chosen date. Picks use pick value until drafted, then the drafted player.
- Production: starter points scored for the receiving roster up to the chosen date.
- FAAB shown, not scored. Raw sums for now; consider a consolidation ("best player") adjustment later.

## Build order
1. Setup ✅  2. Data download script  3. Trade list page  4. Trade rewind scoring
5. Manager pages  6. League history  7. Hosting + weekly auto-refresh

## Dev
- Node.js is at `C:\Program Files\nodejs` (may need adding to PATH in a fresh shell).
- `npm run dev` starts the site at http://localhost:5173. `npm run build` checks types and builds.
- React + TypeScript + Vite.

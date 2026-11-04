# Dookie Dynasty site

Website for a 12-team superflex dynasty fantasy football league on Sleeper.
Main feature: **trade rewind**, which judges every trade at several checkpoints (see below).

## League
- Current league ID (2026): `1313238117100056576`
- Earlier seasons: follow `previous_league_id` (2025 `1180090570030120960`, 2024 `1048300314966831104`, 2023 `958843674790510592`)
- 2023 draft was the 19-round startup; 2024+ are 3-round linear rookie drafts.
- Scoring: PPR, 4-pt pass TD, +0.5 TE reception bonus. Lineup: QB, 2 RB, 2 WR, TE, 2 FLEX, SUPER_FLEX.
- `roster_id` → manager mapping can change between seasons (13 managers have held the 12 teams); always resolve per season via `rosterOwners`.

## Data pipeline
`npm run data` = `scripts/fetch-data.ts` (downloads to `data/raw/`, gitignored, cached) then
`scripts/build-data.ts` (writes `public/data/*.json`, committed; the site reads these).
- Sleeper API (free, no key): league, users, rosters, transactions (weeks 0–18), matchups, drafts + picks.
  `/players/nfl` is fetched at most once a day.
- Trade values: DynastyProcess `files/values.csv` (players **and** picks), one snapshot per weekly commit
  in the dynastyprocess/data git history since 2023-06. Uses `value_2qb` (superflex).
  `fp_id` → Sleeper ID via `db_playerids.csv`, falling back to name + position.

### Output files (public/data/)
- `league.json`: seasons (lastScoredWeek, playoffWeekStart, weekDates, draft), managers, rosterOwners
- `trades.json`: `{id, season, week, date, sides: [{rosterId, userId, players[], picks[], faab}]}`; pick keys are `season-round-originalRosterId`
- `values.json`: `dates[]` plus series aligned to it: `players[sleeperId][]` and `picks[key] = {season, round, orig, slot, playerId, draftDate, values[]}`
- `scores.json`: `scores[season][week] = [{rosterId, matchupId, points, starters{pid: pts}, bench{pid: pts}}]`
- `players.json`: `{pid: {name, pos, team}}`

### Draft lottery and pick valuation
- The league runs a **draft lottery and swaps picks on draft day**, so Sleeper's `draft_order` is only the projected
  (pre-lottery) order. `resolveDraft()` in build-data matches each pick (season-round-origRoster) to a pick its owner going
  into the draft actually made: owner at projected slot → owner anywhere in the round → leftovers by projected order.
  Pick assets carry `projSlot` (projected), `slot` (actual), `draftedBy` (team that made the pick) and `playerId`.
- Before the draft a pick is valued by tier only (Early 1-4 / Mid 5-8 / Late 9-12 of its projected slot, from Jan 10;
  "Mid" before that), never the exact slot. DP lists the upcoming draft as exact slots, so tiers average those.
- After the draft a pick is worth the drafted player **only for the team that made the pick**. A team that traded the
  pick away keeps its last pre-draft value (`pickSeries()` in `src/rewind.ts`). Points follow the same rule.
- Picks further out than DynastyProcess lists use the furthest year it has.

### Scoring (from Sleeper, applied per season)
TE premium every season (rec 1 + bonus_rec_te 0.5). 2023 had 0.5 first-down bonuses for RB/WR/TE and 3/5 yardage bonuses;
2024+ use rec_fd 0.25 / rush_fd 0.5 and 2/4 yardage bonuses; 3 WR starters from 2024. Points in `scores.json` come from
Sleeper already scored with that season's rules. DynastyProcess values are generic superflex (no TE premium).

### Known data issue
DynastyProcess history is noisy each Jan–Mar for rookies and picks (e.g. 2025 2nd-round picks ~5x for Feb 7–28, 2025).

## Trade rewind checkpoints
Day of trade · End of that season (after the championship week) · 1 year later · Today, plus each asset's peak value since the trade.
Each checkpoint shows:
- **Value:** sum of each side's superflex value on that date.
- **Production:** starter points scored for the receiving roster between the trade and that date.
FAAB is shown but not scored (trades where a side got only FAAB are labeled "FAAB deal", no winner). Raw sums for now; consider a consolidation ("best player") adjustment later.
- Logic lives in `src/rewind.ts`. Verdict tiers by margin (gap ÷ bigger side): <10% Even, <25% Slight edge, <50% Clear win, <75% Big win, else Fleeced.
- Production uses `side.tenure` (built in `build-data.ts` from drop transactions): points count only while the player stays on that roster. A received pick produces points only if that team made the pick.
- "End of season" = Tuesday after the final scored week; week dates are estimated from Labor Day.
- Trade list sort "Biggest value gap today" ranks by absolute value gap, not margin.

## Build order
1. Setup ✅  2. Data pipeline ✅  3. Trade list page ✅  4. Trade rewind scoring ✅
5. Manager pages ✅  6. League history ✅  7. Hosting + daily auto-refresh ✅

## Hosting
- Live at https://scott-vanslyck.github.io/dookie-dynasty/ (GitHub Pages, source: GitHub Actions).
- `.github/workflows/deploy.yml` rebuilds data (`npm run data`) and redeploys on every push to main, daily at 11:00 UTC, and on demand.
  `data/raw` is kept between runs with actions/cache.
- Vite `base` is `/dookie-dynasty/` for `build` and `preview`; `npm run dev` stays at `/`. Always load data with `import.meta.env.BASE_URL`.

## Site structure
- Hash routing (react-router `HashRouter`) so it works on GitHub Pages. Pages in `src/pages/`, shared pieces in `src/components/`.
- `src/data.ts` loads `public/data/*.json` once and holds the types + name helpers.
- Manager stats in `src/managers.ts`: per trade, net = own side minus the average of the other sides (value today, points since trade).
  `/managers` is a leaderboard by net value; `/managers/:userId` shows record, best/worst trade, partners and all trades.
  Use `ManagerLink` for manager names. CSS: `.pos` is the position badge; use `.gain`/`.drop` for green/red numbers.
- History (`src/history.ts`, `/history`): champions, standings by season, all-time table, records, head-to-head.
  The league plays the weekly median, so Sleeper records count two games per week; standings come straight from roster
  settings (`league.json` `seasons[].standings`, incl. `maxPf` for lineup %). Head-to-head counts real matchups only.
  Playoff places come from `winners_bracket` (`seasons[].playoffs`); Sleeper pre-fills a projected bracket, so ignore it
  until `lastScoredWeek >= playoffWeekStart`.
- Trade list filters live in the URL (`?season=&manager=&q=&sort=`) so filtered views can be shared.

## Dev
- Node.js is at `C:\Program Files\nodejs` (may need adding to PATH in a fresh shell). Node 26 runs the `.ts` scripts directly.
- `npm run dev` starts the site at http://localhost:5173. `npm run build` checks types and builds.
- React + TypeScript + Vite. GitHub: Scott-VanSlyck/dookie-dynasty.
- Edit text files with the editor tools, not PowerShell `Get-Content`/`Set-Content` (Windows PowerShell 5.1 mangles UTF-8 characters).

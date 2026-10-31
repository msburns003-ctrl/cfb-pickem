# Pre-Publish Security Review — Pick Result Colors

**Scope:** Branch `claude/pick-status-colors`. On the This Week tab, the team a member picked was filled with the site's red primary color, which read as a loss. Files touched: `shared/outcome.ts` (new `pickResult` helper), `client/src/components/GameCard.tsx`, `client/src/components/UpsetPickPanel.tsx`, `tests/outcome.test.ts`, `tests/schedule.test.ts`. No server routes, schema, auth, storage or dependency changes.

## What changed

- The picked team's button is now a soft tint with a colored border and text (instead of a solid fill), colored by how the pick turned out: **green** won, **red** lost, **grey** push (exactly on the spread), **blue** not decided yet (before kickoff, in progress, or an unsaved selection).
- Graded games use the official grade. A final score that isn't graded yet uses the same unofficial result the card already shows in text ("unofficial until the week is graded").
- Locked picks keep full color instead of being faded like other locked buttons. Team logos on the picked button no longer need the white circle behind them, since the tint is light.
- The "+N points" result text, on game cards and the underdog bonus pick, is green instead of the red primary color. A graded spread push now reads "Push · 0 points" instead of a red "0 points".
- `tests/schedule.test.ts`: one import test used sample games dated October 31, 2026, so it started failing once those kickoffs passed in real time (line refreshes skip games that have kicked off). The test now pins the clock to October 30. Test-only change; app behavior unchanged.

## Findings

1. **Display only.** Colors are computed in the browser from data the member already receives (their own picks, game status and scores). No new data is requested or exposed, and nothing about other members' picks is revealed.
2. **Grading untouched.** `pickResult` only reads existing results and `livePickStatus`; it doesn't feed scoring, standings or anything saved.
3. **Storage rule respected.** No `localStorage`, `sessionStorage` or `indexedDB`.
4. **`API_BASE` placeholder** untouched.

## Testing

`npm run check` passes, `npm test` passes (67 tests, including 4 new ones for `pickResult`), `npm run build` succeeds. The production build was checked at phone width in light and dark mode with mocked data: a graded win (green), a graded loss (red) and an unplayed pick (blue).

## Conclusion

A presentation-only change. **Cleared to publish.**

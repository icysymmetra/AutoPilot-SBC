# Room To Grow rating ceiling repair

## Evidence

The reported challenge is Room To Grow in Intro to Upgrade SBCs. Its public requirement list confirms eleven bronze players and a maximum team rating of 64: https://futmind.com/challenges/13/room-to-grow . The user completed it manually and identified Solve Squad as the failing action.

A replay using eleven owned 50-rated bronze players, with no other player pool restrictions, failed before the repair. The failure identified the team_rating rule with op=max, actual rating 50, target 64, and all eleven players present. Its diagnostics incorrectly reported rating_shortfall. This confirms the solver defect independently of the user's available club inventory; the original attempt's full payload was not captured.

## Cause and change

getTeamRatingTarget selected a maximum rule as an optimization floor, and evaluateRule rejected ratings below every rating target without checking its operator. Maximum rules now stay out of rating improvement and shortfall analysis. Validation compares minimum, maximum, and exact ratings correctly. Separate lower and upper rating requirements retain the lower bound for optimization.

## Verification

- node --test tests/solver-bronze-max-rating.mjs: five tests passed. The main replay was observed failing before the change and passing afterward.
- node tests/solver-max-rating-worker.cjs: packaged version 1.11.7 solved the maximum-rating replay, selected eleven players, and produced team rating 50. The same pool remained infeasible for a minimum rating of 64.
- Nineteen solver, settings, native hook, and points regression checks passed.
- The already-completed Room To Grow cannot be replayed as an active challenge in this account. No SBC was submitted during this diagnosis.

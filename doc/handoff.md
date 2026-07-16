# Handoff for Next Session

## Current State
- Repo currently only has documentation under `/doc`.
- No application code has been created yet.
- The design has been agreed:
  - React + PWA frontend
  - SVG for the route diagram
  - TDX as the realtime source
  - No database, no accounts, no reports
  - `direction` is a UI state, not part of `appsettings.json`
  - Start in 去程 by default; user can switch to 回程
  - One shared `stationNames` array in config, read forward for 去程 and backward for 回程

## Confirmed UI Rules
- Route is 松山車站 -> 玉成國小.
- Use an abstract equal-distance line-and-circle diagram.
- Station names stay on the left side.
- Vehicles are rendered as parallel lines on the right side when multiple buses are within 10 minutes.
- Each bus line shows the bus number at the top.
- ETA is shown at the horizontal level of each station.
- 去程 moves visually bottom-to-top.
- 回程 moves visually top-to-bottom.
- Vehicles disappear after passing the terminal station.

## Config Decisions
- `appsettings.json` should include:
  - `timeThresholdMinutes = 10`
  - `pollingIntervalSeconds = 5`
  - `busNumbers` array
  - `stationNames` array
- Do not store `direction` in config.
- Do not duplicate station names for return direction.
- Use indexes:
  - 去程: `0 ... n-1`
  - 回程: `n-1 ... 0`

## Suggested Next Implementation Step
1. Create the initial project scaffold.
2. Add `appsettings.json` with the agreed structure.
3. Implement the TDX client adapter.
4. Implement SVG route rendering and bus lane projection.
5. Add direction toggle state in the UI.
6. Add 5-second polling and simple loading/error states.

## Notes
- Keep the first version simple and readable on mobile.
- Prioritize correctness of the route/ETA mapping over geographic accuracy.
- If the next session needs an exact file format, start by defining the config schema before writing UI code.

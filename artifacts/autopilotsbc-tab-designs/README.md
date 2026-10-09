# AutopilotSBC settings mockups

## Selected design: 2

`02-guided.html` is the current focused revision. It uses deep blue surfaces, mint active states, amber protection cues and distinct setting icons. It keeps the unified surface and top categories. The heading and tabs sit at the top of the scrolling content, so they scroll away with the settings instead of staying pinned. There is no overflow menu or Find a setting action in this design.

Rating handles show their OVR values; tier presets use card-quality cues. FC27 base-card permissions expose Bronze, Silver and Gold only. Each quality maps to both legacy solver bucket keys. Loading an old partial prototype preference expands it to the whole quality, avoiding a hidden restriction. Exclusions use whole selectable rows with a visible Excluded state and keyboard focus retained after changes.

`selected-controls.js`, `selected-layout.js` and `selected.css` and `palette.css` extend the shared prototype controls and settings state. The other four pages remain earlier alternatives. `review-selected.cjs` checks the selected design, including actual mouse/touch interaction, keyboard selection, persistence, the scrolling header contract, and alignment at desktop, tablet and phone sizes. The local runner completes 81 checks (`selected-review.json`). Current captures are named `02-color-*` and `02-focused-*`.

```powershell
node artifacts/autopilotsbc-tab-designs/review-selected.cjs
```

Open `http://127.0.0.1:8766/` while the preview server is running.

```powershell
python -m http.server 8766 --bind 127.0.0.1 --directory artifacts/autopilotsbc-tab-designs
```

## Pages

| File | Treatment |
|---|---|
| 01-native.html | Balanced panels |
| 02-guided.html | Unified surface |
| 03-inspector.html | Compact rows |
| 04-editorial.html | Quiet groups |
| 05-builder.html | Card detail |

All pages use top-bar tabs: Player pool, Card types and Exclusions. There is no solver launch area. The heading, tabs, settings and save actions share a centered frame within the web app content area.

In design 2 the heading is compact and scrolls with the content. Only the native EA top bar and the save bar stay fixed. Auxiliary actions follow the layout of the work instead of competing with the tabs. Changelog lives in the version chip next to the title. Source code and Support my work are quiet links in the project footer at the end of the page. Reset sits with Discard changes and Save Global, separated by a divider because it is destructive.

The pages use `spec.js`, `controls-factory.js`, `control-layouts.js`, `app.js`, `controls.css` and `tab-refinement.css`. `spec.js` exports the actual bridge defaults and help. Preview preferences are stored separately per design and never touch extension storage.

Rating presets adjust only the OVR range. The slider supports mouse, touch, arrows, Page Up/Down, Home and End. Card selection retains at least one supported type, matching the source normalizer. Help expands next to each field. Exclusions use searchable sample league/nation lists and retain the native player item-details entry point.

See `revision-notes.md` for the Gemini ideas carried forward and current tradeoffs. Gemini's original pages and theme are preserved in `../autopilotsbc-gemini-reference-20261009/`. `insertion-method.md` documents native EA tab registration; The selected design is implemented in the native Autopilot tab.

## Review artifacts

`render-review.cjs` writes general layout screenshots and `layout-review.json`. `verify-controls.cjs` covers the other four alternatives. Use `review-selected.cjs` for design 2. Local headless rendering is used when T3 preview automation is unavailable.

```powershell
node artifacts/autopilotsbc-tab-designs/render-review.cjs
node artifacts/autopilotsbc-tab-designs/verify-controls.cjs
```

## Rebuilding and integration checks

Run `python scripts/build-settings-assets.py` to regenerate the approved production controls and stylesheet. Run `python scripts/package-extension.py` to package the current manifest version.

Browser checks require Playwright (`npm install --no-save --package-lock=false playwright` and `npx playwright install chromium`). An existing installation can be selected with `PLAYWRIGHT_MODULE_PATH`; an optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides its Chromium executable. Serve the repository root on port 8767 before running `node tests/autopilot-settings-ui.cjs` or `node tests/solver-max-rating-worker.cjs`. The worker check requires a packaged build.

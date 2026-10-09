## Scrolling header and relocated actions, current design 2

The fixed header was the wrong call. It kept the title and tabs pinned and forced four utility controls into the tab row, which crowded the top. The current revision moves `.workspace-head` inside `.page-scroll`, so the heading and tabs scroll away with the settings. Only the native EA top bar and the save bar remain outside the scroll flow.

The auxiliary actions were redistributed by intent instead of being lined up together:

- Changelog is reachable from the version chip beside the title, with an arrow that indicates it opens something.
- Source code and Support my work are quiet text links in a project identity footer at the end of the page. They have no button borders, so they read as reference links rather than primary actions.
- Reset Global sits inside the save action cluster, separated from Discard changes and Save Global by a divider. It is destructive, so it belongs next to the operations that can discard work.

The footer anchors the identity block to the same center axis as the rest of the page, and it holds at 390 and 768 widths. `review-selected.cjs` now asserts the opposite of the old fixed-header contract: the header position is not `fixed`, it lives inside the scroller, and its top edge and the tabs move by the same amount as the scroll delta. 81 checks pass with 48 measured scroll/viewport combinations and no page errors or external requests.

## Color and hierarchy rework, current design 2

The neutral revision flattened the hierarchy. The current pass uses deep blue surfaces, mint for active controls and navigation, amber for excluded/protected items, and the three item metals for base qualities. Rating selection gets a distinct surface and larger value display. Source controls now have specific icons, clearer names and visible one-line explanations. All original settings keys and three FC27 quality choices remain wired to the same state.

Shared T3 preview validation covered 48 section/scroll/viewport combinations, setting labels, help, rating presets, quality choices, exclusions and Discard. A final type-size adjustment was checked for row overflow. See color-review.json and screenshots/02-color-*. The local runner refreshed selected-review.json and the 02-focused captures. Desktop scrolled and card screenshots were visually inspected again at full resolution. The current preview is 02-guided.html.

## FC27 quality correction, current design 2

The previous revision wrongly carried forward the FC26 Common/Rare UI. Design 2 now exposes only Bronze, Silver and Gold, as specified by EA's FC27 item model:
https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-fut-deep-dive#item-rarity

The existing solver still classifies base players into six legacy buckets. The prototype adapter enables or disables both keys together for each quality. Loading an old partial preference expands it to the whole quality. This changes the selected mockup only; production schema migration and native tab integration remain pending.

Neutral surfaces and white selection indicators keep quality colors on the item illustrations. Lime identifies the enabled Save action. Disabled Save is neutral gray. The card shells are illustrative quality cues, not exact FC27 asset reproductions. Historical Common/Rare reference art is retained only as research history.

The focused browser review passed the interaction and layout checks, including paired-key mapping, preference migration and persistence. It measured 48 scroll/viewport combinations at 1920, 1280, 768 and 390 pixels with no page errors or external requests. Desktop and phone captures were inspected after rendering.

The other four mockups below are older explorations and still contain the previous schema. Their descriptions are historical.

# Revision after the Gemini review

## Focused revision of design 2

The next user review rejected the control styling, the sticky header behavior, and the overflow menu. Design 2 now has its own refined controls while retaining the existing draft state and registry help. Scroll gutters are reserved on both sides; heading, page and footer use the same explicit width and center axis. The heading and tabs later moved inside the scrolling region, as recorded above.

The rating slider has numeric handles and inline quality presets. Exclusions are whole-row choices with selected state, removable chips and retained keyboard focus. The initial chip space is reserved so the list does not shift after the first selection. Find a setting and the overflow button are absent from design 2.

Preview automation later reported no available host; the review used the established headless fallback. `selected-review.json` records the current checks and `02-focused-*` screenshots include top, scrolled, selected and unselected states.

The Gemini pages are preserved at `../autopilotsbc-gemini-reference-20261009/`.

## Ideas carried forward

- Rating presets use the solver's actual bronze/silver/gold boundaries. They change only the rating range, not card permissions or player sources.
- Quality colors and card silhouettes help identify bronze, silver and gold.
- The fourth treatment has a short summary derived from the actual draft, with no simulated inventory or club totals.

## Navigation and alignment

All five pages use the same top-bar categories: Player pool, Card types and Exclusions. Arrow keys, Home and End navigate the tabs. Category sidebars, accordion navigation and solver launch areas are absent.

One content frame defines the horizontal alignment of the heading, tabs, panels and save actions. It is centered within the web app area after the EA sidebar. Phone widths retain the same alignment with smaller gutters. Repeated headings inside the rating and base-card panels were removed.

## Header and project actions (superseded)

This section described the fixed header with four bordered utility buttons. It no longer matches the design. See "Scrolling header and relocated actions" above for the current behavior.

## Visual treatments

1. Balanced panels: separate rating limits from pool options.
2. Unified surface: a single panel with a rating range above the option grid.
3. Compact rows: a narrow, flat form with fewer containers.
4. Quiet groups: restrained section boundaries and a draft summary.
5. Card detail: small card-shape cues in the Common/Rare matrix.

## Limits

These are interactive mockups, with the existing source-exported defaults and help. Each design saves into its own preview storage. League/nation lists are marked sample data. Player exclusions retain the existing item-details entry point. The extension and native tab integration have not been changed.

`interaction-review.json` records slider, preset, navigation, exclusion, save and reset checks. `layout-review.json` records measured alignment and overflow at desktop, laptop and phone sizes. Images in `screenshots/` are rendered captures.

## Critique pass, 2026-10-09

Reviewed the live prototype at 1440, 1920, 768 and 390 px with screenshots and geometry measurements.

- Content axis: the rating editor and the card quality tiles were centred inside the panel at 610px and 650px, which put them 106px right of every heading and toggle below. Both now span the panel content box (334px axis at 1440).
- Heading system: the three tabs used three different treatments. Pool used a 12px uppercase eyebrow, cards used 17px, exclusions used 21px. All three now use 16px, weight 600, sentence case.
- Heading rank: section headings at 12px sat above 14px item names. Section headings now outrank their contents.
- Rail labels: rating boundary ticks existed in markup but rendered at zero width. They now render, and the rail bands carry edge separators.
- Keyboard copy: the helper promised 'Arrow keys adjust by 1 OVR' while the maximum handle is clamped at the current value. Copy now reads 'Drag either handle. Arrow keys move by 1 OVR.' and names the ceiling when it is below 99.
- Reset button: rendered with a visible border despite a transparent intent. Specificity override applied.
- Footer to save bar gap at 1920 reduced from 135px to 118px.
- Exclusion state given a bordered chip so the whole-row target reads as a control, not a caption.
- Mobile save bar: Reset now sits left, Discard and Save right, removing the merged 14px gap.

Verification: review-selected 81 checks and 48 layouts, render-review 45 layouts, verify-controls across all four other designs. No errors and no external requests.

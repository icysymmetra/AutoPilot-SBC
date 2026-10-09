# Native FC27 tab insertion

## Verified local evidence

FC Enhancer is at the local `FC-ENHANCER` checkout, manifest version 27.0.0.0. Its content script loads `js/main.js`, `js/vendor.js` and `js/index.js`. The tab registration is in the loaded `main.js` bundle.

- `js/main.js:16946–16971`: Enhancer wraps `UTGameTabBarController.prototype.initWithViewControllers`. It creates `UTGameFlowNavigationController`, sets an `EnhancerController` as its root, creates and initializes `UTTabBarItemView`, sets its label and icon classes, assigns it to `navigation.tabBarItem`, appends that navigation controller and calls the previous initializer.
- `js/main.js:11707–11722`: the root controller extends `EAViewController`, returns the settings view through `_getViewInstanceFromData`, provides its navigation title, and enables native navigation in `viewDidAppear`.
- `js/main.js:18607–18734`: the settings view extends `EAView`. It creates and caches a root element through `_generate`/`getRootElement`. It uses an `EAFilterBarView` for direct setting tabs.
- `js/main.js:22711–22745`: Trader uses the same native registration pattern. Its fixed tag and mobile list manipulation are specific to that feature.

Read-only evaluation in the FC27 page confirmed the availability of `EAView`, `EAViewController`, `UTGameTabBarController`, `UTGameFlowNavigationController` and `UTTabBarItemView`, including the relevant native initialization methods. `UTView` and `UTViewController` were absent.

## Autopilot integration approach

Use an `EAViewController` and `EAView` for the chosen design. Register one navigation controller through the existing native initializer. Preserve the current initializer, its `this` context, arguments, return value and other extensions' controllers. Add only the Autopilot controller, with a unique marker and an unused tab tag. Do not copy Enhancer's fixed numeric tags or its Trader mobile truncation.

The wrapper and controller registration need separate guards: reinjection must neither wrap the same initializer repeatedly nor append a second tab to an already populated controller list. Reinjection after another extension changes the initializer must preserve that newer wrapper too.

Mount inside the native view, refresh settings on appearance, and dispose listeners and pending UI work when the native view is destroyed. Keep CSS inside the Autopilot root. Keep settings tabs inside that root rather than creating extra EA sidebar tabs for each category.

## Reuse existing extension paths

The settings surface currently begins at `page/ea-data-bridge.js:9624` (`ensureGlobalSettingsSection`). Existing shared paths include:

- `createSolverToggleBinder`, line 25955.
- `setGlobalSolverSettings`, line 26964.
- `resetGlobalSolverSettings`, line 27608.
- Player, league and nation exclusion setters, lines 27680, 27748 and 27816.
- Existing global hydration/refresh at line 9030.
- Existing sequence hub entry at line 23995.

Bind the selected UI to the existing preference handlers. Global preferences stay in the existing store and retain their precedence beneath challenge and run overrides. This tab presents settings without a solver launch area. Existing Sequence Solver access stays in its current workflow. Solve Squad, Multi Solve, Solve Entire Set and Solve Points remain on their challenge screens. Buy Concepts stays with the solved concept result.

Once the native tab works, remove only Autopilot's global group from EA Settings and route the existing global settings entry points to the new tab. Verify reinjection, returning from another tab, saved preferences, challenge overrides, contextual workflows and coexistence with other installed custom tabs.

## Current artifact scope

The five HTML files are interactive local design prototypes. They do not register a tab in EA, change extension preferences, or call the solver. Native registration will be wired to the selected design. The prototype localStorage keys are separate from extension storage.

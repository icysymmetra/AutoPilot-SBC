window.AutoPilotSpec = {
  "version": "1.11.2",
  "fields": [
    {
      "key": "useUnassigned",
      "path": "solver.useUnassigned",
      "idSuffix": "use-unassigned",
      "label": "Use Unassigned",
      "help": "Allow Unassigned players into solver pools, and let duplicate-backed club copies bypass normal pool filters.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": [
        "useDupes"
      ]
    },
    {
      "key": "onlyStorage",
      "path": "solver.onlyStorage",
      "idSuffix": "only-storage",
      "label": "Only Storage",
      "help": "Restrict normal pool selection to players that also have a matching copy in SBC storage.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    },
    {
      "key": "excludeTradable",
      "path": "solver.excludeTradable",
      "idSuffix": "exclude-tradable",
      "label": "Exclude Tradable",
      "help": "Avoid using tradable players unless they are locked into the squad.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    },
    {
      "key": "excludeSpecial",
      "path": "solver.excludeSpecial",
      "idSuffix": "exclude-special",
      "label": "Exclude Special",
      "help": "Avoid using special cards except TOTW, TOTS, and inform items. Those are controlled separately.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    },
    {
      "key": "useTotwPlayers",
      "path": "solver.useTotwPlayers",
      "idSuffix": "use-totw-players",
      "label": "Use TOTW/TOTS Players",
      "help": "Allow Team of the Week, Team of the Season, and inform cards in solver pools and rating optimization.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    },
    {
      "key": "useEvolutionPlayers",
      "path": "solver.useEvolutionPlayers",
      "idSuffix": "use-evolution-players",
      "label": "Use Evolution Players",
      "help": "Allow evolution cards in generated solutions. When off, evolution cards are blocked (including unassigned duplicates) except already locked required players.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    },
    {
      "key": "allowConceptPlayers",
      "path": "solver.allowConceptPlayers",
      "idSuffix": "allow-concept-players",
      "label": "Fallback on Concept Players (experimental)",
      "help": "Allow concept fallback after owned players fail. Concept squads can be preview-applied, but cannot be submitted until those players are owned.",
      "scopes": [
        "challenge",
        "global",
        "multi",
        "set"
      ],
      "legacyKeys": []
    }
  ],
  "buckets": [
    {
      "key": "common_bronze",
      "label": "Common Bronze",
      "quality": "bronze",
      "rarity": "common"
    },
    {
      "key": "rare_bronze",
      "label": "Rare Bronze",
      "quality": "bronze",
      "rarity": "rare"
    },
    {
      "key": "common_silver",
      "label": "Common Silver",
      "quality": "silver",
      "rarity": "common"
    },
    {
      "key": "rare_silver",
      "label": "Rare Silver",
      "quality": "silver",
      "rarity": "rare"
    },
    {
      "key": "common_gold",
      "label": "Common Gold",
      "quality": "gold",
      "rarity": "common"
    },
    {
      "key": "rare_gold",
      "label": "Rare Gold",
      "quality": "gold",
      "rarity": "rare"
    }
  ],
  "defaults": {
    "ratingRange": {
      "ratingMin": 0,
      "ratingMax": 99
    },
    "allowedCardBuckets": [
      "common_bronze",
      "rare_bronze",
      "common_silver",
      "rare_silver",
      "common_gold",
      "rare_gold"
    ],
    "useUnassigned": true,
    "onlyStorage": false,
    "excludeTradable": false,
    "excludeSpecial": true,
    "useTotwPlayers": true,
    "useEvolutionPlayers": false,
    "allowConceptPlayers": false,
    "excludedPlayerIds": [],
    "excludedLeagueIds": [],
    "excludedNationIds": [],
    "allowedGlobalLeagueIds": [],
    "allowedGlobalNationIds": [],
    "extraExcludedLeagueIds": [],
    "extraExcludedNationIds": []
  },
  "changelog": [
    {
      "version": "1.11.2",
      "date": "2026-10-08",
      "headline": "Points SBCs and FC27 concept data",
      "summary": "Added Solve Points in the native Work Area and repaired FC27 concept catalog and prices.",
      "details": [
        "Solve Points searches EA-eligible owned players, uses EA item scores, respects solver filters and the native selection limit, and preserves existing selections.",
        "Points selections continue through EA Review Selection and its score submission flow. Automatic set and sequence submission of points SBCs is not supported.",
        "Updated concept player data to FC27 and replaced the retired price API with current console and PC CDN prices.",
        "Added the missing concept module to worker resources and guardrails against unsupported SBC requirements."
      ]
    },
    {
      "version": "1.11.1",
      "date": "2026-10-08",
      "headline": "FC27 web app hook fixes",
      "summary": "Restored Solve Squad clicks and updated FC27 inventory and reward hooks.",
      "details": [
        "Fixed Solve Squad inheriting the disabled state of EA's Exchange Players button.",
        "Updated transfer list and unassigned item fetching to use FC27's current services.",
        "Updated item pile and SBC requirement enum lookup to use EA's current runtime values.",
        "Fixed response payload handling and updated reward dialog detection."
      ]
    },
    {
      "version": "1.11",
      "date": "2026-09-18",
      "headline": "FC27 support",
      "summary": "AutopilotSBC now works on the FC27 Web App.",
      "details": [
        "Updated the extension for the FC27 Web App.",
        "Fixed player fetching, which returned no players because of a change in how EA returns club and item data.",
        "Fixed challenge and set images so they load from the current FC content path.",
        "Updated the extension name and description to FC27."
      ]
    }
  ]
};

const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const { buildSolverContext, solveSquad } = await import(
    pathToFileURL(`${process.cwd()}/solver/solver.js`).href
  );

  const requirements = [
    {
      type: "player_rarity_group",
      op: "min",
      count: 2,
      target: 2,
      values: ["rare"],
      label: "Rare: Min. 2 Players",
    },
    {
      type: "player_quality",
      op: "exact",
      count: -1,
      target: 7,
      values: ["gold"],
      label: "Player Quality: Exactly Gold",
    },
    {
      type: "players_in_squad",
      op: "exact",
      count: 7,
      target: 7,
      values: [7],
      label: "Number of Players in the Squad: 7",
    },
  ];

  const player = ({ id, rare = false, concept = false, rating = 75 }) => ({
    id: concept ? `concept:${id}` : id,
    definitionId: id,
    conceptId: concept ? id : null,
    name: `${concept ? "Concept" : "Owned"} ${id}`,
    rating,
    rarityId: rare ? 1 : 0,
    leagueId: (id % 7) + 1,
    nationId: (id % 9) + 1,
    teamId: (id % 11) + 1,
    marketPrice: concept ? 350 : null,
    price: concept ? 350 : null,
    concept,
  });

  const oneMissingRarePlayers = [
    player({ id: 1001, rare: true }),
    ...Array.from({ length: 20 }, (_, index) =>
      player({ id: 1100 + index }),
    ),
    ...Array.from({ length: 20 }, (_, index) =>
      player({ id: 2000 + index, rare: index < 8, concept: true }),
    ),
  ];

  const solve = (players) => {
    const context = buildSolverContext({
      players,
      requirementsNormalized: requirements,
      requiredPlayers: 7,
      filters: {
        allowConceptPlayers: true,
        excludeSpecial: true,
        useTotwPlayers: false,
        useEvolutionPlayers: false,
        allowedCardBuckets: ["common_gold", "rare_gold"],
      },
      debug: true,
      optimize: {
        restartTimeBudgetMs: 8000,
      },
    });
    return solveSquad(context);
  };

  const result = solve(oneMissingRarePlayers);
  const conceptCount = result?.stats?.conceptCount ?? 0;

  console.log("[solver-concept-minimization] one missing rare", {
    solved: result?.solved,
    conceptCount,
    solution: result?.solutions?.[0] ?? [],
    concepts: (result?.conceptPlayersUsed ?? []).map((item) => item.name),
  });

  assert.equal(result?.solved, true, "fixture should be solvable");
  assert.equal(
    conceptCount,
    1,
    "solver should use owned gold commons and only buy the missing rare",
  );

  const enoughOwnedPlayers = [
    player({ id: 3001, rare: true, rating: 78 }),
    player({ id: 3002, rare: true, rating: 78 }),
    ...Array.from({ length: 12 }, (_, index) =>
      player({ id: 3100 + index, rating: 78 }),
    ),
    ...Array.from({ length: 40 }, (_, index) =>
      player({ id: 4000 + index, rare: index < 8, concept: true, rating: 75 }),
    ),
  ];

  const ownedResult = solve(enoughOwnedPlayers);
  const ownedConceptCount = ownedResult?.stats?.conceptCount ?? 0;
  const ownedConceptCountBeforeRefine =
    ownedResult?.stats?.refinement?.before?.conceptCount ?? 0;

  console.log("[solver-concept-minimization] enough owned", {
    solved: ownedResult?.solved,
    conceptCountBeforeRefine: ownedConceptCountBeforeRefine,
    conceptCount: ownedConceptCount,
    solution: ownedResult?.solutions?.[0] ?? [],
    concepts: (ownedResult?.conceptPlayersUsed ?? []).map((item) => item.name),
  });

  assert.equal(ownedResult?.solved, true, "owned fixture should be solvable");
  assert.equal(
    ownedConceptCount,
    0,
    "solver should not choose lower-rated concepts when enough owned cards satisfy the rules",
  );
  assert.equal(
    ownedConceptCountBeforeRefine,
    0,
    "initial owned solve should not rely on refinement to replace concept fallbacks",
  );

  console.log("[solver-concept-minimization] all checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

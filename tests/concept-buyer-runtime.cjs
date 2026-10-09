const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('page/ea-data-bridge.js', 'utf8');
// Execute the production functions. Only EA services and display effects are mocked.
function load(names, globals = {}) {
  const context = vm.createContext({ Map, Set, ...globals });
  for (const name of names) {
    const start = source.indexOf(`  const ${name} =`);
    assert.ok(start >= 0, `Missing production function ${name}`);
    const next = /\n  const /g;
    next.lastIndex = start + 1;
    const end = next.exec(source)?.index ?? source.length;
    vm.runInContext(`${source.slice(start, end)}\nthis.${name} = ${name};`, context);
  }
  return context;
}

const priceFunctions = [
  'readNumeric', 'formatCoins', 'getAuctionBuyNowPrice', 'roundMarketPriceStep',
  'getPreviousMarketPriceStep', 'getNextMarketPriceStep', 'normalizeConceptBuyMode',
  'getMarketPriceStepSize', 'normalizeConceptBuyPrices', 'normalizeConceptExactPrices',
  'normalizeConceptIncrementValue', 'buildConceptIncrementalCaps', 'buildConceptBuyerAttemptPlan',
];
const constants = {
  CONCEPT_BUY_MODES: ['exact', 'incremental'],
  CONCEPT_BUY_MODE_EXACT: 'exact', CONCEPT_BUY_MODE_INCREMENTAL: 'incremental',
  CONCEPT_BUY_EXACT_LIMIT: 12, CONCEPT_BUY_INCREMENTAL_LIMIT: 48,
  CONCEPT_BUY_PERCENTAGES: [95, 100, 110],
  CONCEPT_BUY_MARKET_DELAY_MIN_MS: 3000, CONCEPT_BUY_MARKET_DELAY_MAX_MS: 5000,
};

// EA observables report unsuccessful requests through callbacks, not rejections.
const observable = payload => ({
  observe(owner, callback) { callback({ unobserve() {} }, payload); },
});

function buyer(overrides = {}) {
  const row = { id: 'row', definitionId: 27, enabled: true, status: 'Ready',
    buyMode: 'exact', exactPrices: [500] };
  const state = { rows: [row], buying: false, checking: false, reconciling: false,
    cancelToken: { cancelled: false }, sourceType: 'challenge-squad' };
  const calls = { searches: [], bids: [], moves: [], toasts: [], remembered: [] };
  const services = { Item: {
    clearTransferMarketCache() {},
    searchTransferMarket(criteria) {
      calls.searches.push(criteria);
      return observable({ success: true, response: { items: [
        { id: 1, definitionId: 27, buyNowPrice: 450 },
        { id: 2, definitionId: 27, buyNowPrice: 500 },
        { id: 3, definitionId: 27, buyNowPrice: 550 },
      ] } });
    },
    bid(item, amount) { calls.bids.push({ item, amount }); return observable({ success: true }); },
    move(item, pile) { calls.moves.push({ item, pile }); return observable({ success: true }); },
  } };
  const context = load([
    ...priceFunctions, 'isPlainObject', 'unwrapObservablePayload', 'observableToPromise',
    'resolveItemPileEnum', 'isConceptBuyerTerminalStatus', 'setConceptBuyerRowStatus',
    'calculateConceptBuyPrices', 'hydrateConceptBuyerPrices',
    'buildTransferMarketSearchCriteria', 'searchConceptTransferMarket',
    'buyTransferMarketItem', 'buyConceptBuyerRows',
  ], {
    ...constants, services, conceptBuyerState: state,
    window: { ItemPile: { CLUB: 7 }, UTSearchCriteriaDTO: class {} },
    randomInt: min => min, delayMs: async () => {},
    updateConceptBuyerSummary() {}, renderConceptBuyerRows() {}, logConceptBuyerEvent() {},
    clearPlayersSnapshotCache() {}, refreshCurrentChallengeAfterConceptBuy: async () => {},
    requestPlayerPricesForIds: async () => {}, readCachedPlayerPrice: () => ({ price: 500 }),
    currentChallenge: {}, toPlainPlayer: (item, options) => ({ ...item, ...options }),
    rememberRecentConceptPurchaseDefinition: (...args) => calls.remembered.push(args),
    showToast: toast => calls.toasts.push(toast), ...overrides,
  });
  return { context, state, row, calls, services };
}

test('real exact buyer respects exact price, request criteria and successful club move', async () => {
  const { context, row, calls } = buyer();
  await context.buyConceptBuyerRows();
  assert.equal(calls.searches[0].minBuy, 500);
  assert.equal(calls.searches[0].maxBuy, 500);
  assert.equal(calls.bids[0].amount, 500);
  assert.equal(calls.moves[0].pile, 7);
  assert.equal(row.status, 'Bought');
  assert.equal(calls.remembered[0][1].source, 'club');
});

test('real incremental buyer buys the cheapest card below its cap', async () => {
  const { context, row, calls } = buyer();
  Object.assign(row, { buyMode: 'incremental', incrementStartPrice: 500,
    incrementMaxPrice: 700, incrementStep: 100 });
  await context.buyConceptBuyerRows();
  assert.equal(calls.bids[0].amount, 450);
  assert.equal(calls.searches[0].maxBuy, 500);
  assert.equal(calls.searches[0].minBuy, undefined);
});

test('Stop during an outstanding search prevents a subsequent bid', async () => {
  const { context, row, state, calls, services } = buyer();
  let completeSearch;
  services.Item.searchTransferMarket = () => ({
    observe(owner, callback) {
      completeSearch = () => callback({ unobserve() {} }, {
        success: true, response: { items: [{ id: 2, buyNowPrice: 500 }] },
      });
    },
  });
  const run = context.buyConceptBuyerRows();
  assert.equal(state.buying, true);
  await context.buyConceptBuyerRows(); // The same Start/Stop button handler.
  completeSearch();
  await run;
  assert.equal(calls.bids.length, 0);
  assert.equal(row.status, 'Stopped');
  assert.equal(state.buying, false);
});

test('a failed club move remains a completed purchase with a pending move', async () => {
  const { context, row, calls, services } = buyer();
  services.Item.move = () => observable({ success: false, error: { code: 409 }, status: 409 });
  await context.buyConceptBuyerRows();
  assert.equal(row.status, 'Bought', 'Never rebuy a card already purchased');
  assert.match(row.message, /club move pending/);
  assert.equal(calls.remembered[0][1].source, 'transfer');
  assert.equal(calls.bids.length, 1);
});

test('a lost bid never moves or remembers a purchased card', async () => {
  const { context, row, calls, services } = buyer();
  services.Item.bid = () => observable({ success: false, error: { code: 461 } });
  await context.buyConceptBuyerRows();
  assert.equal(row.status, 'Failed');
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.remembered.length, 0);
});

test('bought and owned rows are never purchased again on retry', async () => {
  const { context, row, state, calls } = buyer();
  Object.assign(row, { status: 'Bought' });
  state.rows.push({ ...row, id: 'owned', status: 'Owned' });
  await context.buyConceptBuyerRows();
  assert.equal(calls.searches.length, 0);
  assert.equal(calls.bids.length, 0);
});

test('a price lookup completing after a purchase must preserve Bought status', async () => {
  let finishPrices;
  const { context, row, calls } = buyer({
    requestPlayerPricesForIds: () => new Promise(resolve => { finishPrices = resolve; }),
  });
  const hydration = context.hydrateConceptBuyerPrices();
  await context.buyConceptBuyerRows();
  finishPrices();
  await hydration;
  assert.equal(row.status, 'Bought');
  assert.match(row.message, /Bought for/);
  row.enabled = true; // A retry must still recognize that the card was purchased.
  await context.buyConceptBuyerRows();
  assert.equal(calls.bids.length, 1);
});

test('production price plans preserve order and reject inverted ranges', () => {
  const context = load(priceFunctions, constants);
  assert.deepEqual(Array.from(context.buildConceptBuyerAttemptPlan({
    buyMode: 'exact', exactPrices: [16000, 15000, 16000],
  }).attempts, attempt => attempt.exactPrice), [16000, 15000]);
  assert.equal(context.buildConceptBuyerAttemptPlan({ buyMode: 'incremental',
    incrementStartPrice: 700, incrementMaxPrice: 500, incrementStep: 100,
  }).attempts.length, 0);
});

test('production concept detection blocks flags, metadata and concept ids', () => {
  const context = load(['readNumeric', 'isPreviewConceptPlayer', 'getSolutionConceptCount',
    'hasConceptBackedSolution']);
  assert.equal(context.hasConceptBackedSolution({ solutionIds: ['concept:27'] }), true);
  assert.equal(context.hasConceptBackedSolution({ solutionIds: [1], stats: { conceptCount: 1 } }), true);
  assert.equal(context.hasConceptBackedSolution({ solutionIds: [1] },
    new Map([['1', { id: 1, concept: true }]])), true);
  assert.equal(context.hasConceptBackedSolution({ solutionIds: [1] },
    new Map([['1', { id: 1, concept: false }]])), false);
});

test('production submission guard prevents calling EA with a concept squad', async () => {
  let submissions = 0;
  const context = load(['submitSbcChallenge'], {
    resolveSlotItem: slot => slot.item,
    isConceptPlayerRecord: item => item.concept === true,
    ensureSbcSetById() { throw new Error('Must not load a set for concept submission'); },
    services: { SBC: { submitChallenge() { submissions++; } } },
  });
  await assert.rejects(context.submitSbcChallenge({
    squad: { getPlayers: () => [{ item: { id: 'concept:27', concept: true } }] },
  }), error => error.code === 'EA_SUBMIT_CONCEPT_PLAYERS');
  assert.equal(submissions, 0);
});

function reconcile(players, entries) {
  const lookup = new Map();
  const rows = entries.map(entry => ({ definitionId: 27, enabled: true,
    status: 'Bought', source: { entry, solutionIndex: 0, solverId: entry.solutionIds[0], playerById: lookup },
  }));
  const state = { rows, sourceContext: { type: 'solver-plans', entries, playerById: lookup } };
  const context = load(['readNumeric', 'isPreviewConceptPlayer', 'getSolutionConceptCount',
    'getPlayerFromLookup', 'getSolverPlanConceptDefinitionId', 'getOwnedPlayerDefinitionId',
    'buildOwnedPlayerBucketsByDefinition', 'replaceConceptOccurrenceInEntry',
    'isConceptBuyerRowResolvedInEntry', 'recomputeConceptStateForEntries',
    'setConceptBuyerRowStatus', 'reconcileConceptBuyerSolverPlanRows'], {
    conceptBuyerState: state, window: { eaData: { getSolverPayload: async () => ({ players }) } },
    recentApplyLookupCache: null, showToast() {},
  });
  return { context, rows, lookup };
}

test('recovery cannot reuse one owned item for two concept occurrences', async () => {
  const entries = [0, 1].map(() => ({ solutionIds: ['concept:27'], stats: {} }));
  const { context, rows } = reconcile([{ id: 1001, definitionId: 27, rating: 75 }], entries);
  const result = await context.reconcileConceptBuyerSolverPlanRows({ rows });
  assert.equal(result.resolved, 1);
  assert.equal(result.unresolved, 1);
  assert.equal(entries[0].solutionIds[0], 1001);
  assert.equal(entries[0].submitReady, true);
  assert.equal(entries[1].solutionIds[0], 'concept:27');
  assert.equal(entries[1].submitReady, false);
});

test('recovery matches the exact card definition and converges on repeat', async () => {
  const entry = { solutionIds: ['concept:27'], stats: {} };
  const { context, rows } = reconcile([
    { id: 1001, definitionId: 28, assetId: 27, rating: 75 },
    { id: 1002, definitionId: 27, rating: 75 },
  ], [entry]);
  assert.equal((await context.reconcileConceptBuyerSolverPlanRows({ rows })).resolved, 1);
  assert.equal(entry.solutionIds[0], 1002);
  assert.equal((await context.reconcileConceptBuyerSolverPlanRows({ rows })).alreadyResolved, 1);
  assert.equal(entry.stats.conceptCount, 0);
});

test('failed inventory recovery leaves unresolved concept plans blocked', async () => {
  const entry = { solutionIds: ['concept:27'], stats: {} };
  const { context, rows } = reconcile([], [entry]);
  context.window.eaData.getSolverPayload = async () => { throw new Error('Inventory unavailable'); };
  const result = await context.reconcileConceptBuyerSolverPlanRows({ rows });
  assert.equal(result.unresolved, 1);
  assert.equal(entry.submitReady, false);
  assert.equal(entry.requiresConcepts, true);
});

test('successful SBC submission removes spent purchases from subsequent recovery', async () => {
  const purchases = new Map();
  const context = load(['readNumeric', 'mergeRecentConceptPurchasePlayers',
    'rememberRecentConceptPurchaseDefinition', 'getRecentConceptPurchasePlayersSnapshot',
    'forgetRecentConceptPurchaseItems', 'submitSbcChallenge'], {
    recentConceptPurchasesByDefinition: purchases,
    resolveSlotItem: slot => slot.item, isConceptPlayerRecord: () => false,
    ensureSbcSetById: async () => ({ id: 1 }),
    services: { SBC: { submitChallenge: () => ({ success: true }) } },
    sbcApiCall: async (_, call) => call(), observableToPromise: async value => value,
    SBC_AUTOMATION_SUBMIT_MIN_GAP_MS: 0,
    markPendingCompletionAutoFetch() {}, clearPlayersSnapshotCache() {},
  });
  for (const id of [1001, 1002]) context.rememberRecentConceptPurchaseDefinition(27, { id, definitionId: 27 });
  await context.submitSbcChallenge({ id: 1, setId: 1,
    squad: { getPlayers: () => [{ item: { id: 1001, definitionId: 27 } }] },
  });
  assert.deepEqual(Array.from(context.getRecentConceptPurchasePlayersSnapshot([27]), player => player.id), [1002]);
});

test('disabled concepts and storage-only solving cannot trigger external candidate searches', async () => {
  const context = load(['fetchConceptCandidatesForSolve']);
  for (const filters of [{ allowConceptPlayers: false }, { allowConceptPlayers: true, onlyStorage: true }]) {
    const result = await context.fetchConceptCandidatesForSolve({
      ownedResult: { stats: { scopeAnalysis: { conceptSearchEligible: true } } },
      ownedPlayers: [], filters,
    });
    assert.equal(result.candidates.length, 0);
    assert.ok(['disabled', 'only_storage_enabled'].includes(result.diagnostics.skippedReason));
  }
});

test('failed EA pile moves stop squad apply instead of reporting moved items', async () => {
  const context = load(['moveItemsToClub'], {
    resolveItemPileEnum: () => ({ CLUB: 7, STORAGE: 10 }),
    services: { Item: { move: () => ({ success: false, error: 461 }) } },
    observableToPromise: async value => value, delay: async () => {},
  });
  await assert.rejects(context.moveItemsToClub([{ id: 1001, pile: 10 }]), /461/);
});

test('successful pile moves leave club items untouched and move eligible piles once', async () => {
  const calls = [];
  const context = load(['moveItemsToClub'], {
    resolveItemPileEnum: () => ({ CLUB: 7, STORAGE: 10, UNASSIGNED: 8 }),
    services: { Item: { move: (items, pile) => { calls.push({ items, pile }); return { success: true }; } } },
    observableToPromise: async value => value, delay: async () => {},
  });
  assert.equal(await context.moveItemsToClub([{ id: 1, pile: 7 }]), 0);
  assert.equal(await context.moveItemsToClub([{ id: 2, pile: 10 }, { id: 3, pile: 8 },
    { id: 4, isTransferTarget: true }, { id: 1, pile: 7 }]), 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].items, item => item.id), [2, 3, 4]);
  assert.equal(calls[0].pile, 7);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('page/ea-data-bridge.js', 'utf8');
const load = (name, globals) => {
  const start = source.indexOf(`  const ${name} =`);
  const end = source.indexOf('\n  const ', start + 1);
  const context = vm.createContext(globals);
  vm.runInContext(`${source.slice(start, end)}\nthis.fn = ${name};`, context);
  return context.fn;
};
const makeModel = () => {
  const selected = new Set([1]);
  return {
    _itemEntityMap: new Map(), _itemTabMap: new Map(), _itemScoreMap: new Map([[1, 20]]),
    getSelectedItemIds: () => [...selected], getSelectedScore() { return [...selected].reduce((sum, id) => sum + this._itemScoreMap.get(id), 0); },
    getSelectionLimit: () => 3, selectItem(item) { selected.add(item.id); return true; },
    deselectItem(item) { selected.delete(item.id); },
  };
};
test('points selection registers native scores and retains the existing selection', () => {
  const apply = load('applyPointsSelection', {});
  const model = makeModel();
  const candidates = new Map([['2', { item: { id: 2, sbsScore: 35 }, tab: 'storage' }]]);
  apply(model, candidates, { selectedIds: ['2'], selectedScore: 35 }, ['1'], 20);
  assert.deepEqual(model.getSelectedItemIds(), [1, 2]);
  assert.equal(model.getSelectedScore(), 55);
  assert.equal(model._itemTabMap.get(2), 'storage');
  assert.equal(model._itemEntityMap.get(2).id, 2);
});
test('changed selection, duplicate IDs and invalid scores do not alter native selection', () => {
  const apply = load('applyPointsSelection', {});
  const candidates = new Map([['2', { item: { id: 2, sbsScore: 35 }, tab: 1 }]]);
  for (const [result, expected, score] of [
    [{ selectedIds: ['2'], selectedScore: 35 }, [], 0],
    [{ selectedIds: ['2', '2'], selectedScore: 70 }, ['1'], 20],
    [{ selectedIds: ['2'], selectedScore: 99 }, ['1'], 20],
  ]) {
    const model = makeModel();
    assert.throws(() => apply(model, candidates, result, expected, score));
    assert.deepEqual(model.getSelectedItemIds(), [1]);
  }
});
test('native selection failure rolls back only the newly added players', () => {
  const apply = load('applyPointsSelection', {});
  const model = makeModel();
  const select = model.selectItem;
  model.selectItem = item => item.id !== 3 && select(item);
  const candidates = new Map([2, 3].map(id => [String(id), { item: { id, sbsScore: 35 }, tab: 0 }]));
  assert.throws(() => apply(model, candidates, { selectedIds: ['2', '3'], selectedScore: 70 }, ['1'], 20));
  assert.deepEqual(model.getSelectedItemIds(), [1]);
});
test('points candidate search uses challenge eligibility for club and storage and propagates failures', async () => {
  const requests = [];
  const controller = { getViewModel: () => ({ getChallenge: () => ({ id: 27 }), getSelectedItemIds: () => [1], getSelectionLimit: () => 30 }) };
  const globals = {
    log() {},
    currentPointsController: controller,
    getActiveSquadPlayerIds: async () => [900], getUnassignedItems: async () => [], buildDuplicateDefIdSet: () => new Set(),
    window: { UTSearchCriteriaDTO: class {}, OneClickSBCWorkAreaTab: { CLUB: 0, STORAGE: 1 }, PileSearchType: { CLUB: 7, STORAGE: 10 }, SearchSortOrder: { ASCENDING: 1 }, SearchUntradeables: { DEFAULT: 0 } },
    services: { Item: { isFavoritePlayersEnabled: () => true }, Club: { search(criteria) { requests.push(criteria); return { success: true, data: { retrievedAll: true, items: [
      { id: 1, sbsScore: 20 }, { id: 2, definitionId: 900, sbsScore: 20 }, { id: 3, sbsScore: 35 },
    ] } }; } }, SBC: { isItemInSquad: () => false } },
    sbcApiCall: async (_, fn) => fn(), observableToPromise: async value => value,
    toPlainPlayer: (item, { source }) => ({ ...item, isStorage: source === 'storage' }),
    filterPlayersBySolverPoolSettings: players => ({ filteredPlayers: players }), delayMs: async () => {},
  };
  const gather = load('gatherPointsCandidates', globals);
  const result = await gather(controller, {});
  assert.deepEqual(requests.map(req => [req.sbcChallengeId, req.pileSearchType, req.offset]), [[27, 10, 0], [27, 7, 0]]);
  assert.ok(requests.every(req => req.count === 61 && req.sort === 1 && req.untradeables === 0));
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].id, 3);
  globals.services.Club.search = () => ({ success: false, status: 521 });
  await assert.rejects(gather(controller, {}), /521/);
});
test('manual selection changes clear the previous target-reached status', () => {
  const status = { textContent: 'Target reached' };
  const actions = { dataset: { result: JSON.stringify({ totalSelectedScore: 1255, totalSelectedCount: 30 }) }, querySelector: () => status };
  const controller = {
    getViewModel: () => ({ getSelectedScore: () => 0, getSelectedCount: () => 0 }),
    getView: () => ({ getRootElement: () => ({ querySelector: () => actions }) }),
  };
  load('syncPointsSelectionStatus', {})(controller);
  assert.equal(actions.dataset.result, undefined);
  assert.equal(status.textContent, 'Selection changed. Run Solve Points to update it.');
});

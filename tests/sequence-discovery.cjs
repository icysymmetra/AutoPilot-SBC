const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('page/ea-data-bridge.js', 'utf8');

function declaration(name, indent = '  ') {
  const start = source.indexOf(`\n${indent}const ${name} =`);
  if (start < 0) return null;
  const end = source.indexOf(`\n${indent}const `, start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

function setup(sets) {
  const repo = { getSetById: id => sets.find(set => String(set.id) === String(id)) };
  const context = vm.createContext({
    console, window: {},
    services: { SBC: { repository: repo, requestSets: () => ({ success: true, data: { sets } }) } },
    observableToPromise: async value => value,
    SEQUENCE_SET_SHAPE_SINGLE: 'single', SEQUENCE_SET_SHAPE_SET: 'set',
    sequenceSolveOverlayState: { discovery: { allSets: [], sets: [], setsAt: 0,
      challengesBySetId: new Map(), loadingSetIds: new Set() }, render() {} },
  });
  for (const name of ['readNumeric', 'clampInt', 'sanitizeDisplayText', 'getSbcSetById',
    'getSbcSetMetaById', 'getSbcSetRepeatabilityInfo', 'getSequenceSetShapeFromCount',
    'getSbcSetCatalogEntry', 'getSbcSets']) {
    const text = declaration(name);
    assert.ok(text, name);
    vm.runInContext(`${text}\nthis.${name} = ${name};`, context);
  }
  vm.runInContext(`${declaration('ensureDiscoveryState', '    ')}
    ${declaration('refreshSequenceDiscovery', '    ')}
    this.refreshSequenceDiscovery = refreshSequenceDiscovery;`, context);
  return context;
}

function load(context, name, indent = '  ') {
  const text = declaration(name, indent);
  assert.ok(text, `${name} must be declared in the shared scope`);
  vm.runInContext(`${text}\nthis.${name} = ${name};`, context);
}

// FC27 UTSBCSetEntity defaults repeats to zero for NON_REPEATABLE sets.
// It considers a nonrepeatable set complete only when its challenges are complete.
function nativeSet(id, count, { completed = false, mode = 'NON_REPEATABLE', repeats = 0, timesCompleted = 0 } = {}) {
  return { id, name: `Set ${id}`, challengesCount: count, challengesCompletedCount: completed ? count : 0,
    repeatabilityMode: mode, repeats, timesCompleted,
    isRepeatable: mode !== 'NON_REPEATABLE', isLimitedRepeatable: mode === 'LIMITED' || mode === 'REFRESH',
    getChallenges: () => [], isComplete: () => completed,
  };
}

test('sequence discovery includes open nonrepeatable single and multi-squad sets', async () => {
  const context = setup([nativeSet(1, 1), nativeSet(2, 3), nativeSet(3, 2, { completed: true })]);
  const sets = await context.refreshSequenceDiscovery({ force: true });
  assert.deepEqual(Array.from(sets, set => set.id), [1, 2]);
  assert.equal(sets.find(set => set.id === 2).setShape, 'set');
});

test('repeatable sets retain their remaining-attempt limits', async () => {
  const context = setup([
    nativeSet(1, 3, { mode: 'LIMITED', repeats: 3, timesCompleted: 1 }),
    nativeSet(2, 3, { mode: 'LIMITED', repeats: 1, timesCompleted: 1 }),
    nativeSet(3, 3, { mode: 'UNLIMITED' }),
  ]);
  assert.deepEqual(Array.from(await context.refreshSequenceDiscovery({ force: true }), set => set.id), [1, 3]);
});

test('Entire Set and Single Challenge selectors use eligible sets of the matching shape', async () => {
  const context = setup([nativeSet(1, 1), nativeSet(2, 3), nativeSet(3, 2, { completed: true })]);
  for (const name of ['getSequenceSetShape', 'getSequenceRequiredSetShapeForKind']) load(context, name);
  Object.assign(context, { SEQUENCE_TARGET_KIND_SINGLE: 'single_challenge', SEQUENCE_TARGET_KIND_SET_SCOPE: 'set_scope' });
  for (const name of ['getSequenceDiscoverySets', 'getSequenceDiscoveryAllSets', 'getSetEntryById', 'getCompatibleSetsForKind']) load(context, name, '    ');
  await context.refreshSequenceDiscovery({ force: true });
  assert.deepEqual(Array.from(context.getCompatibleSetsForKind('single_challenge'), set => set.id), [1]);
  assert.deepEqual(Array.from(context.getCompatibleSetsForKind('set_scope'), set => set.id), [2]);
});

test('discovery refresh removes a newly completed nonrepeatable set', async () => {
  const set = nativeSet(2, 3);
  const context = setup([set]);
  assert.equal((await context.refreshSequenceDiscovery({ force: true })).length, 1);
  set.isComplete = () => true;
  assert.equal((await context.refreshSequenceDiscovery({ force: true })).length, 0);
});

test('submitting one squad in a nonrepeatable group does not close the unfinished set', async () => {
  const set = nativeSet(1, 3);
  const challenges = [true, false, false].map((completed, i) => ({ id: i + 1, isCompleted: () => completed }));
  set.getChallenges = () => challenges;
  const context = setup([set]);
  Object.assign(context, { ensureSbcSetById: async () => set, sbcApiCall: async (_, call) => call(), SBC_AUTOMATION_MIN_GAP_MS: 0 });
  load(context, 'refreshSbcSetChallengesSnapshot');
  const partial = await context.refreshSbcSetChallengesSnapshot(1, set);
  assert.equal(partial.completedCount, 1);
  assert.equal(partial.shouldExitSetView, false);
  challenges.forEach(challenge => { challenge.isCompleted = () => true; });
  const complete = await context.refreshSbcSetChallengesSnapshot(1, set);
  assert.equal(complete.shouldExitSetView, true);
});

test('sequence challenge fetching works from a cold cache and refreshes completed squads', async () => {
  const set = nativeSet(2, 3);
  let challenges = [];
  let requests = 0;
  set.getChallenges = () => challenges;
  const context = setup([set]);
  Object.assign(context, { delay: async () => {}, getPrefetchedSetChallenges: () => null,
    prefetchSetChallengeInfo: async () => {}, upsertPrefetchedSetChallenges: () => {}, getCachedSetName: () => set.name });
  context.services.SBC.requestChallengesForSet = requested => {
    assert.equal(requested, set, 'EA hook receives the native set entity');
    requests++;
    challenges = [{ id: 21, name: 'B', isCompleted: () => false },
      { id: 22, name: 'A', isCompleted: () => requests > 1 },
      { id: 23, name: 'C', isCompleted: () => true }];
    return { success: true, data: { challenges } };
  };
  for (const name of ['getChallengesBySetIdsRaw', 'sortSetChallengesForSolver', 'getSortedSetChallenges']) load(context, name);
  load(context, 'ensureChallengesForSet', '    ');
  const initial = await context.ensureChallengesForSet(2);
  assert.deepEqual(Array.from(initial, challenge => challenge.id), [22, 21]);
  assert.equal(requests, 1);
  await context.ensureChallengesForSet(2);
  assert.equal(requests, 1, 'fresh sequence cache avoids another request');
  const refreshed = await context.ensureChallengesForSet(2, { force: true });
  assert.deepEqual(Array.from(refreshed, challenge => challenge.id), [21]);
  assert.equal(requests, 2);
  assert.equal(context.sequenceSolveOverlayState.discovery.loadingSetIds.size, 0);
});

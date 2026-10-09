const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('page/ea-data-bridge.js', 'utf8');
const matches = [...source.matchAll(/^  const (\w+) =/gm)];
const definitions = new Map(matches.map((match, index) => [match[1], source.slice(match.index, matches[index + 1]?.index ?? source.length)]));
const context = vm.createContext({ console });
const loaded = new Set();
const load = name => {
  if (loaded.has(name)) return;
  loaded.add(name);
  const definition = definitions.get(name);
  assert.ok(definition, name);
  for (const identifier of new Set(definition.match(/\b[A-Za-z_$][\w$]*\b/g)))
    if (identifier !== name && definitions.has(identifier)) load(identifier);
  vm.runInContext(`${definition}\nthis.${name} = ${name};`, context);
};
load('resolveSolverSettingsFromPreferences');
load('filterPlayersBySolverPoolSettings');

test('all seven toggles honor global, challenge and session settings, including explicit false', () => {
  assert.equal(context.SOLVER_TOGGLE_FIELDS.length, 7);
  for (const field of context.SOLVER_TOGGLE_FIELDS) {
    const prefs = { global: { solver: { [field.key]: true } }, perChallenge: { 27: { solver: { [field.key]: false } } } };
    const resolve = options => context.resolveSolverSettingsFromPreferences(prefs, options);
    assert.equal(resolve({})[field.key], true, `${field.key}: global`);
    assert.equal(resolve({ challengeId: 27 })[field.key], false, `${field.key}: challenge`);
    assert.equal(resolve({ challengeId: 27, sessionScope: { solver: { [field.key]: true } } })[field.key], true, `${field.key}: session`);
  }
});
test('rating, card buckets and player exclusions resolve independently', () => {
  const prefs = { global: { solver: { ratingRange: { ratingMin: 60, ratingMax: 83 }, allowedCardBuckets: ['common_gold'], excludedPlayerIds: [5] } }, perChallenge: { 27: { solver: { ratingRange: { ratingMin: 75, ratingMax: 80 }, allowedCardBuckets: ['rare_gold'] } } } };
  const settings = context.resolveSolverSettingsFromPreferences(prefs, { challengeId: 27 });
  assert.equal(settings.ratingRange.ratingMin, 75);
  assert.equal(settings.ratingRange.ratingMax, 80);
  assert.deepEqual(Array.from(settings.allowedCardBuckets), ['rare_gold']);
  assert.deepEqual(Array.from(settings.excludedPlayerIds).map(String), ['5']);
});
test('pool filters enforce rating, tradeability, storage and player/league/nation exclusions', () => {
  const base = { rating: 78, rarityId: 0, isSpecial: false, isStorage: true, isTradeable: false, leagueId: 10, nationId: 20 };
  const players = [
    { ...base, id: 1 }, { ...base, id: 2, rating: 84 }, { ...base, id: 3, isTradeable: true },
    { ...base, id: 4, isStorage: false }, { ...base, id: 5, leagueId: 11 },
    { ...base, id: 6, nationId: 21 }, { ...base, id: 7 },
  ];
  const result = context.filterPlayersBySolverPoolSettings(players, {
    ratingRange: { ratingMin: 75, ratingMax: 83 }, onlyStorage: true, excludeTradable: true,
    excludedPlayerIds: [7], excludedLeagueIds: [11], excludedNationIds: [21],
  });
  assert.deepEqual(Array.from(result.filteredPlayers, player => player.id), [1]);
});
test('special, TOTW/TOTS and evolution toggles enforce their separate permissions', () => {
  const base = { rating: 78, leagueId: 10, nationId: 20, isTradeable: false };
  const players = [
    { ...base, id: 1, rarityId: 0, isSpecial: false },
    { ...base, id: 2, rarityId: 7, isSpecial: true },
    { ...base, id: 3, rarityId: 3, isSpecial: true, rarityName: 'Team of the Week' },
    { ...base, id: 4, rarityId: 0, isSpecial: false, isEvolution: true, isDuplicate: true },
  ];
  const ids = settings => Array.from(context.filterPlayersBySolverPoolSettings(players, settings).filteredPlayers, player => player.id);
  assert.deepEqual(ids({ excludeSpecial: true, useTotwPlayers: false, useEvolutionPlayers: false }), [1]);
  assert.deepEqual(ids({ excludeSpecial: true, useTotwPlayers: true, useEvolutionPlayers: false }), [1, 3]);
  assert.deepEqual(ids({ excludeSpecial: false, useTotwPlayers: true, useEvolutionPlayers: true }), [1, 2, 3, 4]);
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('page/ea-data-bridge.js', 'utf8');
const matches = [...source.matchAll(/^  const (\w+) =/gm)];
const definitions = new Map(matches.map((match, index) => [match[1], source.slice(match.index, matches[index + 1]?.index ?? source.length)]));
const context = vm.createContext({console, setTimeout, clearTimeout});
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
load('renderCardBucketPicker');
load('createCardBucketPickerBinder');
load('buildSolverLoadingSettingsSummary');

function fixture(prefix) {
  const inputs = Object.fromEntries(['bronze', 'silver', 'gold'].map(quality => {
    const label = {setAttribute() {}};
    return [quality, {checked: false, disabled: false, listeners: {},
      closest: () => label, addEventListener(event, fn) {this.listeners[event] = fn;}}];
  }));
  const changes = [];
  const root = {querySelector(selector) {
    return Object.entries(inputs).find(([quality]) => selector === `#${prefix}${quality}`)?.[1] ?? null;
  }};
  const binder = context.createCardBucketPickerBinder({root, idPrefix: prefix, onChange: value => changes.push(value)});
  binder.setValues({});
  const change = (quality, checked) => {inputs[quality].checked = checked; inputs[quality].listeners.change();};
  return {inputs, changes, binder, change};
}
const keys = binder => Array.from(binder.getValues().allowedCardBuckets);

test('challenge, Multi Solve and sequence render three quality choices', () => {
  for (const prefix of ['ea-data-setting-card-bucket-', 'ea-data-multisolve-card-bucket-', 'ea-data-sequence-27-card-bucket-']) {
    const html = context.renderCardBucketPicker({idPrefix: prefix});
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /Common|Rare|rarity/);
    for (const quality of ['bronze', 'silver', 'gold']) assert.ok(html.includes(`id="${prefix}${quality}"`));
  }
});
test('quality choices read and write both compatible stored keys', () => {
  const {binder, change} = fixture('challenge-');
  change('silver', false); change('gold', false);
  assert.deepEqual(keys(binder), ['common_bronze', 'rare_bronze']);
  binder.setValues({allowedCardBuckets: ['rare_gold']});
  assert.deepEqual(keys(binder), ['common_gold', 'rare_gold']);
});
test('last quality remains selected and disabling jobs restores the guard', () => {
  const {binder, inputs, change, changes} = fixture('multi-');
  change('silver', false); change('gold', false);
  assert.equal(inputs.bronze.disabled, true);
  const before = changes.length;
  change('bronze', false);
  assert.equal(inputs.bronze.checked, true);
  assert.equal(changes.length, before);
  binder.setDisabled(true);
  assert.ok(Object.values(inputs).every(input => input.disabled));
  binder.setDisabled(false);
  assert.equal(inputs.bronze.disabled, true);
  assert.equal(inputs.silver.disabled, false);
});
test('sequence steps have independent controls and callbacks', () => {
  const first = fixture('step-1-'), second = fixture('step-2-');
  first.change('bronze', false);
  assert.equal(first.changes.length, 1);
  assert.equal(second.changes.length, 0);
  assert.equal(second.inputs.bronze.checked, true);
});
test('solve summary names qualities without legacy common or rare labels', () => {
  const summary = context.buildSolverLoadingSettingsSummary({allowedCardBuckets: ['rare_bronze', 'common_gold']});
  assert.deepEqual(Array.from(summary.find(item => item.label === 'Card types').values), ['Bronze', 'Gold']);
  assert.doesNotMatch(JSON.stringify(summary), /common|rare/i);
});

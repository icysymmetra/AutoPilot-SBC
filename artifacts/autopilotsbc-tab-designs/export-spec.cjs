const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'page/ea-data-bridge.js'), 'utf8');
const context = vm.createContext({});
for (const name of ['CARD_BUCKETS', 'CARD_BUCKET_KEYS', 'SETTINGS_PATHS', 'SETTINGS_DEFAULTS', 'SOLVER_TOGGLE_FIELDS']) {
  const start = source.indexOf(`  const ${name} =`);
  const end = source.indexOf('\n  const ', start + 1);
  if (start < 0 || end < 0) throw new Error(`Missing registry: ${name}`);
  vm.runInContext(`${source.slice(start, end)}\nthis.${name} = ${name};`, context);
}
const spec = {
  version: JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version,
  fields: context.SOLVER_TOGGLE_FIELDS,
  buckets: context.CARD_BUCKETS,
  defaults: context.SETTINGS_DEFAULTS.solver,
  changelog: JSON.parse(fs.readFileSync(path.join(root, 'data/changelog.json'), 'utf8')).releases.slice(0, 3),
};
fs.writeFileSync(path.join(__dirname, 'spec.js'), `window.AutoPilotSpec = ${JSON.stringify(spec, null, 2)};\n`);
console.log(`Exported ${spec.fields.length} toggles and ${spec.buckets.length} card buckets from current source.`);

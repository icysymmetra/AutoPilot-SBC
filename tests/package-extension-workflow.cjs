// Stage exactly the workflow's cp commands, then run the store bundle validator.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('GitHub packaging includes the complete runtime module graph', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/package-extension.yml'), 'utf8');
  const stage = workflow.split('- name: Stage runtime files')[1]?.split('- name: Validate bundle')[0];
  assert.ok(stage, 'runtime staging step exists');
  const commands = stage.replace(/\\\r?\n\s*/g, ' ');
  const tempParent = fs.realpathSync(os.tmpdir());
  const bundle = fs.mkdtempSync(path.join(tempParent, 'autopilot-store-check-'));
  try {
    for (const match of commands.matchAll(/^\s*cp (.+)$/gm)) {
      const tokens = match[1].trim().split(/\s+/);
      const destination = tokens.pop();
      assert.match(destination, /^dist\//);
      const folder = path.join(bundle, destination.slice(5));
      fs.mkdirSync(folder, {recursive: true});
      for (const token of tokens) {
        const sources = token.includes('*')
          ? fs.readdirSync(path.join(root, path.dirname(token)))
              .filter(name => name.endsWith(path.extname(token)))
              .map(name => path.join(path.dirname(token), name))
          : [token];
        for (const source of sources)
          fs.copyFileSync(path.join(root, source), path.join(folder, path.basename(source)));
      }
    }
    const check = spawnSync(process.execPath, [path.join(root, '.github/validate-bundle.cjs'), bundle], {encoding: 'utf8'});
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
    assert.ok(fs.existsSync(path.join(bundle, 'page/futgg-prices.js')));
    assert.ok(fs.existsSync(path.join(bundle, 'solver/points-solver.js')));
  } finally {
    assert.equal(path.dirname(bundle), tempParent, 'cleanup stays in the test temp directory');
    fs.rmSync(bundle, {recursive: true, force: true});
  }
});

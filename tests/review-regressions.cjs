const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const solver = () => import(pathToFileURL(resolve('solver/solver.js')));

test('unsupported FC27 rules are rejected even when filtering empties the pool', async () => {
  const { solveSquad, buildSolverContext } = await solver();
  const requirementsNormalized = [{ key: 41, keyName: 'PLAYER_ATTRIBUTE', value: 80 }];
  assert.throws(() => solveSquad(buildSolverContext({ players: [], requirementsNormalized })), /Unsupported SBC requirements/);
});

test('a short or empty pool cannot shrink the required squad into a solved result', async () => {
  const { solveSquad, buildSolverContext } = await solver();
  for (const count of [0, 3]) {
    const players = Array.from({ length: count }, (_, i) => ({ id: i + 1, definitionId: i + 1, rating: 60 }));
    const result = solveSquad(buildSolverContext({ players, requiredPlayers: 11,
      requirementsNormalized: [], optimize: { restartTimeBudgetMs: 0 } }));
    assert.equal(result.solved, false, `Only ${count} of eleven required players are available`);
    assert.equal(result.solutions.length, 0);
  }
});

test('EA locked items survive rating refinement when occupied-slot preservation is off', async () => {
  const { solveSquad, buildSolverContext } = await solver();
  const players = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, definitionId: i + 1,
    rating: i ? 50 : 64, rarityId: 0, leagueId: 1, nationId: 1, teamId: 1 }));
  const result = solveSquad(buildSolverContext({ players, requiredPlayers: 3,
    squadSlots: [{ index: 0, isLocked: true, isEditable: false, isValid: true, item: players[0] }],
    requirementsNormalized: [{ type: 'players_in_squad', op: 'exact', count: 3, values: [3] }],
    filters: { preserveOccupiedSlots: false }, optimize: { restartTimeBudgetMs: 0 },
  }));
  assert.equal(result.solved, true);
  assert.ok(result.solutions[0].includes(1), 'EA locked card cannot be replaced by a cheaper player');
});

test('rerunning the actual local packager removes obsolete destination files', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'autopilot-package-review-'));
  try {
    mkdirSync(join(temporary, 'scripts'));
    for (const folder of ['page', 'solver', 'icons', 'data']) cpSync(folder, join(temporary, folder), { recursive: true });
    for (const file of ['manifest.json', 'background.js', 'content-script.js']) cpSync(file, join(temporary, file));
    cpSync('scripts/package-extension.py', join(temporary, 'scripts/package-extension.py'));
    const python = process.env.PYTHON || 'python';
    const run = () => execFileSync(python, [join(temporary, 'scripts/package-extension.py')], { encoding: 'utf8' });
    run();
    const version = JSON.parse(readFileSync(join(temporary, 'manifest.json'))).version;
    const obsolete = join(temporary, 'artifacts', `autopilotsbc-fc27-${version}`, 'page/obsolete.js');
    writeFileSync(obsolete, 'obsolete runtime module');
    run();
    assert.equal(existsSync(obsolete), false);
    const archive = join(temporary, 'artifacts', `AutopilotSBC-FC27-${version}.zip`);
    const files = JSON.parse(execFileSync(python, ['-c', 'import json,sys,zipfile;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))', archive], { encoding: 'utf8' }));
    assert.ok(!files.includes('page/obsolete.js'));
    assert.ok(files.includes('manifest.json') && files.includes('solver/concept-players.js'));
  } finally {
    assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + require('node:path').sep));
    rmSync(temporary, { recursive: true, force: true });
  }
});

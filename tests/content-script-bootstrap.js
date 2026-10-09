const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('content-script.js', 'utf8');
const start = source.indexOf('void (async () => {');
const end = source.indexOf('\nconst CONTENT_SCRIPT_VERSION', start);
const bootstrap = source.slice(start, end).replace('void (', 'this.bootstrap = (');
const uiPaths = ['page/autopilot-settings-controls.js', 'page/autopilot-settings-tab.js'];
const bridgePath = 'page/ea-data-bridge.js';

async function run({failUI = false, failModule = false} = {}) {
  const calls = [], warnings = [];
  const window = {};
  window.top = window;
  const context = vm.createContext({window, console: {warn: (...args) => warnings.push(args), error() {}},
    exposeExtensionMetadataToPage: async () => {},
    injectPageScript: async (path, options) => {
      calls.push({path, mode: options.type});
      if ((failUI && uiPaths.includes(path)) || (failModule && path === bridgePath && options.type === 'module'))
        throw Error('Fixture injection failure');
    },
    requestBackgroundBridgeInject: async path => {
      calls.push({path, mode: 'background'});
      if (failUI && uiPaths.includes(path)) throw Error('Fixture fallback failure');
    },
  });
  vm.runInContext(bootstrap, context);
  await context.bootstrap;
  return {calls, warnings};
}

test('UI assets load in order before the solver bridge', async () => {
  const {calls} = await run();
  assert.deepEqual(calls.map(call => call.path), [...uiPaths, bridgePath]);
});
test('failed settings assets do not suppress the existing solver bridge', async () => {
  const {calls, warnings} = await run({failUI: true});
  assert.equal(calls.at(-1).path, bridgePath);
  assert.equal(calls.at(-1).mode, 'module');
  assert.equal(warnings.length, 2);
});
test('the solver still falls back to classic injection after module failure', async () => {
  const {calls} = await run({failModule: true});
  assert.deepEqual(calls.filter(call => call.path === bridgePath).map(call => call.mode), ['module', null]);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('the real background handler looks up a large price request without legacy pacing', async () => {
  const calls = [], delays = [];
  let clock = 100000;
  const source = readFileSync('background.js', 'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, '');
  const context = vm.createContext({
    console: { log() {} }, self: { addEventListener() {} },
    chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    Date: { now: () => clock },
    setTimeout(fn, delay) { delays.push(delay); clock += delay; fn(); },
    createFutggPriceClient: () => ({ getPrices: async (ids, platform) => {
      calls.push({ ids, platform });
      return new Map(ids.map(id => [id, { eaId: id, platform, price: 200 }]));
    } }),
  });
  vm.runInContext(`${source}\nthis.handlePriceRequest = handlePriceRequest;`, context);
  const ids = Array.from({ length: 1000 }, (_, i) => String(i + 1));
  const response = await new Promise(resolve => context.handlePriceRequest({ payload: { ids } }, resolve));
  assert.equal(response.ok, true);
  assert.equal(Object.keys(response.data.prices).length, 1000);
  assert.equal(calls.length, 1, 'One CDN map serves all requested IDs');
  assert.equal(delays.length, 0, 'CDN lookups do not use retired per-ID API pacing');
});

test('the real page price dispatcher sends one large bridge request', async () => {
  const source = readFileSync('page/ea-data-bridge.js', 'utf8');
  const calls = [];
  const cache = new Map();
  const context = vm.createContext({
    playerPriceCache: cache, playerPriceInFlightKeys: new Set(), playerPriceInFlightPromises: new Map(),
    PRICE_BRIDGE_TIMEOUT_MS: 25000,
    // Evaluate the actual constants too, so changing a test fixture cannot conceal the old batching.
    log() {}, delayMs: async () => {},
    callPriceBridge: async ids => { calls.push(ids); return { prices: Object.fromEntries(ids.map(id => [id, { price: 200 }])) }; },
  });
  for (const name of ['PRICE_BRIDGE_BATCH_SIZE', 'PRICE_BRIDGE_MAX_CONCURRENT_BATCHES', 'PRICE_BRIDGE_BATCH_DELAY_MS',
    'readNumeric', 'normalizePriceIdList', 'readCachedPlayerPrice', 'requestPlayerPricesForIds']) {
    const start = source.indexOf(`  const ${name} =`);
    assert.ok(start >= 0, `Missing ${name}`);
    const next = /\n  const /g; next.lastIndex = start + 1;
    vm.runInContext(`${source.slice(start, next.exec(source)?.index ?? source.length)}\nthis.${name} = ${name};`, context);
  }
  const ids = Array.from({ length: 240 }, (_, i) => String(i + 1));
  await context.requestPlayerPricesForIds(ids);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 240);
  assert.equal(cache.size, 240);
});

test('a transient CDN failure does not suppress a subsequent background retry', async () => {
  let calls = 0;
  let failing = true;
  const source = readFileSync('background.js', 'utf8')
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];/gm, '');
  const context = vm.createContext({
    console: { log() {} }, self: { addEventListener() {} },
    chrome: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    setTimeout(fn) { fn(); },
    createFutggPriceClient: () => ({ getPrices: async ids => {
      calls++;
      if (failing) throw new Error('Temporary outage');
      return new Map(ids.map(id => [id, { eaId: id, price: 200 }]));
    } }),
  });
  vm.runInContext(`${source}\nthis.handlePriceRequest = handlePriceRequest;`, context);
  const request = () => new Promise(resolve => context.handlePriceRequest({ payload: { ids: ['27'] } }, resolve));
  assert.equal((await request()).data.errorCount, 1);
  failing = false;
  assert.equal((await request()).data.prices['27'].price, 200);
  assert.equal(calls, 3);
});

test('the page distinguishes transient failures from successfully missing prices', () => {
  const source = readFileSync('page/ea-data-bridge.js', 'utf8');
  const cache = new Map([
    ['27', { error: 'Temporary outage', cachedAt: Date.now(), price: null }],
    ['28', { missing: true, cachedAt: Date.now(), price: null }],
  ]);
  const context = vm.createContext({ playerPriceCache: cache, PRICE_CACHE_TTL_MS: 600000 });
  for (const name of ['readNumeric', 'readCachedPlayerPrice']) {
    const start = source.indexOf(`  const ${name} =`);
    const next = /\n  const /g; next.lastIndex = start + 1;
    vm.runInContext(`${source.slice(start, next.exec(source)?.index ?? source.length)}\nthis.${name} = ${name};`, context);
  }
  assert.equal(context.readCachedPlayerPrice('27'), null);
  assert.equal(context.readCachedPlayerPrice('28'), cache.get('28'));
});

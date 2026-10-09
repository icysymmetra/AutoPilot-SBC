import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeFutggPrices, createFutggPriceClient } from '../page/futgg-prices.js';

test('decodes delta IDs with distinct market and reward status', () => {
  const prices = decodeFutggPrices({ v: 2, id0: 100, d: [5, 7, 8], sbct: { 112: 1000 } }, { v: 2, p: [200, 0, 0, 900], s: [0, 0, 1, 2] }, 'pc');
  assert.equal(prices.get('100').price, 200);
  assert.equal(prices.get('105').price, null);
  assert.equal(prices.get('105').isExtinct, true);
  assert.equal(prices.get('112').isSbc, true);
  assert.equal(prices.get('112').isExtinct, false);
  assert.equal(prices.get('120').isObjective, true);
  assert.equal(prices.get('100').platform, 'pc');
});
test('rejects mismatched and unsupported price blobs', () => {
  assert.throws(() => decodeFutggPrices({ v: 2, id0: 1, d: [2] }, { v: 2, p: [200], s: [0] }), /length/i);
  assert.throws(() => decodeFutggPrices({ v: 99, id0: 1, d: [] }, { v: 99, p: [200], s: [0] }), /version/i);
});
test('fetches FC27 CDN prices once per platform and shares concurrent requests', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    const data = url.endsWith('manifest.json') ? { _version: 1, 'player-prices-index': 'abc', 'player-prices-ps5-dyn': 'def', 'player-prices-pc-dyn': 'ghi' } :
      url.includes('player-prices-index') ? { v: 2, id0: 100, d: [] } :
        { v: 2, p: [url.includes('pc-dyn') ? 900 : 200], s: [0] };
    return { ok: true, status: 200, json: async () => data };
  };
  const client = createFutggPriceClient({ fetcher });
  const [first, second] = await Promise.all([client.getPrices(['100'], 'console'), client.getPrices(['100'], 'console')]);
  assert.equal(first.get('100').price, 200);
  assert.equal(second.get('100').price, 200);
  assert.equal((await client.getPrices(['100'], 'pc')).get('100').price, 900);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(url => url.startsWith('https://r2.fut.gg/27/')));
});

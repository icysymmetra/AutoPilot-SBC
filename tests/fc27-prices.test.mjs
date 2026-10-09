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
  assert.throws(() => decodeFutggPrices({ v: 2, id0: 1, d: [2] }, { v: 2, p: [], s: [] }), /length/i);
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
  assert.equal(first.get('100'), second.get('100'), 'Concurrent lookups share the decoded map');
  assert.equal((await client.getPrices(['100'], 'console')).get('100'), first.get('100'), 'Repeated IDs reuse decoded rows');
  assert.equal((await client.getPrices(['100'], 'pc')).get('100').price, 900);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(url => url.startsWith('https://r2.fut.gg/27/')));
});

test('a malformed CDN blob is rejected and refetched on retry', async () => {
  let dynamicRequests = 0;
  const fetcher = async url => ({ ok: true, json: async () =>
    url.endsWith('manifest.json') ? { _version: 1, 'player-prices-index': 'abc', 'player-prices-ps5-dyn': 'def' } :
    url.includes('player-prices-index') ? { v: 2, id0: 100, d: [] } :
    (++dynamicRequests === 1 ? { v: 2, p: [], s: [] } : { v: 2, p: [200], s: [0] }),
  });
  const client = createFutggPriceClient({ fetcher });
  await assert.rejects(client.getPrices(['100']), /length/i);
  assert.equal((await client.getPrices(['100'])).get('100').price, 200);
  assert.equal(dynamicRequests, 2);
});

test('decoded markets refresh with manifest rotation without mixing platforms', async () => {
  let clock = 0, revision = 1;
  const calls = [];
  const client = createFutggPriceClient({ now: () => clock, fetcher: async url => {
    calls.push(url);
    return { ok: true, json: async () => url.endsWith('manifest.json') ? {
      _version: 1, 'player-prices-index': 'stable',
      'player-prices-ps5-dyn': `console-${revision}`, 'player-prices-pc-dyn': `pc-${revision}`,
      _published_at: { 'player-prices-ps5-dyn': revision, 'player-prices-pc-dyn': revision },
    } : url.includes('player-prices-index') ? { v: 2, id0: 100, d: [] } : {
      v: 2, p: [(url.includes('pc-dyn') ? 1000 : 100) * Number(url.match(/-(\d+)\.json$/)[1])], s: [0],
    } };
  } });
  const first = (await client.getPrices(['100'])).get('100');
  assert.equal(first.price, 100);
  revision = 2;
  clock = 60_001;
  const [consolePrices, pcPrices] = await Promise.all([client.getPrices(['100']), client.getPrices(['100'], 'pc')]);
  assert.equal(consolePrices.get('100').price, 200);
  assert.equal(pcPrices.get('100').price, 2000);
  assert.notEqual(consolePrices.get('100'), first);
  assert.equal(consolePrices.get('100').priceUpdatedAt, '1970-01-01T00:00:02.000Z');
  assert.equal(calls.filter(url => url.includes('player-prices-index')).length, 1);
  assert.equal(calls.filter(url => url.endsWith('manifest.json')).length, 2);
});

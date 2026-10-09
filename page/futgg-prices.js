// FUT.GG's FC27 site uses a shared delta-ID index and separate dynamic market
// blobs. Keep decoding and request coalescing outside the background listeners.
export const FUT_GAME_YEAR = 27;
const CDN_ROOT = `https://r2.fut.gg/${FUT_GAME_YEAR}`;
const TTL_MS = 60_000;

export const decodeFutggPrices = (index, blob, platform = 'console', publishedAt = null) => {
  if (index?.v !== 2 || blob?.v !== 2) throw new Error('Unsupported FUT.GG price blob version');
  if (!Array.isArray(index.d) || !Array.isArray(blob.p) || !Array.isArray(blob.s) ||
      blob.p.length !== blob.s.length || blob.p.length !== index.d.length + 1)
    throw new Error('FUT.GG price blob/index length mismatch');
  const rows = new Map();
  let id = Number(index.id0);
  if (!Number.isSafeInteger(id)) throw new Error('Invalid FUT.GG price index');
  for (let offset = 0; offset < blob.p.length; offset++) {
    if (offset) {
      const delta = Number(index.d[offset - 1]);
      if (!Number.isSafeInteger(delta) || delta <= 0) throw new Error('Invalid FUT.GG price index delta');
      id += delta;
    }
    const status = Number(blob.s[offset]);
    const amount = Number(blob.p[offset]);
    const price = Number.isFinite(amount) && amount > 0 ? amount : null;
    rows.set(String(id), {
      eaId: String(id), platform, price, isSbc: status === 1,
      isObjective: status === 2, isExtinct: status === 0 && price == null,
      isUntradeable: status === 1 || status === 2 || status === 4,
      priceUpdatedAt: publishedAt, missing: false,
    });
  }
  return rows;
};

export const createFutggPriceClient = ({ fetcher = fetch, now = Date.now } = {}) => {
  let manifestCache = null;
  let manifestPending = null;
  const blobs = new Map();
  const pending = new Map();
  const decodedMarkets = new Map();
  const requestJson = async url => {
    const response = await fetcher(url, {
      credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`FUT.GG CDN request failed (${response.status})`);
    return response.json();
  };
  const manifest = async () => {
    if (manifestCache && now() - manifestCache.at < TTL_MS) return manifestCache.data;
    if (!manifestPending) manifestPending = requestJson(`${CDN_ROOT}/manifest.json`)
      .then(data => { manifestCache = { at: now(), data }; return data; })
      .finally(() => { manifestPending = null; });
    return manifestPending;
  };
  const blobUrl = (metadata, key) => {
    const version = metadata?._version;
    const hash = metadata?.[key];
    if (!Number.isSafeInteger(version) || !/^[a-zA-Z0-9_-]+$/.test(hash || ''))
      throw new Error(`Missing FUT.GG CDN manifest entry: ${key}`);
    return `${CDN_ROOT}/${key}.v${version}.${hash}.json`;
  };
  const loadBlob = async (metadata, key) => {
    const url = blobUrl(metadata, key);
    if (blobs.has(url)) return blobs.get(url);
    if (!pending.has(url)) pending.set(url, requestJson(url).then(data => {
      // Keep only the latest version of each blob, bounding worker memory.
      for (const cachedUrl of blobs.keys()) if (cachedUrl.includes(`/${key}.v`)) blobs.delete(cachedUrl);
      blobs.set(url, data); return data;
    }).finally(() => pending.delete(url)));
    return pending.get(url);
  };
  const loadDecodedMarket = (metadata, market) => {
    const key = market === 'pc' ? 'player-prices-pc-dyn' : 'player-prices-ps5-dyn';
    const indexUrl = blobUrl(metadata, 'player-prices-index');
    const pricesUrl = blobUrl(metadata, key);
    const timestamp = metadata._published_at?.[key];
    const signature = `${indexUrl}|${pricesUrl}|${timestamp ?? ''}`;
    const cached = decodedMarkets.get(market);
    if (cached?.signature === signature) return cached.promise;
    const entry = { signature, promise: null };
    entry.promise = Promise.all([loadBlob(metadata, 'player-prices-index'), loadBlob(metadata, key)])
      .then(([index, prices]) => decodeFutggPrices(index, prices, market,
        Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null))
      .catch(error => {
        // Invalid content must be fetched again instead of becoming missing-player data.
        blobs.delete(indexUrl); blobs.delete(pricesUrl);
        if (decodedMarkets.get(market) === entry) decodedMarkets.delete(market);
        throw error;
      });
    // One entry per platform bounds memory and shares both loading and decoding.
    decodedMarkets.set(market, entry);
    return entry.promise;
  };
  return {
    async getPrices(ids = [], platform = 'console') {
      const market = platform === 'pc' ? 'pc' : 'console';
      const metadata = await manifest();
      const decoded = await loadDecodedMarket(metadata, market);
      const out = new Map();
      for (const id of ids) {
        const row = decoded.get(String(id));
        if (row) out.set(String(id), row);
      }
      return out;
    },
  };
};

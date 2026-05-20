const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const bridgeSource = readFileSync("page/ea-data-bridge.js", "utf8");

const readNumeric = (value) => {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : null;
  return Number.isFinite(number) ? number : null;
};

const formatCoins = (value) => {
  const amount = readNumeric(value);
  return amount == null ? "-" : Math.round(amount).toLocaleString("en-US");
};

const roundMarketPriceStep = (value) => {
  const price = readNumeric(value);
  if (price == null || price <= 0) return null;
  let step = 50;
  if (price >= 100000) step = 1000;
  else if (price >= 50000) step = 500;
  else if (price >= 10000) step = 250;
  else if (price >= 1000) step = 100;
  return Math.max(200, Math.ceil(price / step) * step);
};

const normalizeConceptBuyPrices = (prices = [], { limit = 12 } = {}) => {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(prices) ? prices : []) {
    const price = roundMarketPriceStep(raw);
    if (price == null || price <= 0) continue;
    const key = String(price);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(price);
    if (out.length >= limit) break;
  }
  return out;
};

const normalizeConceptIncrementValue = (value, fallback = 250) => {
  const raw = readNumeric(value);
  const base = raw == null || raw <= 0 ? fallback : raw;
  for (const step of [50, 100, 250, 500, 1000]) {
    if (base <= step) return step;
  }
  return Math.ceil(base / 1000) * 1000;
};

const buildIncrementalCaps = ({ startPrice, maxPrice, increment }) => {
  const start = roundMarketPriceStep(startPrice);
  const max = roundMarketPriceStep(maxPrice);
  if (start == null || max == null || start > max) return [];
  const step = normalizeConceptIncrementValue(increment);
  const caps = [];
  let current = start;
  for (let guard = 0; guard < 48 && current <= max; guard += 1) {
    caps.push(current);
    const next = roundMarketPriceStep(current + step);
    if (next == null || next <= current) break;
    current = next;
  }
  return caps;
};

const buildAttemptPlan = (row) => {
  if (row.buyMode === "incremental") {
    return buildIncrementalCaps(row).map((cap, index) => ({
      kind: "incremental",
      index,
      searchMaxBuy: cap,
      exactPrice: null,
    }));
  }
  return normalizeConceptBuyPrices(row.exactPrices).map((price, index) => ({
    kind: "exact",
    index,
    searchMaxBuy: price,
    exactPrice: price,
  }));
};

const simulateBuyer = ({ row, marketPrices }) => {
  const attempts = buildAttemptPlan(row);
  const logs = [];
  for (const attempt of attempts) {
    const searched = marketPrices
      .filter((price) => price <= attempt.searchMaxBuy)
      .sort((a, b) => a - b);
    const matches =
      attempt.kind === "exact"
        ? searched.filter((price) => price === attempt.exactPrice)
        : searched;
    logs.push({
      mode: row.buyMode,
      attempt: attempt.index + 1,
      searchMaxBuy: attempt.searchMaxBuy,
      exactPrice: attempt.exactPrice,
      searched,
      matches,
    });
    if (matches.length) return { boughtPrice: matches[0], logs };
  }
  return { boughtPrice: null, logs };
};

const printScenario = (name, result) => {
  console.log(`\n[concept-buyer-test] ${name}`);
  for (const log of result.logs) {
    console.log(
      `  ${log.mode} attempt ${log.attempt}: max=${formatCoins(
        log.searchMaxBuy,
      )} exact=${formatCoins(log.exactPrice)} searched=[${
        log.searched.map(formatCoins).join(", ") || "-"
      }] matches=[${log.matches.map(formatCoins).join(", ") || "-"}]`,
    );
  }
  console.log(
    `  result: ${
      result.boughtPrice == null
        ? "no buy"
        : `bought ${formatCoins(result.boughtPrice)}`
    }`,
  );
};

const exactNoCheaperLeak = simulateBuyer({
  row: { buyMode: "exact", exactPrices: [15750] },
  marketPrices: [15000],
});
printScenario(
  "exact mode does not buy below the requested price",
  exactNoCheaperLeak,
);
assert.equal(exactNoCheaperLeak.boughtPrice, null);

const exactPreservesOrder = simulateBuyer({
  row: { buyMode: "exact", exactPrices: [16000, 15000] },
  marketPrices: [15000],
});
printScenario("exact mode preserves user attempt order", exactPreservesOrder);
assert.equal(exactPreservesOrder.logs[0].searchMaxBuy, 16000);
assert.equal(exactPreservesOrder.logs[0].matches.length, 0);
assert.equal(exactPreservesOrder.boughtPrice, 15000);

const incrementalUsesCaps = simulateBuyer({
  row: {
    buyMode: "incremental",
    startPrice: 15750,
    maxPrice: 16250,
    increment: 250,
  },
  marketPrices: [15000],
});
printScenario(
  "incremental mode intentionally buys under the cap",
  incrementalUsesCaps,
);
assert.equal(incrementalUsesCaps.boughtPrice, 15000);

const manyExactAttempts = buildAttemptPlan({
  buyMode: "exact",
  exactPrices: [15000, 15250, 15500, 15750, 16000, 16250, 16500, 16750],
});
console.log(
  `\n[concept-buyer-test] many exact attempts remain in plan: ${manyExactAttempts
    .map((attempt) => formatCoins(attempt.searchMaxBuy))
    .join(" -> ")}`,
);
assert.equal(manyExactAttempts.length, 8);

assert.match(bridgeSource, /const buildConceptBuyerAttemptPlan = \(row\) =>/);
assert.match(bridgeSource, /exactPrice: attempt\.exactPrice/);
assert.match(bridgeSource, /criteria\.minBuy = exactPrice/);
assert.match(bridgeSource, /entry\.buyNowPrice === exactPrice/);
assert.doesNotMatch(
  bridgeSource,
  /const attempts = \(Array\.isArray\(row\.buyPrices\)[\s\S]*?\.sort\(\(a, b\) => a - b\)/,
  "legacy sorted max-buy attempt construction should not drive buyer execution",
);

console.log("\n[concept-buyer-test] all checks passed");

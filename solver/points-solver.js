// Streamlined SBC scores come from EA's eligible-item response. Never derive them
// from OVR: rarity, holographics, and future scoring changes affect their value.
const finite = value => value != null && Number.isFinite(Number(value)) ? Number(value) : null;

export const solvePointsChallenge = (payload = {}) => {
  const requirement = finite(payload.scoreRequirement);
  const submitted = finite(payload.submittedScore) ?? 0;
  const selected = finite(payload.selectedScore) ?? 0;
  const limit = Math.max(0, Math.min(100, Math.floor(finite(payload.selectionLimit) ?? 30)));
  const target = Math.max(0, (requirement ?? 0) - submitted - selected);
  const base = { selectedIds: [], selectedScore: 0, targetScore: target, remainingAfterSelection: target, complete: false };
  if (requirement == null || requirement <= 0 || submitted < 0 || selected < 0)
    return { ...base, ok: false, error: { code: 'INVALID_POINTS_TARGET', message: 'EA did not provide a valid score target.' } };
  if (!target) return { ...base, ok: true, complete: true };
  if (!limit) return { ...base, ok: true };

  const seen = new Set();
  const items = (Array.isArray(payload.players) ? payload.players : []).flatMap(player => {
    const id = player?.id == null ? '' : String(player.id);
    const score = finite(player?.sbsScore);
    if (!id || id === '0' || seen.has(id) || score == null || score <= 0 || player?.isConcept || player?.concept) return [];
    seen.add(id);
    const rating = finite(player.rating) ?? 99;
    const explicitCost = finite(player.cost);
    const cost = explicitCost != null && explicitCost >= 0 ? explicitCost :
      Math.pow(2, Math.max(0, rating - 60) / 3) * (player.isStorage ? 0.7 : 1) * (player.isDuplicate ? 0.5 : 1);
    return [{ id, score, cost }];
  });
  if (!items.length) return { ...base, ok: true };

  const nodeFor = chosen => chosen.reduce((prev, item) => ({ id: item.id, score: prev.score + item.score, cost: prev.cost + item.cost, count: prev.count + 1, prev }), { score: 0, cost: 0, count: 0, prev: null });
  const better = (a, b) => !b || a.cost < b.cost || (a.cost === b.cost && (a.score < b.score || (a.score === b.score && a.count < b.count)));
  const greedy = order => {
    const chosen = []; let score = 0;
    for (const item of order) {
      if (score >= target || chosen.length >= limit) break;
      chosen.push(item); score += item.score;
    }
    return nodeFor(chosen);
  };
  // Retain a feasible seed even if the bounded refinement reaches its budget.
  const maximum = greedy(items.slice().sort((a, b) => b.score - a.score || a.cost - b.cost));
  const economical = greedy(items.slice().sort((a, b) => a.cost / a.score - b.cost / b.score || a.cost - b.cost));
  let best = maximum.score >= target ? maximum : null;
  if (economical.score >= target && better(economical, best)) best = economical;
  if (!best) return result(maximum, false);

  // At most `limit` copies of any score can be useful. Distinct owned item IDs
  // remain distinct candidates; no definition-ID deduplication is performed.
  const grouped = new Map();
  for (const item of items) {
    const group = grouped.get(item.score) || [];
    group.push(item); grouped.set(item.score, group);
  }
  const candidates = [...grouped.values()].flatMap(group => group.sort((a, b) => a.cost - b.cost).slice(0, limit))
    .sort((a, b) => a.cost / a.score - b.cost / b.score || a.cost - b.cost);
  const states = Array.from({ length: limit + 1 }, () => new Map());
  states[0].set(0, { score: 0, cost: 0, count: 0, prev: null });
  const deadline = Date.now() + Math.max(50, Math.min(4000, finite(payload.timeBudgetMs) ?? 1500));
  let truncated = false;
  for (let index = 0; index < candidates.length; index++) {
    if (Date.now() > deadline) { truncated = true; break; }
    const item = candidates[index];
    for (let count = Math.min(limit, index + 1); count > 0; count--) {
      for (const previous of states[count - 1].values()) {
        const cost = previous.cost + item.cost;
        if (cost > best.cost) continue;
        const score = previous.score + item.score;
        const node = { id: item.id, score, cost, count, prev: previous };
        if (score >= target) { if (better(node, best)) best = node; continue; }
        if (better(node, states[count].get(score))) states[count].set(score, node);
      }
      if (index % 10 === 0 || states[count].size > 2000) {
        const ordered = [...states[count].values()].sort((a, b) => b.score - a.score || a.cost - b.cost);
        let cheapest = Infinity;
        const frontier = ordered.filter(node => { if (node.cost >= cheapest) return false; cheapest = node.cost; return true; });
        if (frontier.length > 2000) truncated = true;
        states[count] = new Map(frontier.slice(0, 2000).map(node => [node.score, node]));
      }
    }
  }
  return result(best, true, truncated);

  function result(node, complete, searchTruncated = false) {
    const ids = [];
    for (let cursor = node; cursor?.prev; cursor = cursor.prev) ids.push(cursor.id);
    return { ok: true, selectedIds: ids.reverse(), selectedScore: node.score, targetScore: target,
      remainingAfterSelection: Math.max(0, target - node.score), complete,
      estimatedCost: node.cost, searchTruncated };
  }
};

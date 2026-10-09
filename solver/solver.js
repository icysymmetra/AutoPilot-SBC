import { compileConstraintSet } from "./constraint-compiler.js";
import {
  computeBestChemistryAssignment,
  normalizeSlotsForChemistry,
} from "./chemistry.js";
import {
  getConceptUsageMetrics,
  isConceptPlayer,
} from "./concept-players.js";

const ROUND_DECIMALS = 2;
const ROUND_THRESHOLD = 0.96;
const SOLVER_VERSION = "debug-3";
const DEFAULT_SQUAD_SIZE = 11;

const REQUIREMENT_KEYS = [
  "players_in_squad",
  "team_rating",
  "player_quality",
  "player_rarity",
  "player_rarity_group",
  "player_geo_region",
  "player_tots",
  "player_totw_or_tots",
  "player_rarity_or_totw",
  "nation_id",
  "league_id",
  "club_id",
  "nation_count",
  "league_count",
  "club_count",
  "same_nation_count",
  "same_league_count",
  "same_club_count",
  "first_owner_players_count",
  "player_tradability",
  "player_exact_ovr",
  "player_min_ovr",
  "player_max_ovr",
  "player_inform",
  "loan_players",
  "player_level",
  "legend_count",
  "num_trophy_required",
  "chemistry_points",
  "all_players_chemistry_points",
];

const TYPE_ALIASES = {
  player_count: "players_in_squad",
  player_count_combined: "players_in_squad",
  num_players: "players_in_squad",
  players_required: "players_in_squad",
  team_star_rating: "team_rating",
  countries_in_squad: "nation_count",
  leagues_in_squad: "league_count",
  clubs_in_squad: "club_count",
  players_same_nation: "same_nation_count",
  players_same_league: "same_league_count",
  players_same_club: "same_club_count",
  total_chemistry: "chemistry_points",
  player_quality: "player_quality",
  player_rarity: "player_rarity",
  player_rarity_group: "player_rarity_group",
  player_geo_region: "player_geo_region",
  player_tots: "player_tots",
  player_totw_or_tots: "player_totw_or_tots",
  player_rarity_or_totw: "player_rarity_or_totw",
  nation_id: "nation_id",
  league_id: "league_id",
  club_id: "club_id",
  nation_count: "nation_count",
  league_count: "league_count",
  club_count: "club_count",
  same_nation_count: "same_nation_count",
  same_league_count: "same_league_count",
  same_club_count: "same_club_count",
  first_owner_players_count: "first_owner_players_count",
  player_tradability: "player_tradability",
  player_exact_ovr: "player_exact_ovr",
  player_min_ovr: "player_min_ovr",
  player_max_ovr: "player_max_ovr",
  team_rating: "team_rating",
  players_in_squad: "players_in_squad",
  player_inform: "player_inform",
  loan_players: "loan_players",
  player_level: "player_level",
  legend_count: "legend_count",
  num_trophy_required: "num_trophy_required",
  chemistry_points: "chemistry_points",
  all_players_chemistry_points: "all_players_chemistry_points",
};

const ENUM_TO_TYPE = {
  TEAM_STAR_RATING: "team_rating",
  TEAM_RATING: "team_rating",
  PLAYER_COUNT: "players_in_squad",
  PLAYER_COUNT_COMBINED: "players_in_squad",
  PLAYERS_IN_SQUAD: "players_in_squad",
  PLAYER_QUALITY: "player_quality",
  PLAYER_RARITY: "player_rarity",
  PLAYER_RARITY_GROUP: "player_rarity_group",
  PLAYER_MIN_OVR: "player_min_ovr",
  PLAYER_MAX_OVR: "player_max_ovr",
  PLAYER_EXACT_OVR: "player_exact_ovr",
  NATION_ID: "nation_id",
  LEAGUE_ID: "league_id",
  CLUB_ID: "club_id",
  NATION_COUNT: "nation_count",
  LEAGUE_COUNT: "league_count",
  CLUB_COUNT: "club_count",
  SAME_NATION_COUNT: "same_nation_count",
  SAME_LEAGUE_COUNT: "same_league_count",
  SAME_CLUB_COUNT: "same_club_count",
  FIRST_OWNER_PLAYERS_COUNT: "first_owner_players_count",
  PLAYER_TRADABILITY: "player_tradability",
  PLAYER_LEVEL: "player_level",
  LEGEND_COUNT: "legend_count",
  NUM_TROPHY_REQUIRED: "num_trophy_required",
  CHEMISTRY_POINTS: "chemistry_points",
  ALL_PLAYERS_CHEMISTRY_POINTS: "all_players_chemistry_points",
};

const FILTER_PRIORITY = [
  "nation_id",
  "league_id",
  "club_id",
  "player_geo_region",
  "same_nation_count",
  "same_league_count",
  "same_club_count",
  "player_level",
  "player_quality",
  "player_inform",
  "player_tots",
  "player_totw_or_tots",
  "player_rarity",
  "player_rarity_group",
  "player_rarity_or_totw",
  "first_owner_players_count",
  "player_tradability",
  "player_exact_ovr",
];

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const readOptionalBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return null;
};

const toBooleanSetting = (value, fallback = false) => {
  const parsed = readOptionalBoolean(value);
  if (parsed == null) return Boolean(fallback);
  return parsed;
};

const normalizeString = (value) =>
  value == null ? null : String(value).trim().toLowerCase();

const CARD_BUCKETS = Object.freeze([
  "common_bronze",
  "rare_bronze",
  "common_silver",
  "rare_silver",
  "common_gold",
  "rare_gold",
]);
const CARD_BUCKET_SET = new Set(CARD_BUCKETS);

const normalizeCardBucketValue = (value) => {
  const text = normalizeString(value);
  if (!text) return null;
  const normalized = text.replace(/[\s-]+/g, "_");
  return CARD_BUCKET_SET.has(normalized) ? normalized : null;
};

const normalizeAllowedCardBuckets = (value, fallback = CARD_BUCKETS) => {
  const source =
    Array.isArray(value) || value instanceof Set
      ? Array.from(value)
      : value && typeof value === "object"
        ? Object.entries(value)
            .filter(([, enabled]) => enabled !== false)
            .map(([key]) => key)
        : [];
  const normalized = [];
  const seen = new Set();
  for (const entry of source) {
    const bucket = normalizeCardBucketValue(entry);
    if (!bucket || seen.has(bucket)) continue;
    seen.add(bucket);
    normalized.push(bucket);
  }
  if (normalized.length) return normalized;
  const fallbackList =
    Array.isArray(fallback) || fallback instanceof Set
      ? Array.from(fallback)
      : CARD_BUCKETS;
  const fallbackNormalized = [];
  const fallbackSeen = new Set();
  for (const entry of fallbackList) {
    const bucket = normalizeCardBucketValue(entry);
    if (!bucket || fallbackSeen.has(bucket)) continue;
    fallbackSeen.add(bucket);
    fallbackNormalized.push(bucket);
  }
  return fallbackNormalized.length ? fallbackNormalized : CARD_BUCKETS.slice();
};

const isTotwPlayer = (player) => {
  const rarity = normalizeString(player?.rarityName);
  if (rarity) {
    if (rarity.includes("team of the week")) return true;
    if (rarity.includes("totw")) return true;
    if (rarity.includes("inform")) return true;
  }
  return toNumber(player?.rarityId) === 3;
};

const isTotsPlayer = (player) => {
  const rarity = normalizeString(player?.rarityName);
  if (!rarity) return false;
  return rarity.includes("team of the season") || rarity.includes("tots");
};

const isTotwOrTotsPlayer = (player) =>
  isTotwPlayer(player) || isTotsPlayer(player);

const isRareBasePlayer = (player) => {
  const rarity = normalizeString(player?.rarityName);
  if (rarity?.includes("rare")) return true;
  const rarityId = toNumber(player?.rarityId);
  return rarityId != null ? rarityId >= 1 : false;
};

const getBaseCardBucket = (player) => {
  if (!player || player?.isSpecial) return null;
  const quality = player?.quality || getPlayerQuality(toNumber(player?.rating) ?? 0);
  if (!QUALITY_ORDER[quality]) return null;
  return `${isRareBasePlayer(player) ? "rare" : "common"}_${quality}`;
};

const extractValues = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(extractValues);
  if (typeof value === "object") {
    if (Array.isArray(value.values)) return value.values.flatMap(extractValues);
    if (value._collection)
      return Object.values(value._collection).flatMap(extractValues);
    return Object.values(value).flatMap(extractValues);
  }
  return [value];
};

const normalizeValueItem = (value) => {
  const numeric = toNumber(value);
  if (numeric != null) return numeric;
  return normalizeString(value);
};

const normalizeRequirementType = (rule) => {
  if (!rule) return null;
  const rawType = normalizeString(rule.type);
  const keyName = normalizeString(rule.keyNameNormalized || rule.keyName);
  const label = normalizeString(rule.label || rule?.raw?.label);
  const numericValues = extractValues(rule.value ?? rule.values)
    .map(toNumber)
    .filter((value) => value != null);
  const isRarityGroup =
    rawType === "player_rarity_group" || keyName === "player_rarity_group";
  if (isRarityGroup) {
    const geoRegionKey = deriveGeoRegionKeyFromLabel(label);
    if (geoRegionKey) return "player_geo_region";
    const hasTots =
      Boolean(label?.includes("tots")) ||
      Boolean(label?.includes("team of the season"));
    const hasTotw =
      Boolean(label?.includes("totw")) ||
      Boolean(label?.includes("team of the week")) ||
      Boolean(label?.includes("inform"));
    if (hasTots && hasTotw) return "player_totw_or_tots";
    if (hasTots) return "player_tots";
    if (numericValues.includes(44)) return "player_totw_or_tots";
  }
  const enumType =
    ENUM_TO_TYPE[rule.keyName] || ENUM_TO_TYPE[rule.keyNameNormalized];
  const type =
    enumType ||
    TYPE_ALIASES[rawType] ||
    TYPE_ALIASES[keyName] ||
    rawType ||
    keyName;
  if (type) return type;
  if (!label) return null;
  if (label.includes("players in the squad")) return "players_in_squad";
  if (label.includes("team rating")) return "team_rating";
  if (label.includes("player quality")) return "player_quality";
  if (label.includes("rare")) return "player_rarity_group";
  if (label.includes("first owner")) return "first_owner_players_count";
  if (label.includes("untrade")) return "player_tradability";
  return null;
};

const deriveGeoRegionKeyFromLabel = (label) => {
  if (!label) return null;
  const text = normalizeString(label);
  if (!text) return null;
  if (text.includes("players from africa")) return "africa";
  if (text.includes("players from europe")) return "europe";
  if (text.includes("players from asia")) return "asia";
  if (text.includes("players from south america")) return "south_america";
  if (text.includes("players from north america")) return "north_america";
  if (text.includes("players from oceania")) return "oceania";
  return null;
};

const PLAYER_GEO_REGION_NATION_IDS = Object.freeze({
  europe: Object.freeze([
    1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
    42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 205, 208, 219,
  ]),
  south_america: Object.freeze([52, 53, 54, 55, 56, 57, 58, 59, 60, 61]),
  north_america: Object.freeze([
    63, 64, 66, 67, 68, 70, 72, 73, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 87,
    88, 89, 90, 91, 92, 93, 95, 207,
  ]),
  africa: Object.freeze([
    97, 98, 99, 101, 103, 104, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115,
    116, 117, 118, 119, 120, 122, 123, 124, 126, 127, 128, 129, 130, 131, 132,
    133, 135, 136, 138, 139, 140, 141, 143, 144, 145, 146, 147, 148,
  ]),
  asia: Object.freeze([
    149, 155, 157, 159, 161, 162, 163, 165, 166, 167, 168, 169, 171, 178, 180,
    181, 182, 183, 186, 187, 191, 192, 213, 214,
  ]),
  oceania: Object.freeze([195, 197, 198, 199, 215]),
});

export const getRequirementFlags = (
  requirementsNormalized = [],
  overrides = {},
) => {
  const flags = Object.fromEntries(REQUIREMENT_KEYS.map((key) => [key, false]));
  const list = Array.isArray(requirementsNormalized)
    ? requirementsNormalized
    : [];
  const compiled = compileConstraintSet(list, {
    fallbackSquadSize: DEFAULT_SQUAD_SIZE,
  });
  for (const constraint of compiled.constraints) {
    const type = constraint?.type ?? null;
    if (!type) continue;
    if (Object.prototype.hasOwnProperty.call(flags, type)) {
      flags[type] = true;
    }
  }
  for (const [key, value] of Object.entries(overrides || {})) {
    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      flags[key] = Boolean(value);
    }
  }
  return flags;
};

const getPlayerQuality = (rating) => {
  if (rating >= 75) return "gold";
  if (rating >= 65) return "silver";
  return "bronze";
};

const normalizeQualityValue = (value) => {
  if (value == null) return null;
  const text = normalizeString(value);
  if (text === "gold" || text === "silver" || text === "bronze") return text;
  const numeric = toNumber(value);
  if (numeric != null) {
    if (numeric <= 1) return "bronze";
    if (numeric === 2) return "silver";
    if (numeric >= 3) return "gold";
  }
  return text;
};

const QUALITY_ORDER = { bronze: 1, silver: 2, gold: 3 };

const normalizeQualityValues = (values) =>
  (values || [])
    .map(normalizeQualityValue)
    .filter(
      (value) =>
        value && Object.prototype.hasOwnProperty.call(QUALITY_ORDER, value),
    );

const buildQualityGatePredicate = (rule) => {
  if (!rule) return null;
  if (rule.type !== "player_quality" && rule.type !== "player_level")
    return null;
  const normalized = normalizeQualityValues(rule.values);
  if (!normalized.length) return null;

  // Exact: allow the listed qualities.
  if (rule.op === "exact") {
    const allowed = new Set(normalized);
    return (player) => allowed.has(player?.quality);
  }

  // Min/max apply an ordinal bound across the squad.
  const ranks = normalized
    .map((quality) => QUALITY_ORDER[quality])
    .filter((rank) => rank != null);
  if (!ranks.length) return null;
  if (rule.op === "min") {
    const threshold = Math.max(...ranks);
    return (player) => (QUALITY_ORDER[player?.quality] ?? 0) >= threshold;
  }
  if (rule.op === "max") {
    const threshold = Math.min(...ranks);
    return (player) => (QUALITY_ORDER[player?.quality] ?? 0) <= threshold;
  }

  return null;
};

const isPlayerLevelQuotaRule = (rule) => {
  if (!rule || rule.type !== "player_level") return false;
  const label = normalizeString(rule?.raw?.label || rule?.label);
  if (!label) return false;
  if (label.includes("player level") || label.includes("player quality")) {
    return false;
  }
  return (
    label.includes("bronze") ||
    label.includes("silver") ||
    label.includes("gold")
  );
};

const deriveValuesFromLabel = (rule, fallback = []) => {
  if (fallback.length) return fallback;
  const label = normalizeString(rule?.label || rule?.raw?.label);
  if (!label) return fallback;
  if (rule?.type === "player_quality") {
    if (label.includes("gold")) return ["gold"];
    if (label.includes("silver")) return ["silver"];
    if (label.includes("bronze")) return ["bronze"];
  }
  if (rule?.type === "player_rarity" || rule?.type === "player_rarity_group") {
    if (label.includes("rare")) return ["rare"];
    if (label.includes("common")) return ["common"];
  }
  return fallback;
};

const normalizePlayers = (players) => {
  const list = Array.isArray(players) ? players : [];
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    if (!item || item.id == null) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const rating = toNumber(item.rating) ?? 0;
    const isSpecial =
      typeof item.isSpecial === "function"
        ? Boolean(item.isSpecial())
        : Boolean(item.isSpecial);
    const rarityName = item.rarityName ? String(item.rarityName) : null;
    const isTotw = isTotwPlayer({
      rarityName,
      rarityId: item?.rarityId ?? null,
    });
    const isTots = isTotsPlayer({
      rarityName,
      rarityId: item?.rarityId ?? null,
    });
    const isEvolution =
      typeof item.isEvolution === "function"
        ? Boolean(item.isEvolution())
        : Boolean(item.isEvolution ?? item.upgrades);
    const isConcept = isConceptPlayer(item);
    normalized.push({
      ...item,
      rating,
      quality: getPlayerQuality(rating),
      rarityName,
      isStorage: Boolean(item.isStorage),
      isUnassigned: Boolean(item.isUnassigned),
      hasStorageDuplicate: Boolean(item.hasStorageDuplicate),
      hasClubDuplicate: Boolean(item.hasClubDuplicate),
      isUntradeable: Boolean(item.isUntradeable),
      isDuplicate: Boolean(item.isDuplicate),
      isSpecial,
      isTotw,
      isTots,
      isTotwOrTots: isTotw || isTots,
      isEvolution,
      isConcept,
      concept: Boolean(item.concept || isConcept),
    });
  }
  return normalized;
};

const collectLockedPlayerIdsFromSlots = (slots) => {
  const list = Array.isArray(slots) ? slots : [];
  const lockedIds = new Set();
  for (const slot of list) {
    const item = slot?.item ?? null;
    if (!item || typeof item !== "object") continue;
    const concept =
      typeof item.isConcept === "function"
        ? item.isConcept()
        : Boolean(item?.concept);
    if (concept) continue;
    const id = item?.id ?? null;
    if (id == null) continue;
    const normalizedId = String(id);
    if (!normalizedId || normalizedId === "0") continue;
    lockedIds.add(normalizedId);
  }
  return lockedIds;
};

const roundTo = (value, decimals) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

const computeAverage = (ratings) => {
  const list = Array.isArray(ratings) ? ratings : [];
  const n = list.length;
  if (!n) return 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    total += list[i];
  }
  return total / n;
};

const computeAdjustedAverage = (ratings) => {
  const list = Array.isArray(ratings) ? ratings : [];
  const n = list.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += list[i];
  }
  const avg = sum / n;
  let adjustedSum = 0;
  for (let i = 0; i < n; i += 1) {
    const rating = list[i];
    adjustedSum += rating <= avg ? rating : 2 * rating - avg;
  }
  return adjustedSum / n;
};

const computeSquadRating = (ratings) => {
  if (!ratings.length) return 0;
  const adjustedAverage = computeAdjustedAverage(ratings);
  const roundedAverage = roundTo(adjustedAverage, ROUND_DECIMALS);
  const decimal = roundedAverage - Math.floor(roundedAverage);
  const scaledDecimal = roundTo(decimal * 100, 2);
  const base = Math.floor(roundedAverage);
  if (scaledDecimal >= ROUND_THRESHOLD * 100) return base + 1;
  return base;
};

export const buildSolverContext = ({
  players = [],
  requirementsNormalized = [],
  requirementOverrides = {},
  debug = false,
  solverDebug = false,
  filters = {},
  prioritize = {},
  optimize = {},
  requiredPlayers = null,
  squadSlots = null,
} = {}) => {
  const normalizedFilters = {
    ...(filters && typeof filters === "object" ? filters : {}),
    onlyStorage: toBooleanSetting(filters?.onlyStorage, false),
    onlyUntradeables: toBooleanSetting(filters?.onlyUntradeables, false),
    onlyDuplicates: toBooleanSetting(filters?.onlyDuplicates, false),
    useUnassigned: toBooleanSetting(filters?.useUnassigned, false),
    excludeSpecial: toBooleanSetting(filters?.excludeSpecial, false),
    useTotwPlayers: toBooleanSetting(filters?.useTotwPlayers, true),
    useEvolutionPlayers: toBooleanSetting(filters?.useEvolutionPlayers, false),
    allowConceptPlayers: toBooleanSetting(filters?.allowConceptPlayers, false),
    allowedCardBuckets: normalizeAllowedCardBuckets(
      filters?.allowedCardBuckets,
      CARD_BUCKETS,
    ),
    preserveOccupiedSlots: toBooleanSetting(
      filters?.preserveOccupiedSlots,
      false,
    ),
  };

  let normalizedPlayers = normalizePlayers(players);
  const hasStorageLinkMetadata = normalizedPlayers.some(
    (player) =>
      player?.hasStorageDuplicate === true || player?.hasClubDuplicate === true,
  );
  const lockedSlotPlayerIds = collectLockedPlayerIdsFromSlots(squadSlots);
  const excludedIds = new Set(
    (normalizedFilters?.excludedPlayerIds ?? [])
      .map((value) => (value == null ? null : String(value)))
      .filter(Boolean),
  );
  const isUnassignedBypass = (player) =>
    normalizedFilters.useUnassigned &&
    Boolean(player?.isDuplicate || player?.isUnassigned);
  if (excludedIds.size) {
    normalizedPlayers = normalizedPlayers.filter((player) => {
      if (player?.id == null) return true;
      return !excludedIds.has(String(player.id));
    });
  }
  if (!normalizedFilters.allowConceptPlayers) {
    normalizedPlayers = normalizedPlayers.filter((player) => !isConceptPlayer(player));
  }
  if (!normalizedFilters.useEvolutionPlayers) {
    normalizedPlayers = normalizedPlayers.filter((player) => {
      if (!player?.isEvolution) return true;
      if (player?.id == null) return false;
      return lockedSlotPlayerIds.has(String(player.id));
    });
  }
  if (normalizedFilters.onlyStorage) {
    normalizedPlayers = normalizedPlayers.filter((player) =>
      isUnassignedBypass(player)
        ? true
        : hasStorageLinkMetadata
          ? Boolean(player?.hasStorageDuplicate || player?.hasClubDuplicate)
          : Boolean(player?.isStorage),
    );
  }
  if (normalizedFilters.onlyUntradeables) {
    normalizedPlayers = normalizedPlayers.filter(
      (player) => isUnassignedBypass(player) || player.isUntradeable,
    );
  }
  if (normalizedFilters.onlyDuplicates) {
    normalizedPlayers = normalizedPlayers.filter(
      (player) => player.isDuplicate,
    );
  }
  if (!normalizedFilters.useTotwPlayers) {
    normalizedPlayers = normalizedPlayers.filter((player) => {
      if (!player?.isTotwOrTots) return true;
      if (player?.id == null) return false;
      return lockedSlotPlayerIds.has(String(player.id));
    });
  }
  if (normalizedFilters.excludeSpecial) {
    normalizedPlayers = normalizedPlayers.filter((player) => {
      if (!player?.isSpecial || player?.isTotwOrTots) return true;
      if (player?.id == null) return false;
      return lockedSlotPlayerIds.has(String(player.id));
    });
  }
  const allowedBucketSet = new Set(normalizedFilters.allowedCardBuckets);
  if (allowedBucketSet.size < CARD_BUCKETS.length) {
    normalizedPlayers = normalizedPlayers.filter((player) => {
      if (player?.id != null && lockedSlotPlayerIds.has(String(player.id))) {
        return true;
      }
      const bucket = getBaseCardBucket(player);
      if (!bucket) return true;
      return allowedBucketSet.has(bucket);
    });
  }
  const normalizedPrioritize = {
    ...(prioritize && typeof prioritize === "object" ? prioritize : {}),
    storage: toBooleanSetting(prioritize?.storage, true),
  };

  if (normalizedPrioritize?.duplicates) {
    normalizedPlayers = normalizedPlayers
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.isDuplicate)) - Number(Boolean(a.isDuplicate)),
      );
  }
  if (normalizedPrioritize?.untradeables) {
    normalizedPlayers = normalizedPlayers
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.isUntradeable)) - Number(Boolean(a.isUntradeable)),
      );
  }
  if (normalizedPrioritize?.storage) {
    normalizedPlayers = normalizedPlayers
      .slice()
      .sort((a, b) => getStoragePreferenceScore(b) - getStoragePreferenceScore(a));
  }
  return {
    players: normalizedPlayers,
    requirementsNormalized,
    requirementFlags: getRequirementFlags(
      requirementsNormalized,
      requirementOverrides,
    ),
    debug: Boolean(debug || solverDebug),
    optimize,
    requiredPlayers: toNumber(requiredPlayers),
    squadSlots: Array.isArray(squadSlots) ? squadSlots : null,
    filters: normalizedFilters,
  };
};

const normalizeRules = (
  requirementsNormalized,
  requirementFlags,
  debugPush,
  precompiled = null,
) => {
  const list = Array.isArray(requirementsNormalized)
    ? requirementsNormalized
    : [];
  const compiled =
    precompiled ||
    compileConstraintSet(list, {
      fallbackSquadSize: DEFAULT_SQUAD_SIZE,
    });

  for (const unsupported of compiled.unsupportedRules || []) {
    debugPush?.({
      stage: "rule",
      action: "skip",
      reason: "unmapped",
      key: unsupported?.key ?? null,
      keyName: unsupported?.keyName ?? null,
      label: unsupported?.label ?? null,
    });
  }

  return (compiled.constraints || [])
    .map((constraint) => {
      const type = constraint?.type ?? null;
      const rawRule = constraint?.raw ?? null;
      if (!type || !rawRule) return null;
      if (
        requirementFlags &&
        Object.prototype.hasOwnProperty.call(requirementFlags, type) &&
        !requirementFlags[type]
      ) {
        debugPush?.({
          stage: "rule",
          action: "skip",
          reason: "flag_disabled",
          type,
          key: rawRule.key ?? null,
          keyName: rawRule.keyName ?? null,
          label: rawRule.label ?? null,
        });
        return null;
      }

      const normalized = {
        type,
        category: constraint.category ?? null,
        op: constraint.op ?? null,
        count: constraint.count ?? null,
        target: constraint.target ?? null,
        values: Array.isArray(constraint.values) ? constraint.values : [],
        raw: rawRule,
      };
      // Validity checks run these predicates many times during rating/chemistry optimization.
      // Precompute them once to avoid rebuilding closures in hot loops.
      normalized.predicate = buildPredicate(normalized);
      normalized.gatePredicate = buildQualityGatePredicate(normalized);

      debugPush?.({
        stage: "rule",
        action: "use",
        type: normalized.type,
        category: normalized.category,
        op: normalized.op,
        count: normalized.count,
        target: normalized.target,
        values: normalized.values,
        key: rawRule.key ?? null,
        keyName: rawRule.keyName ?? null,
        label: rawRule.label ?? null,
      });

      return normalized;
    })
    .filter(Boolean);
};

const FULL_SQUAD_EXACT_TYPES = new Set([
  "player_level",
  "player_quality",
  "player_rarity",
  "player_rarity_group",
  "player_rarity_or_totw",
  "player_tots",
  "player_totw_or_tots",
  "player_tradability",
  "player_inform",
]);

const VALUE_TARGET_TYPES = new Set([
  "players_in_squad",
  "team_rating",
  "nation_count",
  "league_count",
  "club_count",
  "same_nation_count",
  "same_league_count",
  "same_club_count",
  "chemistry_points",
  "all_players_chemistry_points",
  "legend_count",
  "num_trophy_required",
]);

const getRuleCount = (rule, squadSize) => {
  if (!rule) return null;
  const count = toNumber(rule.count);
  if (count != null && count > 0) return count;
  const target = toNumber(rule.target);
  if (target != null && target > 0) return target;
  if (
    (count == null || count <= 0) &&
    rule.op === "exact" &&
    FULL_SQUAD_EXACT_TYPES.has(rule.type) &&
    squadSize != null &&
    squadSize > 0 &&
    Array.isArray(rule.values) &&
    rule.values.length
  ) {
    return squadSize;
  }
  if (rule.type === "players_in_squad") {
    const numeric = rule.values.map(toNumber).filter((v) => v != null);
    if (numeric.length) return numeric[0];
  }
  if (rule.type === "team_rating") {
    const numeric = rule.values.map(toNumber).filter((v) => v != null);
    if (numeric.length) return numeric[0];
  }
  if (count != null && count <= 0 && VALUE_TARGET_TYPES.has(rule.type)) {
    const numeric = rule.values.map(toNumber).filter((v) => v != null);
    if (numeric.length) return numeric[0];
  }
  return null;
};

const getSquadSize = (rules, fallback) => {
  const sizes = rules
    .filter((rule) => rule.type === "players_in_squad")
    .map((rule) => getRuleCount(rule))
    .filter((value) => value != null && value > 0);
  if (sizes.length) return Math.max(...sizes);
  return fallback;
};

const getTeamRatingTarget = (rules) => {
  // Rating improvement and shortfall diagnostics need a lower bound. A maximum
  // is only a ceiling, never a reason to raise a valid cheap squad's rating.
  let result = null;
  for (const rule of rules) {
    if (rule.type !== "team_rating" || rule.op === "max") continue;
    const target = getRuleCount(rule);
    if (target != null && (result == null || target > result.target)) {
      result = { target, rule: rule.raw };
    }
  }
  return result;
};

const getInformRequirementBounds = (rules, squadSize) => {
  let min = 0;
  let max = Infinity;
  for (const rule of rules || []) {
    if (!rule || rule.type !== "player_inform") continue;
    const required = getRuleCount(rule, squadSize);
    if (required == null) continue;
    if (rule.op === "min") {
      min = Math.max(min, required);
      continue;
    }
    if (rule.op === "max") {
      max = Math.min(max, required);
      continue;
    }
    if (rule.op === "exact") {
      min = Math.max(min, required);
      max = Math.min(max, required);
    }
  }
  if (!Number.isFinite(max)) max = Infinity;
  return { min, max };
};

const getSpecialRequirementBounds = (rules, squadSize) => {
  let min = 0;
  let max = Infinity;
  for (const rule of rules || []) {
    if (
      !rule ||
      (rule.type !== "player_inform" &&
        rule.type !== "player_tots" &&
        rule.type !== "player_totw_or_tots")
    ) {
      continue;
    }
    const required = getRuleCount(rule, squadSize);
    if (required == null) continue;
    if (rule.op === "min") {
      min = Math.max(min, required);
      continue;
    }
    if (rule.op === "max") {
      max = Math.min(max, required);
      continue;
    }
    if (rule.op === "exact") {
      min = Math.max(min, required);
      max = Math.min(max, required);
    }
  }
  if (!Number.isFinite(max)) max = Infinity;
  return { min, max };
};

const getUniqueCountRequirementBounds = (rules, type, squadSize) => {
  let min = 0;
  let max = Infinity;
  for (const rule of rules || []) {
    if (!rule || rule.type !== type) continue;
    const required = getRuleCount(rule, squadSize);
    if (required == null) continue;
    if (rule.op === "min") {
      min = Math.max(min, required);
      continue;
    }
    if (rule.op === "max") {
      max = Math.min(max, required);
      continue;
    }
    if (rule.op === "exact") {
      min = Math.max(min, required);
      max = Math.min(max, required);
    }
  }
  if (!Number.isFinite(max)) max = Infinity;
  return { min, max };
};

const getChemistryRequirementTargets = (rules, squadSize) => {
  let total = null;
  let minEach = null;
  for (const rule of rules || []) {
    if (!rule) continue;
    if (
      rule.type !== "chemistry_points" &&
      rule.type !== "all_players_chemistry_points"
    ) {
      continue;
    }
    const required = getRuleCount(rule, squadSize);
    if (required == null) continue;
    if (rule.type === "chemistry_points") {
      total = total == null ? required : Math.max(total, required);
    } else {
      minEach = minEach == null ? required : Math.max(minEach, required);
    }
  }
  return { total, minEach };
};

const getNoRatingConservationProfile = (rules, squadSize, signature = null) => {
  if (getTeamRatingTarget(rules || [])) return { enabled: false };
  const list = Array.isArray(rules) ? rules : [];
  const hasChemistry =
    Boolean(signature?.hasChemistry) ||
    list.some(
      (rule) =>
        rule?.type === "chemistry_points" ||
        rule?.type === "all_players_chemistry_points",
    );
  const hasComposition =
    Boolean(signature?.isCompositionPuzzle) ||
    list.some(
      (rule) =>
        rule?.type === "nation_id" ||
        rule?.type === "league_id" ||
        rule?.type === "club_id" ||
        rule?.type === "nation_count" ||
        rule?.type === "league_count" ||
        rule?.type === "club_count" ||
        rule?.type === "same_nation_count" ||
        rule?.type === "same_league_count" ||
        rule?.type === "same_club_count",
    );
  if (!hasChemistry && !hasComposition) return { enabled: false };

  let minQualityRank = 0;
  let exactQualityRank = null;
  let qualityQuotaRank = 0;
  for (const rule of list) {
    if (
      !rule ||
      (rule.type !== "player_quality" && rule.type !== "player_level")
    ) {
      continue;
    }
    const qualities = normalizeQualityValues(rule.values);
    if (!qualities.length) continue;
    const ranks = qualities
      .map((quality) => QUALITY_ORDER[quality])
      .filter((rank) => rank != null);
    if (!ranks.length) continue;
    const required = getRuleCount(rule, squadSize);
    const fullSquad =
      required == null || required >= Math.max(1, toNumber(squadSize) ?? 0);
    if (rule.op === "exact") {
      const rank = Math.min(...ranks);
      if (fullSquad) {
        exactQualityRank =
          exactQualityRank == null ? rank : Math.min(exactQualityRank, rank);
      } else {
        qualityQuotaRank = Math.max(qualityQuotaRank, rank);
      }
      continue;
    }
    if (rule.op === "min") {
      const rank = Math.max(...ranks);
      if (fullSquad) minQualityRank = Math.max(minQualityRank, rank);
      else qualityQuotaRank = Math.max(qualityQuotaRank, rank);
      continue;
    }
    if (rule.op === "max") {
      const rank = Math.min(...ranks);
      if (fullSquad) {
        exactQualityRank =
          exactQualityRank == null ? rank : Math.min(exactQualityRank, rank);
      }
    }
  }

  const effectiveRank =
    exactQualityRank ?? Math.max(minQualityRank, qualityQuotaRank);
  const pivot =
    effectiveRank >= QUALITY_ORDER.gold
      ? 75
      : effectiveRank === QUALITY_ORDER.silver
        ? 65
        : effectiveRank === QUALITY_ORDER.bronze
          ? 55
          : 75;
  const softMaxRating =
    effectiveRank >= QUALITY_ORDER.gold
      ? 80
      : effectiveRank === QUALITY_ORDER.silver
        ? 70
        : effectiveRank === QUALITY_ORDER.bronze
          ? 64
          : 79;

  return {
    enabled: true,
    pivot,
    softMaxRating,
    wasteMaxRating: softMaxRating + 2,
    wasteHighRatingScore: Math.max(
      1000,
      Math.pow(Math.max(2, softMaxRating - pivot + 2), 3),
    ),
    qualityRank: effectiveRank || null,
  };
};

const getNoRatingConservationPivot = (profile) =>
  profile?.enabled ? toNumber(profile.pivot) : null;

const getLowRatingConservationProfile = (rules, squadSize, signature = null) => {
  const target = toNumber(signature?.ratingTarget);
  if (target == null) return { enabled: false };
  if (target < 77 || target > 78) return { enabled: false };

  const list = Array.isArray(rules) ? rules : [];
  const hasChemistry =
    Boolean(signature?.hasChemistry) ||
    list.some(
      (rule) =>
        rule?.type === "chemistry_points" ||
        rule?.type === "all_players_chemistry_points",
    );
  const hasComposition =
    Boolean(signature?.isCompositionPuzzle) ||
    list.some(
      (rule) =>
        rule?.type === "nation_id" ||
        rule?.type === "league_id" ||
        rule?.type === "club_id" ||
        rule?.type === "nation_count" ||
        rule?.type === "league_count" ||
        rule?.type === "club_count" ||
        rule?.type === "same_nation_count" ||
        rule?.type === "same_league_count" ||
        rule?.type === "same_club_count" ||
        rule?.type === "player_rarity" ||
        rule?.type === "player_rarity_group" ||
        rule?.type === "player_rarity_or_totw",
    );
  if (!hasChemistry && !hasComposition) return { enabled: false };

  const pivot = Math.max(75, Math.min(80, Math.floor(target) + 1));
  const softMaxRating = Math.max(
    pivot + 1,
    Math.min(83, Math.floor(target) + (target <= 75 ? 4 : 3)),
  );

  return {
    enabled: true,
    pivot,
    softMaxRating,
    wasteMaxRating: softMaxRating + 2,
    wasteHighRatingScore: Math.max(
      180,
      Math.pow(Math.max(2, softMaxRating - pivot + 2), 3),
    ),
    ratingTarget: target,
  };
};

const getRarityHint = (rule) => {
  const label = normalizeString(rule?.raw?.label);
  if (label) {
    if (label.includes("rare")) return "rare";
    if (label.includes("common")) return "common";
  }
  const textValues = rule?.values?.map(normalizeString).filter(Boolean) || [];
  if (textValues.some((value) => value.includes("rare"))) return "rare";
  if (textValues.some((value) => value.includes("common"))) return "common";
  return null;
};

const isInformPlayer = (player) => {
  const rarity = normalizeString(player?.rarityName);
  if (rarity) {
    if (rarity.includes("team of the week")) return true;
    if (rarity.includes("totw")) return true;
    if (rarity.includes("inform")) return true;
  }
  if (toNumber(player?.rarityId) === 3) return true;
  return false;
};

const isChemistrySatisfied = (chemistry, targets) => {
  if (!targets) return true;
  const totalTarget = toNumber(targets.total);
  const minTarget = toNumber(targets.minEach);
  if (totalTarget == null && minTarget == null) return true;
  if (!chemistry) return false;
  if (totalTarget != null && (toNumber(chemistry.totalChem) ?? 0) < totalTarget)
    return false;
  if (minTarget != null && (toNumber(chemistry.minChem) ?? 0) < minTarget)
    return false;
  return true;
};

const getChemistryShortfall = (chemistry, targets) => {
  const totalTarget = toNumber(targets?.total);
  const minTarget = toNumber(targets?.minEach);
  const totalChem = toNumber(chemistry?.totalChem) ?? 0;
  const minChem = toNumber(chemistry?.minChem) ?? 0;
  const totalShort =
    totalTarget == null ? 0 : Math.max(0, totalTarget - totalChem);
  const minShort = minTarget == null ? 0 : Math.max(0, minTarget - minChem);
  return {
    totalShort,
    minShort,
    // Per-player minimum chemistry is usually harder to satisfy than +1 total chemistry.
    score: totalShort + minShort * 3,
  };
};

const getRuleValues = (rule) => {
  if (Array.isArray(rule?.values)) return rule.values;
  if (Array.isArray(rule?.value)) return rule.value;
  if (rule?.value != null) return [rule.value];
  return [];
};

const buildPredicate = (rule) => {
  if (!rule) return null;
  const values = getRuleValues(rule);
  const type = rule.type;
  if (type === "player_level" && isPlayerLevelQuotaRule(rule)) {
    const normalized = normalizeQualityValues(values);
    if (!normalized.length) return null;
    const allowed = new Set(normalized);
    return (player) => allowed.has(player?.quality);
  }
  if (type === "player_quality" || type === "player_level") {
    return buildQualityGatePredicate(rule);
  }
  if (type === "player_totw_or_tots") {
    return (player) => isTotwOrTotsPlayer(player);
  }
  if (type === "player_tots") {
    return (player) => isTotsPlayer(player);
  }
  if (
    type === "player_rarity" ||
    type === "player_rarity_group" ||
    type === "player_rarity_or_totw"
  ) {
    const numericValues = values.map(toNumber).filter((v) => v != null);
    const textValues = values.map(normalizeString).filter(Boolean);
    const hint = getRarityHint(rule);
    return (player) => {
      if (type === "player_rarity_or_totw") {
        const name = normalizeString(player.rarityName);
        const rareMatch = !player.isSpecial && ((player.rarityId != null ? player.rarityId >= 1 : false) || (name ? name.includes("rare") : false));
        return rareMatch || isTotwPlayer(player);
      }
      const name = normalizeString(player.rarityName);
      const numericMatch =
        numericValues.length && player.rarityId != null
          ? numericValues.includes(player.rarityId)
          : false;
      const textMatch =
        textValues.length && name
          ? textValues.some((value) => name.includes(value))
          : false;
      if (hint === "rare") {
        // EA treats "Rare" as the base rare/common flag, not "any special card".
        // Special items (TOTW, promos, etc.) should not satisfy generic "Rare: Min X" constraints.
        // This preserves specials and prevents false-positive eligibility when EA excludes specials.
        const isRare =
          numericMatch ||
          (player.rarityId != null ? player.rarityId >= 1 : false) ||
          (name ? name.includes("rare") : false) ||
          textMatch;
        return isRare && !player.isSpecial;
      }
      if (hint === "common") {
        return (
          numericMatch ||
          (player.rarityId != null ? player.rarityId === 0 : false) ||
          (name ? name.includes("common") : false) ||
          textMatch
        );
      }
      if (numericMatch || textMatch) return true;
      return false;
    };
  }
  if (type === "nation_id") {
    const ids = values.map(toNumber).filter((v) => v != null);
    if (!ids.length) return null;
    return (player) => ids.includes(player.nationId);
  }
  if (type === "player_geo_region") {
    const normalizedValues = values.map(normalizeString).filter(Boolean);
    const regionKey =
      normalizedValues.find((value) => PLAYER_GEO_REGION_NATION_IDS[value]) ||
      deriveGeoRegionKeyFromLabel(rule?.raw?.label) ||
      deriveGeoRegionKeyFromLabel(rule?.label);
    if (!regionKey) return null;
    const ids = new Set(PLAYER_GEO_REGION_NATION_IDS[regionKey] || []);
    if (!ids.size) return null;
    return (player) => {
      const nationId = toNumber(player?.nationId);
      return nationId != null && ids.has(nationId);
    };
  }
  if (type === "league_id") {
    const ids = values.map(toNumber).filter((v) => v != null);
    if (!ids.length) return null;
    return (player) => ids.includes(player.leagueId);
  }
  if (type === "club_id") {
    const ids = values.map(toNumber).filter((v) => v != null);
    if (!ids.length) return null;
    return (player) => ids.includes(player.teamId);
  }
  if (type === "first_owner_players_count") {
    return (player) => {
      const owners = toNumber(player.owners);
      if (owners != null) return owners <= 1;
      return Boolean(player.isFirstOwner);
    };
  }
  if (type === "player_tradability") {
    const normalized = values.map(normalizeString).filter(Boolean);
    const numeric = values.map(toNumber).filter((v) => v != null);
    return (player) => {
      if (numeric.length) {
        if (numeric.includes(1)) return Boolean(player.isTradeable);
        if (numeric.includes(0)) return !player.isTradeable;
      }
      if (normalized.some((value) => value.includes("untrade"))) {
        return !player.isTradeable;
      }
      if (normalized.some((value) => value.includes("trade"))) {
        return Boolean(player.isTradeable);
      }
      return false;
    };
  }
  if (type === "player_exact_ovr") {
    const threshold = toNumber(values[0]);
    if (threshold == null) return null;
    return (player) => player.rating === threshold;
  }
  if (type === "player_min_ovr") {
    const threshold = toNumber(values[0]);
    if (threshold == null) return null;
    return (player) => player.rating >= threshold;
  }
  if (type === "player_max_ovr") {
    const threshold = toNumber(values[0]);
    if (threshold == null) return null;
    return (player) => player.rating <= threshold;
  }
  if (type === "player_inform") {
    return (player) => isInformPlayer(player);
  }
  if (type === "loan_players") {
    return (player) => Boolean(player.isLoaned || player.isLoan);
  }
  return null;
};

const countByAttr = (squad, attr) => {
  const counts = new Map();
  for (const player of squad) {
    const value = player?.[attr];
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
};

const countMatching = (squad, predicate) =>
  squad.reduce((total, player) => (predicate(player) ? total + 1 : total), 0);

const getAvailablePlayers = (players, squad) => {
  const used = new Set(squad.map((player) => player.id));
  return players.filter((player) => !used.has(player.id));
};

const pickLowestRated = (players, lockedIds) => {
  let best = null;
  for (const player of players) {
    if (!player) continue;
    if (lockedIds?.has(player.id)) continue;
    if (!best || player.rating < best.rating) best = player;
  }
  return best;
};

const pickHighestRated = (players, lockedIds) => {
  let best = null;
  for (const player of players) {
    if (!player) continue;
    if (lockedIds?.has(player.id)) continue;
    if (!best || player.rating > best.rating) best = player;
  }
  return best;
};

const replacePlayer = (squad, outPlayer, inPlayer) => {
  const index = squad.findIndex((player) => player.id === outPlayer.id);
  if (index === -1) return false;
  squad[index] = inPlayer;
  return true;
};

const AXIS_TO_ATTR = {
  league: "leagueId",
  nation: "nationId",
  club: "teamId",
};

const getSeedPoolBiasScore = (player, seed) => {
  if (!seed || typeof seed?.poolBias !== "function") return 0;
  const score = toNumber(seed.poolBias(player));
  return score == null ? 0 : score;
};

const getStoragePreferenceScore = (player) => {
  if (!player) return 0;
  if (player?.isStorage) return 3;
  if (player?.hasStorageDuplicate) return 2;
  if (player?.hasClubDuplicate) return 1;
  return 0;
};

const getConceptSelectionPenalty = (player) => (isConceptPlayer(player) ? 1 : 0);

const compareBucketPlayers = (a, b, options = {}) => {
  const avoidSpecials = options?.avoidSpecials !== false;
  const avoidTotwOrTots = options?.avoidTotwOrTots !== false;
  if (
    avoidTotwOrTots &&
    Boolean(a?.isTotwOrTots) !== Boolean(b?.isTotwOrTots)
  ) {
    return Boolean(a?.isTotwOrTots) ? 1 : -1;
  }
  if (avoidSpecials && Boolean(a?.isSpecial) !== Boolean(b?.isSpecial)) {
    return Boolean(a?.isSpecial) ? 1 : -1;
  }
  if (Boolean(a?.isUntradeable) !== Boolean(b?.isUntradeable)) {
    return Boolean(a?.isUntradeable) ? -1 : 1;
  }
  const storagePreferenceDiff =
    getStoragePreferenceScore(b) - getStoragePreferenceScore(a);
  if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
  return (toNumber(a?.id) ?? 0) - (toNumber(b?.id) ?? 0);
};

const buildRatingBucketCandidates = (players, options = {}) => {
  const source = Array.isArray(players) ? players : [];
  const pivot = Math.max(0, Math.round(toNumber(options?.pivot) ?? 84));
  const maxRating =
    toNumber(options?.maxRating) ??
    source.reduce(
      (max, player) => Math.max(max, toNumber(player?.rating) ?? 0),
      0,
    );
  const maxCandidates = Math.max(1, toNumber(options?.maxCandidates) ?? 240);
  const perRatingLimit = Math.max(1, toNumber(options?.perRatingLimit) ?? 32);
  const specialPerRatingLimit = Math.max(
    1,
    toNumber(options?.specialPerRatingLimit) ?? 8,
  );
  const avoidSpecials = options?.avoidSpecials !== false;
  const avoidTotwOrTots = options?.avoidTotwOrTots !== false;
  const includeFallback = options?.includeFallback !== false;
  const initialBelow = Math.max(0, toNumber(options?.initialBelow) ?? 2);
  const initialAbove = Math.max(0, toNumber(options?.initialAbove) ?? 1);
  const stageBelowStep = Math.max(1, toNumber(options?.stageBelowStep) ?? 1);
  const stageAboveStep = Math.max(1, toNumber(options?.stageAboveStep) ?? 1);
  const maxNormalAbove = Math.max(
    initialAbove,
    toNumber(options?.maxNormalAbove) ?? 5,
  );
  const maxNormalBelow = Math.max(
    initialBelow,
    toNumber(options?.maxNormalBelow) ?? 5,
  );
  const minAllowedRating =
    toNumber(options?.minRating) ??
    source.reduce(
      (min, player) => Math.min(min, toNumber(player?.rating) ?? Infinity),
      Infinity,
    );
  const byRating = new Map();
  for (const player of source) {
    if (!player || player.id == null) continue;
    const rating = toNumber(player?.rating);
    if (rating == null) continue;
    if (rating > maxRating) continue;
    if (rating < minAllowedRating) continue;
    if (!byRating.has(rating)) byRating.set(rating, []);
    byRating.get(rating).push(player);
  }
  for (const list of byRating.values()) {
    list.sort((a, b) =>
      compareBucketPlayers(a, b, { avoidSpecials, avoidTotwOrTots }),
    );
  }

  const selected = [];
  const seen = new Set();
  const openedStages = [];
  const pushRange = (minRating, maxStageRating, mode) => {
    const minNum = Math.max(0, Math.floor(minRating));
    const maxNum = Math.min(Math.floor(maxRating), Math.floor(maxStageRating));
    if (maxNum < minNum || selected.length >= maxCandidates) return;
    openedStages.push({ mode, minRating: minNum, maxRating: maxNum });
    const ratings = [];
    for (let rating = minNum; rating <= maxNum; rating += 1) {
      ratings.push(rating);
    }
    ratings.sort((a, b) => {
      const da = Math.abs(a - pivot);
      const db = Math.abs(b - pivot);
      if (da !== db) return da - db;
      return a - b;
    });
    for (const rating of ratings) {
      const list = byRating.get(rating) || [];
      if (!list.length) continue;
      let normalCount = 0;
      let specialCount = 0;
      for (const player of list) {
        if (selected.length >= maxCandidates) break;
        const id = player?.id;
        if (id == null || seen.has(id)) continue;
        const isSpecialCandidate =
          Boolean(player?.isSpecial) || Boolean(player?.isTotwOrTots);
        if (
          mode !== "fallback" &&
          ((avoidSpecials && player?.isSpecial) ||
            (avoidTotwOrTots && player?.isTotwOrTots))
        ) {
          continue;
        }
        if (isSpecialCandidate) {
          if (specialCount >= specialPerRatingLimit) continue;
          specialCount += 1;
        } else {
          if (normalCount >= perRatingLimit) continue;
          normalCount += 1;
        }
        seen.add(id);
        selected.push(player);
      }
    }
  };

  for (
    let below = initialBelow, above = initialAbove;
    below <= maxNormalBelow || above <= maxNormalAbove;
    below += stageBelowStep, above += stageAboveStep
  ) {
    pushRange(pivot - below, pivot + above, "efficient");
    if (selected.length >= maxCandidates) break;
  }
  if (includeFallback && selected.length < maxCandidates) {
    pushRange(minAllowedRating, maxRating, "fallback");
  }
  return { candidates: selected, openedStages };
};

const getPrefillBiasBoost = (prefillBias, attr, group) => {
  if (!prefillBias || typeof prefillBias !== "object") return 0;
  const biasAttr = AXIS_TO_ATTR[prefillBias.axis] ?? null;
  if (!biasAttr || biasAttr !== attr) return 0;
  if (group == null || prefillBias.groupId == null) return 0;
  if (String(group) !== String(prefillBias.groupId)) return 0;
  return Math.max(1, toNumber(prefillBias.strength) ?? 3) * 1000;
};

const getDistinctAttrCounts = (players, attr) => {
  const counts = new Map();
  for (const player of players || []) {
    const value = player?.[attr];
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
};

const getDominantAttrCount = (players, attr) => {
  let max = 0;
  for (const count of getDistinctAttrCounts(players, attr).values()) {
    if (count > max) max = count;
  }
  return max;
};

const getCoverageWithinDistinctLimit = (players, attr, limit) => {
  const maxDistinct = toNumber(limit);
  if (maxDistinct == null || maxDistinct <= 0) return 0;
  const counts = Array.from(getDistinctAttrCounts(players, attr).values()).sort(
    (a, b) => b - a,
  );
  if (!Number.isFinite(maxDistinct)) {
    return counts.reduce((total, count) => total + count, 0);
  }
  return counts
    .slice(0, maxDistinct)
    .reduce((total, count) => total + count, 0);
};

const getDistinctNeededForCoverage = (players, attr, requiredCount) => {
  const target = toNumber(requiredCount);
  if (target == null || target <= 0) return 0;
  const counts = Array.from(getDistinctAttrCounts(players, attr).values()).sort(
    (a, b) => b - a,
  );
  let covered = 0;
  for (let index = 0; index < counts.length; index += 1) {
    covered += counts[index];
    if (covered >= target) return index + 1;
  }
  return null;
};

const getSameAxisMinTarget = (signature, axis, squadSize = null) => {
  const squadCap = Math.max(1, toNumber(squadSize) ?? Infinity);
  const rawTarget =
    axis === "league"
      ? toNumber(signature?.sameLeagueMin)
      : axis === "nation"
        ? toNumber(signature?.sameNationMin)
        : axis === "club"
          ? toNumber(signature?.sameClubMin)
          : null;
  if (rawTarget == null || rawTarget <= 0) return null;
  return Math.min(rawTarget, squadCap);
};

const getUniqueCountLimitForAttr = (signature, attr) => {
  if (attr === "nationId") return toNumber(signature?.nationCountMax);
  if (attr === "leagueId") return toNumber(signature?.leagueCountMax);
  if (attr === "teamId") return toNumber(signature?.clubCountMax);
  return null;
};

const getCrossAxisTargetDescriptors = (signature) => {
  const descriptors = [];
  const sameLeagueMin = toNumber(signature?.sameLeagueMin) ?? 0;
  const sameNationMin = toNumber(signature?.sameNationMin) ?? 0;
  const sameClubMin = toNumber(signature?.sameClubMin) ?? 0;
  if (sameLeagueMin > 0) {
    descriptors.push({ axis: "league", attr: "leagueId", target: sameLeagueMin });
  }
  if (sameNationMin > 0) {
    descriptors.push({ axis: "nation", attr: "nationId", target: sameNationMin });
  }
  if (sameClubMin > 0) {
    descriptors.push({ axis: "club", attr: "teamId", target: sameClubMin });
  }
  return descriptors;
};

// Composition seeds cannot be ranked only by raw pool size. Tight unique caps
// like "max 2 nations" change which league/nation basins are actually viable.
const scoreGroupCompositionFit = (players, axis, signature, squadSize = null) => {
  const groupPlayers = Array.isArray(players) ? players : [];
  if (!groupPlayers.length || !axis || !signature) return 0;
  const axisAttr = AXIS_TO_ATTR[axis] ?? null;
  const axisTarget = getSameAxisMinTarget(signature, axis, squadSize);
  let score = 0;

  if (axisAttr && axisTarget != null && axisTarget > 0) {
    for (const crossAttr of ["nationId", "leagueId", "teamId"]) {
      if (crossAttr === axisAttr) continue;
      const distinctLimit = getUniqueCountLimitForAttr(signature, crossAttr);
      if (distinctLimit == null || distinctLimit <= 0 || !Number.isFinite(distinctLimit)) {
        continue;
      }
      const coverage = getCoverageWithinDistinctLimit(
        groupPlayers,
        crossAttr,
        distinctLimit,
      );
      const distinctNeeded = getDistinctNeededForCoverage(
        groupPlayers,
        crossAttr,
        axisTarget,
      );
      if (coverage < axisTarget) {
        score -= (axisTarget - coverage) * 220;
      } else {
        score += coverage * 6;
      }
      if (distinctNeeded != null) {
        score += Math.max(0, axisTarget + 2 - distinctNeeded) * 22;
      }
    }
  }

  for (const descriptor of getCrossAxisTargetDescriptors(signature)) {
    if (descriptor.axis === axis) continue;
    const dominantCount = getDominantAttrCount(groupPlayers, descriptor.attr);
    score += dominantCount * 10;
    const cappedTarget = Math.min(
      descriptor.target,
      Math.max(1, toNumber(squadSize) ?? descriptor.target),
    );
    if (dominantCount < cappedTarget) {
      score -= (cappedTarget - dominantCount) * 18;
    }
  }

  return score;
};

const getGroupRuleFitWeight = (rule) => {
  switch (rule?.type) {
    case "player_level":
    case "player_quality":
      return 34;
    case "player_rarity":
    case "player_rarity_group":
    case "player_tots":
    case "player_totw_or_tots":
    case "player_rarity_or_totw":
      return 32;
    case "player_inform":
      return 38;
    case "first_owner_players_count":
    case "player_tradability":
      return 18;
    default:
      return 12;
  }
};

// Same-group selection cannot be based only on chemistry structure. Once a challenge
// reserves most of the squad for one league/nation/club, that basin also needs enough
// quota supply (gold, rare, informs, etc.) to finish the squad with the few outside
// slots that remain.
const scoreGroupRuleFit = (
  players,
  rules,
  signature,
  axis,
  squadSize = null,
  currentSquad = [],
  requiredSameCount = null,
) => {
  const groupPlayers = Array.isArray(players) ? players : [];
  const ruleList = Array.isArray(rules) ? rules : [];
  if (!groupPlayers.length || !ruleList.length || !axis) return 0;
  const squadCap = Math.max(1, toNumber(squadSize) ?? groupPlayers.length);
  const axisTarget = Math.max(
    0,
    Math.min(
      squadCap,
      toNumber(requiredSameCount) ?? getSameAxisMinTarget(signature, axis, squadCap) ?? 0,
    ),
  );
  if (axisTarget <= 0) return 0;

  const currentList = Array.isArray(currentSquad) ? currentSquad : [];
  const outsideSlots = Math.max(0, squadCap - axisTarget);
  let score = 0;
  let matchedAnyQuota = false;

  for (const rule of ruleList) {
    if (!rule || !PREFILL_PREFERENCE_TYPES.has(rule.type)) continue;
    if (rule.op !== "min" && rule.op !== "exact") continue;
    const required = getRuleCount(rule, squadCap);
    if (required == null || required <= 0) continue;
    const predicate = rule.predicate || buildPredicate(rule);
    if (typeof predicate !== "function") continue;

    matchedAnyQuota = true;
    const currentSatisfied = countMatching(currentList, predicate);
    const remainingRequired = Math.max(0, required - currentSatisfied);
    const withinGroup = countMatching(groupPlayers, predicate);
    const minNeededFromGroup = Math.max(0, remainingRequired - outsideSlots);
    const coveredByGroup = Math.min(withinGroup, remainingRequired);
    const weight = getGroupRuleFitWeight(rule);

    if (remainingRequired <= 0) {
      score += Math.max(6, weight);
      continue;
    }

    if (withinGroup < minNeededFromGroup) {
      score -= (minNeededFromGroup - withinGroup) * weight * 14;
      continue;
    }

    score += minNeededFromGroup * weight * 5;
    score += coveredByGroup * weight;
    score += Math.max(0, withinGroup - minNeededFromGroup) * Math.max(3, Math.floor(weight / 5));
  }

  const ratingTarget = toNumber(signature?.ratingTarget);
  if (ratingTarget != null && ratingTarget > 0) {
    const topRatings = groupPlayers
      .map((player) => toNumber(player?.rating) ?? 0)
      .sort((a, b) => b - a)
      .slice(0, Math.min(groupPlayers.length, Math.max(1, axisTarget)));
    if (topRatings.length) {
      score += computeAverage(topRatings) * (matchedAnyQuota ? 3 : 2);
    }
  }

  return score;
};

const shouldBroadenSeedExploration = (signature, axis) => {
  const axisAttr = AXIS_TO_ATTR[axis] ?? null;
  if (!axisAttr) return false;
  const target = getSameAxisMinTarget(signature, axis);
  if (target == null || target <= 0) return false;
  for (const attr of ["nationId", "leagueId", "teamId"]) {
    if (attr === axisAttr) continue;
    const distinctLimit = getUniqueCountLimitForAttr(signature, attr);
    if (distinctLimit != null && distinctLimit > 0 && Number.isFinite(distinctLimit)) {
      return true;
    }
  }
  return false;
};

const selectGroupForSameCount = (players, attr, required, options = {}) => {
  const groups = new Map();
  for (const player of players) {
    const value = player?.[attr];
    if (value == null) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(player);
  }
  const axis =
    Object.entries(AXIS_TO_ATTR).find(([, axisAttr]) => axisAttr === attr)?.[0] ??
    null;
  let bestGroup = null;
  let bestFitScore = -Infinity;
  let bestCount = 0;
  let bestAvg = -Infinity;
  for (const [group, list] of groups.entries()) {
    if (required != null && list.length < required) continue;
    const avg = computeAverage(list.map((player) => player.rating));
    const biasBoost = getPrefillBiasBoost(options?.prefillBias, attr, group);
    const fitScore =
      biasBoost +
      scoreGroupCompositionFit(
        list,
        axis,
        options?.signature ?? null,
        options?.squadSize ?? null,
      ) +
      scoreGroupRuleFit(
        list,
        options?.rules ?? null,
        options?.signature ?? null,
        axis,
        options?.squadSize ?? null,
        options?.currentSquad ?? [],
        required,
      );
    if (
      fitScore > bestFitScore ||
      (fitScore === bestFitScore && list.length > bestCount) ||
      (fitScore === bestFitScore && list.length === bestCount && avg > bestAvg)
    ) {
      bestGroup = group;
      bestFitScore = fitScore;
      bestCount = list.length;
      bestAvg = avg;
    }
  }
  return bestGroup;
};

const PREFILL_PREFERENCE_TYPES = new Set([
  "nation_id",
  "league_id",
  "club_id",
  "player_geo_region",
  "player_level",
  "player_quality",
  "player_rarity",
  "player_rarity_group",
  "player_rarity_or_totw",
  "player_tots",
  "player_totw_or_tots",
  "player_tradability",
  "first_owner_players_count",
  "player_exact_ovr",
  "player_inform",
]);

const buildPrefillPreferencePredicates = (rules, squad, squadSize) => {
  const preferences = [];
  for (const rule of rules || []) {
    if (!rule || !PREFILL_PREFERENCE_TYPES.has(rule.type)) continue;
    if (rule.op !== "min" && rule.op !== "exact") continue;
    const required = getRuleCount(rule, squadSize);
    if (required == null || required <= 0) continue;
    const predicate = rule.predicate || buildPredicate(rule);
    if (typeof predicate !== "function") continue;
    const current = countMatching(squad, predicate);
    const deficit = required - current;
    if (deficit <= 0) continue;
    preferences.push({
      type: rule.type,
      predicate,
      weight: deficit,
    });
  }
  return preferences;
};

const prefillPlayers = (
  squad,
  pool,
  predicate,
  required,
  lockedIds,
  options = {},
) => {
  if (!predicate || required == null || required <= 0) return false;
  const squadSizeCap = toNumber(options?.squadSizeCap);
  const ratingHintPivot = toNumber(options?.ratingHint?.pivot);
  const useRatingHint =
    ratingHintPivot != null && Number.isFinite(ratingHintPivot);
  const preferencePredicates = Array.isArray(options?.preferencePredicates)
    ? options.preferencePredicates.filter(
        (entry) => entry && typeof entry.predicate === "function",
      )
    : [];
  const remainingCapacity =
    squadSizeCap != null && Array.isArray(squad)
      ? Math.max(0, squadSizeCap - squad.length)
      : null;
  if (remainingCapacity != null && remainingCapacity <= 0) return false;
  const current = countMatching(squad, predicate);
  const targetNeeded = Math.max(0, required - current);
  let needed = targetNeeded;
  if (needed <= 0) return true;
  if (remainingCapacity != null) {
    needed = Math.min(needed, remainingCapacity);
    if (needed <= 0) return true;
  }

  const uniqueMaxByAttr = options?.uniqueMaxByAttr;
  const sameMaxByAttr = options?.sameMaxByAttr;
  const predicateCaps = Array.isArray(options?.predicateCaps)
    ? options.predicateCaps
    : [];
  const uniqueEntries =
    uniqueMaxByAttr instanceof Map
      ? Array.from(uniqueMaxByAttr.entries())
      : uniqueMaxByAttr && typeof uniqueMaxByAttr === "object"
        ? Object.entries(uniqueMaxByAttr)
        : [];
  const uniqueState = uniqueEntries
    .map(([attr, max]) => ({ attr, max: toNumber(max), values: new Set() }))
    .filter((entry) => entry.attr && entry.max != null && entry.max > 0);
  for (const entry of uniqueState) {
    for (const player of squad || []) {
      const value = player?.[entry.attr];
      if (value == null) continue;
      entry.values.add(value);
    }
  }

  const sameEntries =
    sameMaxByAttr instanceof Map
      ? Array.from(sameMaxByAttr.entries())
      : sameMaxByAttr && typeof sameMaxByAttr === "object"
        ? Object.entries(sameMaxByAttr)
        : [];
  const sameState = sameEntries
    .map(([attr, max]) => ({ attr, max: toNumber(max), counts: new Map() }))
    .filter((entry) => entry.attr && entry.max != null && entry.max > 0);
  for (const entry of sameState) {
    for (const player of squad || []) {
      const value = player?.[entry.attr];
      if (value == null) continue;
      entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
    }
  }

  const capState = predicateCaps
    .map((cap) => {
      const max = toNumber(cap?.max ?? cap?.required);
      const pred = cap?.predicate;
      if (max == null || max < 0) return null;
      if (typeof pred !== "function") return null;
      return { max, predicate: pred, count: 0 };
    })
    .filter(Boolean);
  for (const cap of capState) {
    cap.count = countMatching(squad, cap.predicate);
  }

  const candidates = (pool || [])
    .filter((player) => player && player.id != null)
    .filter((player) => !lockedIds.has(player.id))
    .filter(predicate);

  const canAddSameMax = (candidate) => {
    for (const entry of sameState) {
      const value = candidate?.[entry.attr];
      if (value == null) return false;
      const currentCount = entry.counts.get(value) || 0;
      if (currentCount >= entry.max) return false;
    }
    return true;
  };

  const canAddPredicateCaps = (candidate) => {
    for (const cap of capState) {
      if (cap.count >= cap.max && cap.predicate(candidate)) return false;
    }
    return true;
  };

  const canAddCandidate = (candidate) => {
    let penalty = 0;
    for (const entry of uniqueState) {
      const value = candidate?.[entry.attr];
      if (value == null) return { ok: false, penalty };
      if (entry.values.has(value)) continue;
      if (entry.values.size >= entry.max) return { ok: false, penalty };
      penalty += 1;
    }
    if (!canAddSameMax(candidate)) return { ok: false, penalty };
    if (!canAddPredicateCaps(candidate)) return { ok: false, penalty };
    return { ok: true, penalty };
  };

  const getPreferenceScore = (candidate) => {
    let score = 0;
    for (const entry of preferencePredicates) {
      if (entry.predicate(candidate)) {
        score += Math.max(1, toNumber(entry.weight) ?? 1);
      }
    }
    return score;
  };

  while (needed > 0) {
    if (remainingCapacity != null && squad.length >= squadSizeCap) break;
    let best = null;
    for (const candidate of candidates) {
      if (!candidate || candidate.id == null) continue;
      if (lockedIds.has(candidate.id)) continue;
      const check = canAddCandidate(candidate);
      if (!check.ok) continue;
      const preferenceScore = getPreferenceScore(candidate);
      const seedBiasScore = getSeedPoolBiasScore(candidate, options?.seed);
      const conceptPenalty = getConceptSelectionPenalty(candidate);
      const storagePreferenceScore = getStoragePreferenceScore(candidate);
      const distance = useRatingHint
        ? Math.abs((toNumber(candidate?.rating) ?? 0) - ratingHintPivot)
        : null;
      if (
        !best ||
        check.penalty < best.penalty ||
        (check.penalty === best.penalty &&
          preferenceScore > best.preferenceScore) ||
        (check.penalty === best.penalty &&
          preferenceScore === best.preferenceScore &&
          seedBiasScore < best.seedBiasScore) ||
        (check.penalty === best.penalty &&
          preferenceScore === best.preferenceScore &&
          seedBiasScore === best.seedBiasScore &&
          conceptPenalty < best.conceptPenalty) ||
        (check.penalty === best.penalty &&
          preferenceScore === best.preferenceScore &&
          seedBiasScore === best.seedBiasScore &&
          conceptPenalty === best.conceptPenalty &&
          (useRatingHint
            ? distance < best.distance ||
              (distance === best.distance &&
                (candidate.rating < best.player.rating ||
                  (candidate.rating === best.player.rating &&
                    storagePreferenceScore > best.storagePreferenceScore)))
            : candidate.rating < best.player.rating ||
              (candidate.rating === best.player.rating &&
                storagePreferenceScore > best.storagePreferenceScore)))
      ) {
        best = {
          player: candidate,
          penalty: check.penalty,
          preferenceScore,
          seedBiasScore,
          conceptPenalty,
          storagePreferenceScore,
          distance: distance ?? 0,
        };
      }
    }
    if (!best) break;
    const picked = best.player;
    squad.push(picked);
    lockedIds.add(picked.id);
    for (const entry of uniqueState) {
      const value = picked?.[entry.attr];
      if (value == null) continue;
      entry.values.add(value);
    }
    for (const entry of sameState) {
      const value = picked?.[entry.attr];
      if (value == null) continue;
      entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
    }
    for (const cap of capState) {
      if (cap.predicate(picked)) cap.count += 1;
    }
    needed -= 1;
  }

  if (needed > 0 && options?.relaxUniqueOnFail !== false) {
    const fallback = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => !lockedIds.has(player.id))
      .filter(predicate)
      .sort((a, b) => {
        const preferenceDiff = getPreferenceScore(b) - getPreferenceScore(a);
        if (preferenceDiff !== 0) return preferenceDiff;
        const seedBiasDiff =
          getSeedPoolBiasScore(a, options?.seed) -
          getSeedPoolBiasScore(b, options?.seed);
        if (seedBiasDiff !== 0) return seedBiasDiff;
        const conceptDiff =
          getConceptSelectionPenalty(a) - getConceptSelectionPenalty(b);
        if (conceptDiff !== 0) return conceptDiff;
        if (useRatingHint) {
          const aDistance = Math.abs((toNumber(a?.rating) ?? 0) - ratingHintPivot);
          const bDistance = Math.abs((toNumber(b?.rating) ?? 0) - ratingHintPivot);
          if (aDistance !== bDistance) return aDistance - bDistance;
        }
        if (a.rating !== b.rating) return a.rating - b.rating;
        return getStoragePreferenceScore(b) - getStoragePreferenceScore(a);
      });
    for (const candidate of fallback) {
      if (remainingCapacity != null && squad.length >= squadSizeCap) break;
      if (needed <= 0) break;
      if (!candidate || candidate.id == null) continue;
      if (lockedIds.has(candidate.id)) continue;
      if (!canAddSameMax(candidate)) continue;
      if (!canAddPredicateCaps(candidate)) continue;
      squad.push(candidate);
      lockedIds.add(candidate.id);
      for (const entry of sameState) {
        const value = candidate?.[entry.attr];
        if (value == null) continue;
        entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
      }
      for (const cap of capState) {
        if (cap.predicate(candidate)) cap.count += 1;
      }
      needed -= 1;
    }
  }

  const finalCount = countMatching(squad, predicate);
  return finalCount >= required;
};

const rebuildLockedIdsFromSquad = (squad, lockedIds) => {
  if (!(lockedIds instanceof Set)) return new Set();
  lockedIds.clear();
  for (const player of Array.isArray(squad) ? squad : []) {
    const id = player?.id ?? null;
    if (id == null) continue;
    lockedIds.add(id);
  }
  return lockedIds;
};

const applyMinMaxFilters = (pool, rules) => {
  let min = null;
  let max = null;
  for (const rule of rules) {
    if (rule.type === "player_min_ovr") {
      const value = toNumber(rule.values[0]);
      if (value != null) min = min == null ? value : Math.max(min, value);
    }
    if (rule.type === "player_max_ovr") {
      const value = toNumber(rule.values[0]);
      if (value != null) max = max == null ? value : Math.min(max, value);
    }
  }
  let filtered = pool.slice();
  if (min != null) filtered = filtered.filter((player) => player.rating >= min);
  if (max != null) filtered = filtered.filter((player) => player.rating <= max);
  return { filtered, min, max };
};

const prefersNonSpecial = (player) =>
  !player?.isSpecial && !player?.isEvolution;

const prefersNonTotwOrTots = (player) => !player?.isTotwOrTots;

const canPreferredPoolStillSolveRating = (
  preferredPool,
  squad,
  squadSize,
  targetRating,
  rules,
) => {
  const target = toNumber(targetRating);
  if (target == null) return true;
  const working = Array.isArray(squad) ? squad.slice(0, squadSize) : [];
  const need = Math.max(0, (toNumber(squadSize) ?? 0) - working.length);
  if (need <= 0) {
    return (
      isSquadValidIgnoringTeamRating(rules, working, squadSize) &&
      getSquadRating(working) >= target
    );
  }
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const candidates = (preferredPool || [])
    .filter((player) => player && player.id != null)
    .filter((player) => !usedIds.has(player.id))
    .slice()
    .sort((a, b) => (toNumber(b?.rating) ?? 0) - (toNumber(a?.rating) ?? 0));
  if (candidates.length < need) return false;
  working.push(...candidates.slice(0, need));
  return (
    working.length >= (toNumber(squadSize) ?? 0) &&
    isSquadValidIgnoringTeamRating(rules, working, squadSize) &&
    getSquadRating(working) >= target
  );
};

const preferNonSpecialPlayers = (
  pool,
  squad,
  squadSize,
  lockedIds,
  options = {},
) => {
  const preferred = (pool || [])
    .filter((player) => !lockedIds.has(player.id))
    .filter(prefersNonSpecial)
    .sort((a, b) => a.rating - b.rating);
  if (
    preferred.length >= squadSize - squad.length &&
    canPreferredPoolStillSolveRating(
      preferred,
      squad,
      squadSize,
      options?.ratingTarget ?? null,
      options?.rules ?? [],
    )
  ) {
    return { pool: preferred, applied: true };
  }
  return { pool, applied: false };
};

const preferNonTotwOrTotsPlayers = (
  pool,
  squad,
  squadSize,
  lockedIds,
  options = {},
) => {
  const preferred = (pool || [])
    .filter((player) => !lockedIds.has(player.id))
    .filter(prefersNonTotwOrTots)
    .sort((a, b) => a.rating - b.rating);
  if (
    preferred.length >= squadSize - squad.length &&
    canPreferredPoolStillSolveRating(
      preferred,
      squad,
      squadSize,
      options?.ratingTarget ?? null,
      options?.rules ?? [],
    )
  ) {
    return { pool: preferred, applied: true };
  }
  return { pool, applied: false };
};

const hasExplicitTotwOrTotsRequirement = (rules = []) =>
  (rules || []).some((rule) => {
    if (!rule) return false;
    const count = Math.max(0, toNumber(rule?.count) ?? 0);
    if (count <= 0) return false;
    return (
      rule.type === "player_inform" ||
      rule.type === "player_tots" ||
      rule.type === "player_totw_or_tots"
    );
  });

const fillSquad = (squad, pool, squadSize, lockedIds, options = {}) => {
  const target = toNumber(squadSize) ?? 0;
  if (target <= 0) return [];
  const working = Array.isArray(squad) ? squad.slice() : [];
  if (working.length >= target) return working.slice(0, target);

  const ratingHintPivot = toNumber(options?.ratingHint?.pivot);
  const useRatingHint =
    ratingHintPivot != null && Number.isFinite(ratingHintPivot);

  const uniqueMaxByAttr = options?.uniqueMaxByAttr;
  const sameMaxByAttr = options?.sameMaxByAttr;
  const predicateCaps = Array.isArray(options?.predicateCaps)
    ? options.predicateCaps
    : [];
  const uniqueEntries =
    uniqueMaxByAttr instanceof Map
      ? Array.from(uniqueMaxByAttr.entries())
      : uniqueMaxByAttr && typeof uniqueMaxByAttr === "object"
        ? Object.entries(uniqueMaxByAttr)
        : [];
  const uniqueState = uniqueEntries
    .map(([attr, max]) => ({ attr, max: toNumber(max), values: new Set() }))
    .filter((entry) => entry.attr && entry.max != null && entry.max > 0);
  for (const entry of uniqueState) {
    for (const player of working) {
      const value = player?.[entry.attr];
      if (value == null) continue;
      entry.values.add(value);
    }
  }

  const sameEntries =
    sameMaxByAttr instanceof Map
      ? Array.from(sameMaxByAttr.entries())
      : sameMaxByAttr && typeof sameMaxByAttr === "object"
        ? Object.entries(sameMaxByAttr)
        : [];
  const sameState = sameEntries
    .map(([attr, max]) => ({ attr, max: toNumber(max), counts: new Map() }))
    .filter((entry) => entry.attr && entry.max != null && entry.max > 0);
  for (const entry of sameState) {
    for (const player of working) {
      const value = player?.[entry.attr];
      if (value == null) continue;
      entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
    }
  }

  const capState = predicateCaps
    .map((cap) => {
      const max = toNumber(cap?.max ?? cap?.required);
      const pred = cap?.predicate;
      if (max == null || max < 0) return null;
      if (typeof pred !== "function") return null;
      return { max, predicate: pred, count: 0 };
    })
    .filter(Boolean);
  for (const cap of capState) {
    cap.count = countMatching(working, cap.predicate);
  }

  const preferencePredicates = Array.isArray(options?.preferencePredicates)
    ? options.preferencePredicates.filter(
        (entry) => entry && typeof entry.predicate === "function",
      )
    : [];

  const canAddSameMax = (candidate) => {
    for (const entry of sameState) {
      const value = candidate?.[entry.attr];
      if (value == null) return false;
      const currentCount = entry.counts.get(value) || 0;
      if (currentCount >= entry.max) return false;
    }
    return true;
  };

  const canAddPredicateCaps = (candidate) => {
    for (const cap of capState) {
      if (cap.count >= cap.max && cap.predicate(candidate)) return false;
    }
    return true;
  };

  const canAddCandidate = (candidate) => {
    let penalty = 0;
    for (const entry of uniqueState) {
      const value = candidate?.[entry.attr];
      if (value == null) return { ok: false, penalty };
      if (entry.values.has(value)) continue;
      if (entry.values.size >= entry.max) return { ok: false, penalty };
      penalty += 1;
    }
    if (!canAddSameMax(candidate)) return { ok: false, penalty };
    if (!canAddPredicateCaps(candidate)) return { ok: false, penalty };
    return { ok: true, penalty };
  };

  const getPreferenceScore = (candidate) => {
    let score = 0;
    for (const entry of preferencePredicates) {
      if (entry.predicate(candidate)) {
        score += Math.max(1, toNumber(entry.weight) ?? 1);
      }
    }
    return score;
  };

  while (working.length < target) {
    let best = null;
    for (const candidate of pool || []) {
      if (!candidate || candidate.id == null) continue;
      if (lockedIds.has(candidate.id)) continue;
      const check = canAddCandidate(candidate);
      if (!check.ok) continue;
      const preferenceScore = getPreferenceScore(candidate);
      const conceptPenalty = getConceptSelectionPenalty(candidate);
      const storagePreferenceScore = getStoragePreferenceScore(candidate);
      const distance = useRatingHint
        ? Math.abs((toNumber(candidate?.rating) ?? 0) - ratingHintPivot)
        : null;
      if (
        !best ||
        check.penalty < best.penalty ||
        (check.penalty === best.penalty &&
          preferenceScore > best.preferenceScore) ||
        (check.penalty === best.penalty &&
          preferenceScore === best.preferenceScore &&
          conceptPenalty < best.conceptPenalty) ||
        (check.penalty === best.penalty &&
          preferenceScore === best.preferenceScore &&
          conceptPenalty === best.conceptPenalty &&
          (useRatingHint
            ? distance < best.distance ||
              (distance === best.distance &&
                (candidate.rating < best.player.rating ||
                  (candidate.rating === best.player.rating &&
                    storagePreferenceScore > best.storagePreferenceScore)))
            : candidate.rating < best.player.rating ||
              (candidate.rating === best.player.rating &&
                storagePreferenceScore > best.storagePreferenceScore)))
      ) {
        best = {
          player: candidate,
          penalty: check.penalty,
          preferenceScore,
          conceptPenalty,
          storagePreferenceScore,
          distance: distance ?? 0,
        };
      }
    }
    if (!best) break;
    const picked = best.player;
    working.push(picked);
    lockedIds.add(picked.id);
    for (const entry of uniqueState) {
      const value = picked?.[entry.attr];
      if (value == null) continue;
      entry.values.add(value);
    }
    for (const entry of sameState) {
      const value = picked?.[entry.attr];
      if (value == null) continue;
      entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
    }
    for (const cap of capState) {
      if (cap.predicate(picked)) cap.count += 1;
    }
  }

  if (working.length < target && options?.relaxUniqueOnFail !== false) {
    const remaining = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => !lockedIds.has(player.id))
      .slice()
      .sort((a, b) => {
        const preferenceDiff = getPreferenceScore(b) - getPreferenceScore(a);
        if (preferenceDiff !== 0) return preferenceDiff;
        const conceptDiff =
          getConceptSelectionPenalty(a) - getConceptSelectionPenalty(b);
        if (conceptDiff !== 0) return conceptDiff;
        if (useRatingHint) {
          const aDistance = Math.abs((toNumber(a?.rating) ?? 0) - ratingHintPivot);
          const bDistance = Math.abs((toNumber(b?.rating) ?? 0) - ratingHintPivot);
          if (aDistance !== bDistance) return aDistance - bDistance;
        }
        if (a.rating !== b.rating) return a.rating - b.rating;
        return getStoragePreferenceScore(b) - getStoragePreferenceScore(a);
      });
    for (const player of remaining) {
      if (working.length >= target) break;
      if (!player || player.id == null) continue;
      if (lockedIds.has(player.id)) continue;
      if (!canAddSameMax(player)) continue;
      if (!canAddPredicateCaps(player)) continue;
      working.push(player);
      lockedIds.add(player.id);
      for (const entry of sameState) {
        const value = player?.[entry.attr];
        if (value == null) continue;
        entry.counts.set(value, (entry.counts.get(value) || 0) + 1);
      }
      for (const cap of capState) {
        if (cap.predicate(player)) cap.count += 1;
      }
    }
  }

  return working.slice(0, target);
};

const PURE_RATING_ONLY_RULE_TYPES = new Set([
  "team_rating",
  "players_in_squad",
]);

const isPureRatingOnlySbc = (rules = [], chemistryRequired = false) =>
  !chemistryRequired &&
  (rules || []).length > 0 &&
  (rules || []).every(
    (rule) => rule && PURE_RATING_ONLY_RULE_TYPES.has(rule.type),
  );

const buildPureRatingOnlySquad = (
  squad,
  pool,
  squadSize,
  lockedIds,
  options = {},
) => {
  const working = Array.isArray(squad) ? squad.slice(0, squadSize) : [];
  const target = Math.max(0, toNumber(squadSize) ?? 0);
  if (working.length >= target) return working.slice(0, target);
  const ratingTarget = toNumber(options?.ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (ratingTarget != null ? Math.max(80, Math.floor(ratingTarget) - 1) : 84);

  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const seenDefs = new Set(
    working
      .map((player) => getDefinitionKey(player))
      .filter((value) => value != null)
      .map(String),
  );
  const available = (pool || [])
    .filter((player) => player && player.id != null)
    .filter((player) => !usedIds.has(player.id));
  const { candidates, openedStages } = buildRatingBucketCandidates(available, {
    pivot,
    maxCandidates: options?.maxCandidates ?? 260,
    perRatingLimit: options?.perRatingLimit ?? 30,
    specialPerRatingLimit: options?.specialPerRatingLimit ?? 8,
    avoidSpecials: options?.avoidSpecials !== false,
    avoidTotwOrTots: options?.avoidTotwOrTots !== false,
    includeFallback: true,
  });
  options?.debugPush?.({
    stage: "fill",
    action: "pure_rating_buckets",
    pivot,
    candidateCount: candidates.length,
    openedStages,
  });

  for (const candidate of candidates) {
    if (working.length >= target) break;
    if (!candidate || candidate.id == null) continue;
    if (lockedIds?.has(candidate.id)) continue;
    const defKey = getDefinitionKey(candidate);
    if (defKey != null && seenDefs.has(String(defKey))) continue;
    working.push(candidate);
    usedIds.add(candidate.id);
    if (defKey != null) seenDefs.add(String(defKey));
  }

  return working.slice(0, target);
};

const improveRating = (squad, pool, target, lockedIds) => {
  if (target == null) return false;
  let rating = getSquadRating(squad);
  if (rating >= target) return true;
  const candidates = pool
    .filter((player) => !squad.some((member) => member.id === player.id))
    .sort((a, b) => b.rating - a.rating);
  for (const candidate of candidates) {
    const out = pickLowestRated(squad, lockedIds);
    if (!out || candidate.rating <= out.rating) continue;
    replacePlayer(squad, out, candidate);
    rating = getSquadRating(squad);
    if (rating >= target) return true;
  }
  return rating >= target;
};

const getSquadRoundedAdjustedAverage = (players) =>
  roundTo(getSquadAdjustedAverage(players), ROUND_DECIMALS);

const getAdjustedAverageThresholdForRating = (targetRating) => {
  const target = toNumber(targetRating);
  if (target == null) return null;
  // computeSquadRating bumps base+1 when decimal >= ROUND_THRESHOLD (e.g. 0.96 => rating 85 at 84.96).
  return target - (1 - ROUND_THRESHOLD);
};

const getRatingImproveMetrics = (
  squad,
  targetRating,
  pivot,
  requiredInforms,
  requiredSpecials = 0,
) => {
  const roundedAdjustedAverage = getSquadRoundedAdjustedAverage(squad);
  const threshold = getAdjustedAverageThresholdForRating(targetRating) ?? 0;
  const shortfall = Math.max(0, threshold - roundedAdjustedAverage);
  return {
    shortfall,
    roundedAdjustedAverage,
    threshold,
    preservation: getSquadPreservationMetrics(
      squad,
      targetRating,
      pivot,
      requiredInforms,
      requiredSpecials,
    ),
  };
};

const isRatingImproveMetricsBetter = (candidate, current, options = {}) => {
  if (!candidate || !current) return false;
  const preferLowerExcessInforms = options?.preferLowerExcessInforms !== false;
  if (candidate.shortfall !== current.shortfall)
    return candidate.shortfall < current.shortfall;
  const c = candidate.preservation;
  const k = current.preservation;
  if (preferLowerExcessInforms && c.excessInforms !== k.excessInforms)
    return c.excessInforms < k.excessInforms;
  if (c.excessSpecials !== k.excessSpecials)
    return c.excessSpecials < k.excessSpecials;
  if (c.highScore !== k.highScore) return c.highScore < k.highScore;
  if (c.highCount !== k.highCount) return c.highCount < k.highCount;
  if (c.maxRating !== k.maxRating) return c.maxRating < k.maxRating;
  if (c.storageLinkedCount !== k.storageLinkedCount)
    return c.storageLinkedCount > k.storageLinkedCount;
  if (c.storageCount !== k.storageCount)
    return c.storageCount > k.storageCount;
  if (c.sumRating !== k.sumRating) return c.sumRating < k.sumRating;
  return false;
};

const isSquadValidIgnoringTeamRating = (rules, squad, squadSize) => {
  for (const rule of rules || []) {
    if (!rule) continue;
    if (rule.type === "team_rating") continue;
    const failing = evaluateRule(rule, squad, squadSize);
    if (failing) return false;
  }
  return true;
};

const improveRatingSmart = (
  squad,
  pool,
  rules,
  squadSize,
  targetRating,
  lockedIds,
  debugPush,
  options = {},
) => {
  const target = toNumber(targetRating);
  if (target == null) return false;
  if (!Array.isArray(squad) || squad.length < 1) return false;
  if (!Array.isArray(pool) || pool.length < 1) return false;

  const requiredInforms = Math.max(0, toNumber(options?.requiredInforms) ?? 0);
  const requiredSpecials = Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const avoidInforms = options?.avoidInforms !== false;
  const avoidTotwOrTots = options?.avoidTotwOrTots !== false;
  const preferLowerExcessInforms = options?.preferLowerExcessInforms !== false;
  const seed = options?.seed ?? null;

  const pivot =
    toNumber(options?.pivot) ??
    // Default: penalize ratings above the minimum needed to hit the squad rating.
    Math.max(80, Math.floor(target) - 1);
  const capOffset = toNumber(options?.capOffset) ?? 2;
  const pairShortfallThreshold = Math.max(
    0,
    toNumber(options?.pairShortfallThreshold) ?? 0.8,
  );
  const maxIterations = Math.max(10, toNumber(options?.maxIterations) ?? 80);

  const working = squad.slice(0, squadSize);
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const availableAll = (pool || [])
    .filter((player) => player && player.id != null)
    .filter((player) => !usedIds.has(player.id));
  const maxPoolRatingAll =
    availableAll.reduce(
      (max, player) => Math.max(max, toNumber(player?.rating) ?? 0),
      0,
    ) || 0;

  let includeInformCandidates = true;
  if (avoidInforms || avoidTotwOrTots) {
    const currentInformCount = working.reduce(
      (count, player) => (isInformPlayer(player) ? count + 1 : count),
      0,
    );
    const currentSpecialCount = working.reduce(
      (count, player) => (player?.isSpecial ? count + 1 : count),
      0,
    );
    if (
      (!avoidInforms || currentInformCount >= requiredInforms) &&
      (!avoidTotwOrTots || currentSpecialCount >= requiredSpecials)
    ) {
      includeInformCandidates = false;
    }
  }

  let available = includeInformCandidates
    ? availableAll
    : availableAll.filter(
        (player) =>
          (!avoidInforms || !isInformPlayer(player)) &&
          (!avoidTotwOrTots || !player?.isTotwOrTots),
      );
  let maxPoolRating =
    available.reduce(
      (max, player) => Math.max(max, toNumber(player?.rating) ?? 0),
      0,
    ) || 0;

  let cap = Math.min(maxPoolRating, Math.max(0, pivot + capOffset));
  let bestMetrics = getRatingImproveMetrics(
    working,
    target,
    pivot,
    requiredInforms,
    requiredSpecials,
  );

  const buildCandidatesForCap = (capRating) => {
    const capNum = toNumber(capRating) ?? 0;
    const window = Math.max(2, toNumber(options?.window) ?? 8);
    const maxCandidates = Math.max(60, toNumber(options?.maxCandidates) ?? 240);
    const { candidates } = buildRatingBucketCandidates(available, {
      pivot,
      maxRating: capNum,
      maxCandidates,
      perRatingLimit: options?.perRatingLimit ?? 24,
      specialPerRatingLimit: options?.specialPerRatingLimit ?? 8,
      initialBelow: Math.min(3, window),
      initialAbove: Math.max(0, Math.min(capNum - pivot, capOffset)),
      maxNormalBelow: window,
      maxNormalAbove: Math.max(0, capNum - pivot),
      avoidSpecials: !includeInformCandidates,
      avoidTotwOrTots: !includeInformCandidates,
      includeFallback: includeInformCandidates,
    });
    return candidates;
  };

  let iterations = 0;
  while (iterations < maxIterations) {
    iterations += 1;

    const currentRating = getSquadRating(working);
    if (currentRating >= target) break;

    const currentMetrics = getRatingImproveMetrics(
      working,
      target,
      pivot,
      requiredInforms,
      requiredSpecials,
    );

    let bestMove = null;
    let bestMoveKind = null;

    const candidates = buildCandidatesForCap(cap);

    // Single swaps first.
    for (let index = 0; index < working.length; index += 1) {
      const outPlayer = working[index];
      const outId = outPlayer?.id ?? null;
      if (outId != null && lockedIds?.has(outId)) continue;

      const seenDefs = new Set();
      for (let j = 0; j < working.length; j += 1) {
        if (j === index) continue;
        const defKey = getDefinitionKey(working[j]);
        if (defKey == null) continue;
        seenDefs.add(String(defKey));
      }

      for (const candidate of candidates) {
        if (!candidate || candidate.id == null) continue;
        if (usedIds.has(candidate.id)) continue;
        if (candidate.rating <= (toNumber(outPlayer?.rating) ?? 0)) continue;

        const candidateDef = getDefinitionKey(candidate);
        if (candidateDef != null && seenDefs.has(String(candidateDef)))
          continue;

        const previous = working[index];
        working[index] = candidate;

        const valid = isSquadValidIgnoringTeamRating(rules, working, squadSize);
        if (!valid) {
          working[index] = previous;
          continue;
        }

        const candidateMetrics = getRatingImproveMetrics(
          working,
          target,
          pivot,
          requiredInforms,
          requiredSpecials,
        );
        const improves = candidateMetrics.shortfall < currentMetrics.shortfall;
        if (
          improves &&
          isRatingImproveMetricsBetter(candidateMetrics, bestMetrics, {
            preferLowerExcessInforms,
          })
        ) {
          bestMetrics = candidateMetrics;
          bestMove = { index, outPlayer: previous, inPlayer: candidate };
          bestMoveKind = "single";
        }

        working[index] = previous;
      }
    }

    // If no single swap improves, attempt pair swaps within this cap.
    // Pair search is expensive; only try it when we're already close to the target.
    const shouldTryPairs =
      currentMetrics.shortfall <= pairShortfallThreshold ||
      currentRating >= target - 1;
    if (!bestMove && shouldTryPairs) {
      const pairCandidates = candidates
        .slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, Math.max(40, toNumber(options?.pairCandidates) ?? 70));

      for (let i = 0; i < working.length; i += 1) {
        const outA = working[i];
        const outAId = outA?.id ?? null;
        if (outAId != null && lockedIds?.has(outAId)) continue;

        for (let j = i + 1; j < working.length; j += 1) {
          const outB = working[j];
          const outBId = outB?.id ?? null;
          if (outBId != null && lockedIds?.has(outBId)) continue;

          const seenDefs = new Set();
          for (let k = 0; k < working.length; k += 1) {
            if (k === i || k === j) continue;
            const defKey = getDefinitionKey(working[k]);
            if (defKey == null) continue;
            seenDefs.add(String(defKey));
          }

          for (let a = 0; a < pairCandidates.length; a += 1) {
            const inA = pairCandidates[a];
            if (!inA || inA.id == null) continue;
            if (usedIds.has(inA.id)) continue;
            if (
              inA.rating <= (toNumber(outA?.rating) ?? 0) &&
              inA.rating <= (toNumber(outB?.rating) ?? 0)
            ) {
              continue;
            }
            const inADef = getDefinitionKey(inA);
            if (inADef != null && seenDefs.has(String(inADef))) continue;

            for (let b = a + 1; b < pairCandidates.length; b += 1) {
              const inB = pairCandidates[b];
              if (!inB || inB.id == null) continue;
              if (usedIds.has(inB.id)) continue;
              if (inB.id === inA.id) continue;
              if (
                inB.rating <= (toNumber(outA?.rating) ?? 0) &&
                inB.rating <= (toNumber(outB?.rating) ?? 0)
              ) {
                continue;
              }

              const inBDef = getDefinitionKey(inB);
              if (inBDef != null && seenDefs.has(String(inBDef))) continue;
              if (
                inADef != null &&
                inBDef != null &&
                String(inADef) === String(inBDef)
              )
                continue;

              const prevA = working[i];
              const prevB = working[j];
              working[i] = inA;
              working[j] = inB;

              const valid = isSquadValidIgnoringTeamRating(
                rules,
                working,
                squadSize,
              );
              if (!valid) {
                working[i] = prevA;
                working[j] = prevB;
                continue;
              }

              const candidateMetrics = getRatingImproveMetrics(
                working,
                target,
                pivot,
                requiredInforms,
                requiredSpecials,
              );
              const improves =
                candidateMetrics.shortfall < currentMetrics.shortfall;
              if (
                improves &&
                isRatingImproveMetricsBetter(candidateMetrics, bestMetrics, {
                  preferLowerExcessInforms,
                })
              ) {
                bestMetrics = candidateMetrics;
                bestMove = { i, j, outA: prevA, outB: prevB, inA, inB };
                bestMoveKind = "pair";
              }

              working[i] = prevA;
              working[j] = prevB;
            }
          }
        }
      }
    }

    if (!bestMove) {
      if (!includeInformCandidates && availableAll.length > available.length) {
        includeInformCandidates = true;
        available = availableAll;
        maxPoolRating = Math.max(maxPoolRating, maxPoolRatingAll);
        cap = Math.min(maxPoolRating, Math.max(cap, pivot + capOffset));
        debugPush?.({
          stage: "rating",
          action: "fallback_expand",
          reason: "efficient_buckets_failed",
          cap,
          pivot,
          maxRating: maxPoolRating,
          allowSpecials: true,
          allowTotwOrTots: true,
          requiredInforms,
          requiredSpecials,
          currentRating: getSquadRating(working),
          metrics: currentMetrics,
        });
        continue;
      }
      if (cap >= maxPoolRating) break;
      cap = Math.min(maxPoolRating, cap + 1);
      debugPush?.({
        stage: "rating",
        action: "increase_cap",
        cap,
        pivot,
        currentRating: getSquadRating(working),
        metrics: currentMetrics,
      });
      continue;
    }

    if (bestMoveKind === "pair") {
      working[bestMove.i] = bestMove.inA;
      working[bestMove.j] = bestMove.inB;
      if (bestMove.outA?.id != null) usedIds.delete(bestMove.outA.id);
      if (bestMove.outB?.id != null) usedIds.delete(bestMove.outB.id);
      if (bestMove.inA?.id != null) usedIds.add(bestMove.inA.id);
      if (bestMove.inB?.id != null) usedIds.add(bestMove.inB.id);
      debugPush?.({
        stage: "rating",
        action: "swap_pair",
        cap,
        pivot,
        outAId: bestMove.outA?.id ?? null,
        outARating: bestMove.outA?.rating ?? null,
        outBId: bestMove.outB?.id ?? null,
        outBRating: bestMove.outB?.rating ?? null,
        inAId: bestMove.inA?.id ?? null,
        inARating: bestMove.inA?.rating ?? null,
        inBId: bestMove.inB?.id ?? null,
        inBRating: bestMove.inB?.rating ?? null,
        metrics: bestMetrics,
      });
    } else {
      const outId = bestMove.outPlayer?.id ?? null;
      const inId = bestMove.inPlayer?.id ?? null;
      working[bestMove.index] = bestMove.inPlayer;
      if (outId != null) usedIds.delete(outId);
      if (inId != null) usedIds.add(inId);
      debugPush?.({
        stage: "rating",
        action: "swap",
        cap,
        pivot,
        outId,
        outRating: bestMove.outPlayer?.rating ?? null,
        inId,
        inRating: bestMove.inPlayer?.rating ?? null,
        metrics: bestMetrics,
      });
    }
  }

  debugPush?.({
    stage: "rating",
    action: "summary",
    target,
    pivot,
    cap,
    iterations,
    requiredInforms,
    requiredSpecials,
    squadRating: getSquadRating(working),
    metrics: bestMetrics,
  });

  // Mutate the input squad to match previous improveRating behavior.
  squad.length = 0;
  squad.push(...working);
  return getSquadRating(squad) >= target;
};

const getSquadPreservationMetrics = (
  squad,
  ratingTarget,
  pivot,
  requiredInforms = 0,
  requiredSpecials = 0,
) => {
  const pivotNumber = toNumber(pivot) ?? 84;
  const requiredInformsNumber = Math.max(0, toNumber(requiredInforms) ?? 0);
  const requiredSpecialsNumber = Math.max(0, toNumber(requiredSpecials) ?? 0);
  const ratings = (squad || []).map((player) => toNumber(player?.rating) ?? 0);
  const maxRating = ratings.reduce((max, rating) => Math.max(max, rating), 0);
  const sumRating = ratings.reduce((sum, rating) => sum + rating, 0);
  const informCount = (squad || []).reduce(
    (count, player) => (isInformPlayer(player) ? count + 1 : count),
    0,
  );
  const specialCount = (squad || []).reduce(
    (count, player) => (player?.isSpecial ? count + 1 : count),
    0,
  );
  const storageUsage = getStorageUsageMetrics(squad || []);
  const excessInforms = Math.max(0, informCount - requiredInformsNumber);
  const excessSpecials = Math.max(0, specialCount - requiredSpecialsNumber);
  const highCount = ratings.reduce(
    (count, rating) => (rating > pivotNumber ? count + 1 : count),
    0,
  );
  const highScore = ratings.reduce((score, rating) => {
    const diff = rating - pivotNumber;
    if (diff <= 0) return score;
    // Cubic penalty biases heavily against "one very high card" anchors.
    return score + diff * diff * diff;
  }, 0);

  const slack =
    ratingTarget != null
      ? getSquadRating(squad) - (toNumber(ratingTarget) ?? 0)
      : 0;

  return {
    pivot: pivotNumber,
    requiredInforms: requiredInformsNumber,
    requiredSpecials: requiredSpecialsNumber,
    informCount,
    specialCount,
    storageCount: storageUsage.storageCount,
    storageLinkedCount: storageUsage.storageLinkedCount,
    storageDuplicateCount: storageUsage.storageDuplicateCount,
    clubDuplicateCount: storageUsage.clubDuplicateCount,
    excessInforms,
    excessSpecials,
    highScore,
    highCount,
    maxRating,
    sumRating,
    slack,
  };
};

const isPreservationMetricsBetter = (candidate, current, options = {}) => {
  if (!candidate || !current) return false;
  const preferLowerExcessInforms = options?.preferLowerExcessInforms !== false;
  if (
    preferLowerExcessInforms &&
    candidate.excessInforms !== current.excessInforms
  ) {
    return candidate.excessInforms < current.excessInforms;
  }
  if (candidate.excessSpecials !== current.excessSpecials)
    return candidate.excessSpecials < current.excessSpecials;
  if (candidate.highScore !== current.highScore)
    return candidate.highScore < current.highScore;
  if (candidate.highCount !== current.highCount)
    return candidate.highCount < current.highCount;
  if (candidate.maxRating !== current.maxRating)
    return candidate.maxRating < current.maxRating;
  if (candidate.slack !== current.slack) return candidate.slack > current.slack;
  if (candidate.storageLinkedCount !== current.storageLinkedCount) {
    return candidate.storageLinkedCount > current.storageLinkedCount;
  }
  if (candidate.storageCount !== current.storageCount) {
    return candidate.storageCount > current.storageCount;
  }
  if (candidate.sumRating !== current.sumRating)
    return candidate.sumRating < current.sumRating;
  return false;
};

const buildRemainingSupplyPenalty = (remaining, emptyWeight, scaleWeight) => {
  const count = Math.max(0, toNumber(remaining) ?? 0);
  if (count <= 0) return emptyWeight;
  return Math.round((scaleWeight * 100) / (count + 1));
};

const buildSupplyMaps = (pool) => ({
  club: countByAttr(pool, "teamId"),
  league: countByAttr(pool, "leagueId"),
  nation: countByAttr(pool, "nationId"),
});

const getPlayerMarketPrice = (player) => {
  if (!player || typeof player !== "object") return null;
  const candidates = [
    player.marketPrice,
    player.price,
    player.priceMeta?.price,
    player.futggPrice,
    player.buyNowPrice,
  ];
  for (const value of candidates) {
    const price = toNumber(value);
    if (price != null) return price;
  }
  return null;
};

const compareConceptPricePriority = (a, b) => {
  const extinctA = a?.isExtinct || a?.priceMeta?.isExtinct ? 1 : 0;
  const extinctB = b?.isExtinct || b?.priceMeta?.isExtinct ? 1 : 0;
  if (extinctA !== extinctB) return extinctA - extinctB;
  const priceA = getPlayerMarketPrice(a);
  const priceB = getPlayerMarketPrice(b);
  const missingA = priceA == null ? 1 : 0;
  const missingB = priceB == null ? 1 : 0;
  if (missingA !== missingB) return missingA - missingB;
  if (priceA != null && priceB != null && priceA !== priceB) {
    return priceA - priceB;
  }
  return (toNumber(a?.rating) ?? 0) - (toNumber(b?.rating) ?? 0);
};

const getSolvedSquadValueMetrics = (
  squad,
  pool,
  ratingTarget,
  options = {},
) => {
  const list = Array.isArray(squad) ? squad : [];
  const target = toNumber(ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const requiredInforms = Math.max(0, toNumber(options?.requiredInforms) ?? 0);
  const requiredSpecials = Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const preservation = getSquadPreservationMetrics(
    list,
    target,
    pivot,
    requiredInforms,
    requiredSpecials,
  );
  const squadRating = getSquadRating(list);
  const ratingExcess =
    target != null ? Math.max(0, squadRating - target) : 0;
  const tradableCount = list.reduce(
    (count, player) => (!player?.isUntradeable ? count + 1 : count),
    0,
  );
  const storageUsage = getStorageUsageMetrics(list);
  const conceptUsage = getConceptUsageMetrics(list);
  const conceptPlayers = list.filter(isConceptPlayer);
  const conceptPriceStats = conceptPlayers.reduce(
    (acc, player) => {
      if (player?.isExtinct || player?.priceMeta?.isExtinct) {
        acc.extinctCount += 1;
        return acc;
      }
      const price = getPlayerMarketPrice(player);
      if (price == null) {
        acc.missingCount += 1;
        return acc;
      }
      acc.total += price;
      acc.knownCount += 1;
      return acc;
    },
    { total: 0, knownCount: 0, missingCount: 0, extinctCount: 0 },
  );
  const signature = options?.signature ?? null;
  const composition = buildCompositionSnapshot(list, list.length);

  const supplyMaps = options?.supplyMaps || buildSupplyMaps(pool || []);
  const squadClubCounts = countByAttr(list, "teamId");
  const squadLeagueCounts = countByAttr(list, "leagueId");
  const squadNationCounts = countByAttr(list, "nationId");

  const scarcityPenalty = list.reduce((sum, player) => {
    if (!player) return sum;
    const teamId = player?.teamId ?? null;
    const leagueId = player?.leagueId ?? null;
    const nationId = player?.nationId ?? null;
    const remainingClub =
      teamId == null
        ? 0
        : (supplyMaps.club.get(teamId) || 0) - (squadClubCounts.get(teamId) || 0);
    const remainingLeague =
      leagueId == null
        ? 0
        : (supplyMaps.league.get(leagueId) || 0) -
          (squadLeagueCounts.get(leagueId) || 0);
    const remainingNation =
      nationId == null
        ? 0
        : (supplyMaps.nation.get(nationId) || 0) -
          (squadNationCounts.get(nationId) || 0);
    return (
      sum +
      buildRemainingSupplyPenalty(remainingClub, 500, 6) +
      buildRemainingSupplyPenalty(remainingLeague, 300, 4) +
      buildRemainingSupplyPenalty(remainingNation, 200, 3)
    );
  }, 0);
  const requiredLeagueIds = new Set(
    (signature?.requiredLeagueIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const requiredNationIds = new Set(
    (signature?.requiredNationIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const requiredClubIds = new Set(
    (signature?.requiredClubIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const identityBalancePenalty = (() => {
    if (!signature?.isCompositionPuzzle) return 0;
    let penalty = 0;
    const applyRequiredQuotaPenalty = (ids, target, attr, shortWeight, surplusWeight) => {
      if (!ids.size) return false;
      const quota = Math.max(0, toNumber(target) ?? 0);
      if (quota <= 0) return false;
      const count = list.reduce(
        (sum, player) => (ids.has(player?.[attr]) ? sum + 1 : sum),
        0,
      );
      penalty += Math.max(0, quota - count) * shortWeight;
      penalty += Math.max(0, count - quota) * surplusWeight;
      return true;
    };
    if (requiredLeagueIds.size) {
      const handled = applyRequiredQuotaPenalty(
        requiredLeagueIds,
        signature?.requiredLeagueTarget,
        "leagueId",
        120,
        3,
      );
      if (!handled) {
        const count = list.reduce(
          (sum, player) => (requiredLeagueIds.has(player?.leagueId) ? sum + 1 : sum),
          0,
        );
        penalty += Math.max(0, list.length - count) * 45;
      }
    }
    if (requiredNationIds.size) {
      const handled = applyRequiredQuotaPenalty(
        requiredNationIds,
        signature?.requiredNationTarget,
        "nationId",
        100,
        3,
      );
      if (!handled) {
        const count = list.reduce(
          (sum, player) => (requiredNationIds.has(player?.nationId) ? sum + 1 : sum),
          0,
        );
        penalty += Math.max(0, list.length - count) * 36;
      }
    }
    if (requiredClubIds.size) {
      const handled = applyRequiredQuotaPenalty(
        requiredClubIds,
        signature?.requiredClubTarget,
        "teamId",
        90,
        4,
      );
      if (!handled) {
        const count = list.reduce(
          (sum, player) => (requiredClubIds.has(player?.teamId) ? sum + 1 : sum),
          0,
        );
        penalty += Math.max(0, list.length - count) * 32;
      }
    }
    const dominantAxes = Array.isArray(signature?.dominantAxes)
      ? signature.dominantAxes
      : [];
    if (dominantAxes.includes("league")) {
      penalty += Math.max(0, (composition?.uniqueLeagues ?? 0) - 1) * 18;
      penalty += Math.max(
        0,
        list.length - (composition?.dominantLeagueCount ?? 0),
      ) * 8;
    }
    if (dominantAxes.includes("nation")) {
      penalty += Math.max(0, (composition?.uniqueNations ?? 0) - 1) * 12;
      penalty += Math.max(
        0,
        list.length - (composition?.dominantNationCount ?? 0),
      ) * 6;
    }
    if (dominantAxes.includes("club")) {
      penalty += Math.max(0, (composition?.uniqueClubs ?? 0) - 1) * 4;
      penalty += Math.max(
        0,
        list.length - (composition?.dominantClubCount ?? 0),
      ) * 2;
    }
    return penalty;
  })();

  return {
    ratingExcess,
    excessInformCount: preservation.excessInforms,
    excessSpecialCount: preservation.excessSpecials,
    maxRating: preservation.maxRating,
    highRatingScore: preservation.highScore,
    highRatingCount: preservation.highCount,
    conceptCount: conceptUsage.conceptCount,
    conceptPriceTotal: conceptPriceStats.total,
    conceptPriceKnownCount: conceptPriceStats.knownCount,
    conceptPriceMissingCount: conceptPriceStats.missingCount,
    conceptPriceExtinctCount: conceptPriceStats.extinctCount,
    conceptPlayerIds: conceptUsage.conceptPlayerIds,
    conceptDefinitionIds: conceptUsage.conceptDefinitionIds,
    identityBalancePenalty,
    specialCount: preservation.specialCount,
    storageCount: storageUsage.storageCount,
    storageLinkedCount: storageUsage.storageLinkedCount,
    storageDuplicateCount: storageUsage.storageDuplicateCount,
    clubDuplicateCount: storageUsage.clubDuplicateCount,
    tradableCount,
    scarcityPenalty,
    sumRating: preservation.sumRating,
    squadRating,
    preservation,
  };
};

const isSolvedSquadValueBetter = (candidate, current) => {
  if (!candidate || !current) return false;
  if (candidate.conceptCount !== current.conceptCount)
    return candidate.conceptCount < current.conceptCount;
  if (candidate.conceptPriceExtinctCount !== current.conceptPriceExtinctCount)
    return candidate.conceptPriceExtinctCount < current.conceptPriceExtinctCount;
  if (candidate.conceptPriceMissingCount !== current.conceptPriceMissingCount)
    return candidate.conceptPriceMissingCount < current.conceptPriceMissingCount;
  if (candidate.conceptPriceTotal !== current.conceptPriceTotal)
    return candidate.conceptPriceTotal < current.conceptPriceTotal;
  if (candidate.ratingExcess !== current.ratingExcess)
    return candidate.ratingExcess < current.ratingExcess;
  if (candidate.excessInformCount !== current.excessInformCount)
    return candidate.excessInformCount < current.excessInformCount;
  if (candidate.excessSpecialCount !== current.excessSpecialCount)
    return candidate.excessSpecialCount < current.excessSpecialCount;
  if (candidate.highRatingScore !== current.highRatingScore)
    return candidate.highRatingScore < current.highRatingScore;
  if (candidate.highRatingCount !== current.highRatingCount)
    return candidate.highRatingCount < current.highRatingCount;
  if (candidate.maxRating !== current.maxRating)
    return candidate.maxRating < current.maxRating;
  if (candidate.identityBalancePenalty !== current.identityBalancePenalty)
    return candidate.identityBalancePenalty < current.identityBalancePenalty;
  if (candidate.sumRating !== current.sumRating)
    return candidate.sumRating < current.sumRating;
  if (candidate.specialCount !== current.specialCount)
    return candidate.specialCount < current.specialCount;
  if (candidate.storageLinkedCount !== current.storageLinkedCount)
    return candidate.storageLinkedCount > current.storageLinkedCount;
  if (candidate.storageCount !== current.storageCount)
    return candidate.storageCount > current.storageCount;
  if (candidate.tradableCount !== current.tradableCount)
    return candidate.tradableCount < current.tradableCount;
  if (candidate.scarcityPenalty !== current.scarcityPenalty)
    return candidate.scarcityPenalty < current.scarcityPenalty;
  return false;
};

const getBalancedRefineBand = (ratingTarget, pivot) => {
  const target = toNumber(ratingTarget);
  const pivotNumber =
    toNumber(pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  if (target == null) {
    return {
      minRating: Math.max(0, pivotNumber - 6),
      maxRating: pivotNumber + 1,
    };
  }
  return {
    minRating: Math.max(0, target - 16),
    maxRating: target + 1,
  };
};

const buildRefinementCandidatePool = (
  squad,
  pool,
  ratingTarget,
  options = {},
) => {
  const working = Array.isArray(squad) ? squad : [];
  const availablePool = Array.isArray(pool) ? pool : [];
  const target = toNumber(ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const window = Math.max(1, toNumber(options?.window) ?? 6);
  const maxCandidates = Math.max(30, toNumber(options?.maxCandidates) ?? 140);
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const supplyMaps = options?.supplyMaps || buildSupplyMaps(availablePool);
  const clubCounts = countByAttr(working, "teamId");
  const leagueCounts = countByAttr(working, "leagueId");
  const nationCounts = countByAttr(working, "nationId");

  const scoreScarcity = (player) => {
    if (!player) return 0;
    const teamId = player?.teamId ?? null;
    const leagueId = player?.leagueId ?? null;
    const nationId = player?.nationId ?? null;
    const clubRemaining =
      teamId == null ? 0 : (supplyMaps.club.get(teamId) || 0) - (clubCounts.get(teamId) || 0);
    const leagueRemaining =
      leagueId == null
        ? 0
        : (supplyMaps.league.get(leagueId) || 0) - (leagueCounts.get(leagueId) || 0);
    const nationRemaining =
      nationId == null
        ? 0
        : (supplyMaps.nation.get(nationId) || 0) - (nationCounts.get(nationId) || 0);
    return (
      buildRemainingSupplyPenalty(clubRemaining, 500, 6) +
      buildRemainingSupplyPenalty(leagueRemaining, 300, 4) +
      buildRemainingSupplyPenalty(nationRemaining, 200, 3)
    );
  };

  const scored = availablePool
    .filter((player) => player && player.id != null)
    .filter((player) => !usedIds.has(player.id))
    .map((player) => {
      const rating = toNumber(player?.rating) ?? 0;
      return {
        player,
        rating,
        withinWindow: Math.abs(rating - pivot) <= window,
        distance: Math.abs(rating - pivot),
        scarcityPenalty: scoreScarcity(player),
      };
    });

  const hasConceptsInWorkingSquad = working.some(isConceptPlayer);
  const desirabilitySort = (a, b) => {
    if (a.withinWindow !== b.withinWindow) return a.withinWindow ? -1 : 1;
    if (a.rating !== b.rating) return a.rating - b.rating;
    if (Boolean(a.player?.isSpecial) !== Boolean(b.player?.isSpecial))
      return Boolean(a.player?.isSpecial) ? 1 : -1;
    const storagePreferenceDiff =
      getStoragePreferenceScore(b.player) - getStoragePreferenceScore(a.player);
    if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
    if (Boolean(a.player?.isUntradeable) !== Boolean(b.player?.isUntradeable))
      return Boolean(a.player?.isUntradeable) ? -1 : 1;
    if (a.scarcityPenalty !== b.scarcityPenalty)
      return a.scarcityPenalty - b.scarcityPenalty;
    return 0;
  };

  const nearPivot = scored.slice().sort(desirabilitySort).slice(0, maxCandidates);
  const ownedNearPivot = scored
    .filter((entry) => !isConceptPlayer(entry.player))
    .slice()
    .sort(desirabilitySort)
    .slice(0, maxCandidates);
  const cheapConcepts = scored
    .filter((entry) => isConceptPlayer(entry.player))
    .slice()
    .sort((a, b) => {
      const priceDiff = compareConceptPricePriority(a.player, b.player);
      if (priceDiff !== 0) return priceDiff;
      return desirabilitySort(a, b);
    })
    .slice(0, Math.min(80, maxCandidates));
  const lowRated = scored
    .slice()
    .sort((a, b) => {
      if (a.rating !== b.rating) return a.rating - b.rating;
      const storagePreferenceDiff =
        getStoragePreferenceScore(b.player) - getStoragePreferenceScore(a.player);
      if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
      return desirabilitySort(a, b);
    })
    .slice(0, Math.min(40, maxCandidates));
  const combined = [];
  const seen = new Set();
  const candidateLists = hasConceptsInWorkingSquad
    ? [ownedNearPivot, lowRated, cheapConcepts, nearPivot]
    : [cheapConcepts, nearPivot, lowRated];
  for (const list of candidateLists) {
    for (const entry of list) {
      const id = entry?.player?.id ?? null;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      combined.push(entry.player);
      if (combined.length >= maxCandidates) break;
    }
    if (combined.length >= maxCandidates) break;
  }
  return combined;
};

const shouldRunBalancedReshape = (metrics, ratingTarget, signature) => {
  if (!metrics) return false;
  const target = toNumber(ratingTarget) ?? 0;
  const compositionPuzzle = Boolean(signature?.isCompositionPuzzle);
  const maxRatingGap = Math.max(0, (metrics.maxRating ?? 0) - target);
  const highScore = metrics.highRatingScore ?? 0;
  const highCount = metrics.highRatingCount ?? 0;
  if (compositionPuzzle && maxRatingGap >= 3) return true;
  if (compositionPuzzle && highCount >= 4) return true;
  if (highScore >= 120) return true;
  return false;
};

const buildBalancedReplacementCandidates = (
  squad,
  pool,
  ratingTarget,
  signature,
  options = {},
) => {
  const working = Array.isArray(squad) ? squad : [];
  const availablePool = Array.isArray(pool) ? pool : [];
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const target = toNumber(ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const { minRating, maxRating } = getBalancedRefineBand(target, pivot);
  const dominantLeague = getDominantCountEntry(working, "leagueId");
  const dominantNation = getDominantCountEntry(working, "nationId");
  const dominantClub = getDominantCountEntry(working, "teamId");
  const requiredLeagueIds = new Set(
    (signature?.requiredLeagueIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const requiredNationIds = new Set(
    (signature?.requiredNationIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const requiredClubIds = new Set(
    (signature?.requiredClubIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const maxCandidates = Math.max(20, toNumber(options?.maxCandidates) ?? 48);

  const scored = availablePool
    .filter((player) => player && player.id != null)
    .filter((player) => !usedIds.has(player.id))
    .filter((player) => {
      const rating = toNumber(player?.rating);
      if (rating == null) return false;
      return rating >= minRating && rating <= maxRating;
    })
    .map((player) => {
      const rating = toNumber(player?.rating) ?? 0;
      let identityScore = 0;
      if (
        requiredLeagueIds.size &&
        player?.leagueId != null &&
        requiredLeagueIds.has(player.leagueId)
      ) {
        identityScore += 8;
      }
      if (
        requiredNationIds.size &&
        player?.nationId != null &&
        requiredNationIds.has(player.nationId)
      ) {
        identityScore += 7;
      }
      if (
        requiredClubIds.size &&
        player?.teamId != null &&
        requiredClubIds.has(player.teamId)
      ) {
        identityScore += 7;
      }
      if (
        dominantLeague?.value != null &&
        String(player?.leagueId ?? "") === String(dominantLeague.value)
      ) {
        identityScore += 5;
      }
      if (
        dominantNation?.value != null &&
        String(player?.nationId ?? "") === String(dominantNation.value)
      ) {
        identityScore += 4;
      }
      if (
        dominantClub?.value != null &&
        String(player?.teamId ?? "") === String(dominantClub.value)
      ) {
        identityScore += 2;
      }
      return {
        player,
        rating,
        identityScore,
        distance: Math.abs(rating - pivot),
      };
    })
    .sort((a, b) => {
      if (b.identityScore !== a.identityScore)
        return b.identityScore - a.identityScore;
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.rating !== b.rating) return a.rating - b.rating;
      if (Boolean(a.player?.isSpecial) !== Boolean(b.player?.isSpecial))
        return Boolean(a.player?.isSpecial) ? 1 : -1;
      const storagePreferenceDiff =
        getStoragePreferenceScore(b.player) - getStoragePreferenceScore(a.player);
      if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
      if (Boolean(a.player?.isUntradeable) !== Boolean(b.player?.isUntradeable))
        return Boolean(a.player?.isUntradeable) ? -1 : 1;
      return 0;
    });

  const combined = [];
  const seen = new Set();
  const bestMatches = scored.slice(0, maxCandidates);
  const lowTail = scored
    .slice()
    .sort((a, b) => {
      if (a.rating !== b.rating) return a.rating - b.rating;
      const storagePreferenceDiff =
        getStoragePreferenceScore(b.player) - getStoragePreferenceScore(a.player);
      if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
      return b.identityScore - a.identityScore;
    })
    .slice(0, Math.min(18, maxCandidates));
  for (const list of [bestMatches, lowTail]) {
    for (const entry of list) {
      const id = entry?.player?.id ?? null;
      if (id == null || seen.has(id)) continue;
      seen.add(id);
      combined.push(entry.player);
      if (combined.length >= maxCandidates) break;
    }
    if (combined.length >= maxCandidates) break;
  }
  return combined;
};

const refineSolvedSquadLocal = (
  squad,
  pool,
  rules,
  squadSize,
  lockedIds,
  debugPush,
  options = {},
) => {
  if (!Array.isArray(squad) || squad.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      singleSwaps: 0,
      pairEscapes: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const startedAt = Date.now();
  const timeBudgetMs = Math.max(0, toNumber(options?.timeBudgetMs) ?? 0);
  const deadlineAt = timeBudgetMs > 0 ? startedAt + timeBudgetMs : null;
  const isExpired = () => deadlineAt != null && Date.now() >= deadlineAt;
  const chemistryRequired = Boolean(options?.chemistryRequired);
  const slotsForChemistry = Array.isArray(options?.slotsForChemistry)
    ? options.slotsForChemistry
    : [];
  if (chemistryRequired && slotsForChemistry.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      singleSwaps: 0,
      pairEscapes: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }

  const working = squad.slice(0, squadSize);
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const target = toNumber(options?.ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const maxIterations = Math.max(
    1,
    toNumber(options?.maxSingleIterations) ?? 20,
  );
  const pairCandidateLimit = Math.max(
    4,
    toNumber(options?.pairCandidateLimit) ?? 16,
  );
  const supplyMaps = options?.supplyMaps || buildSupplyMaps(pool || []);

  const evaluateCandidate = (candidateSquad) => {
    let chemistry = chemistryRequired
      ? computeChemistryEval(candidateSquad, slotsForChemistry, squadSize)
      : null;
    const evalCtx = {
      checkChemistry: chemistryRequired,
      chemistry,
    };
    for (const rule of rules || []) {
      if (!rule) continue;
      const failing = evaluateRule(rule, candidateSquad, squadSize, evalCtx);
      if (failing) return null;
    }
    return {
      chemistry,
      value: getSolvedSquadValueMetrics(candidateSquad, pool, target, {
        pivot,
        requiredInforms: options?.requiredInforms ?? 0,
        requiredSpecials: options?.requiredSpecials ?? 0,
        supplyMaps,
        signature: options?.signature ?? null,
      }),
    };
  };

  const initialEval =
    evaluateCandidate(working) ||
    (() => {
      const chemistry = chemistryRequired ? options?.initialChemistry ?? null : null;
      return {
        chemistry,
        value: getSolvedSquadValueMetrics(working, pool, target, {
          pivot,
          requiredInforms: options?.requiredInforms ?? 0,
          requiredSpecials: options?.requiredSpecials ?? 0,
          supplyMaps,
          signature: options?.signature ?? null,
        }),
      };
    })();

  let bestEval = initialEval;
  let changed = false;
  let singleSwaps = 0;
  let pairEscapes = 0;
  const initialHighRatingScore = initialEval?.value?.highRatingScore ?? 0;
  const initialMaxRating = initialEval?.value?.maxRating ?? 0;
  const initialConceptCount = initialEval?.value?.conceptCount ?? 0;
  const lowImpactMode =
    initialConceptCount <= 0 &&
    (initialEval?.value?.ratingExcess ?? 0) <= 0 &&
    (initialEval?.value?.highRatingCount ?? 0) <= 1 &&
    initialMaxRating <= pivot + 3 &&
    initialHighRatingScore <= 64 &&
    (initialEval?.value?.specialCount ?? 0) <=
      Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const effectiveMaxIterations = lowImpactMode
    ? Math.min(maxIterations, 4)
    : initialConceptCount > 0
      ? Math.max(maxIterations, 24)
    : maxIterations;
  const effectivePairSearchEnabled =
    options?.pairSearchEnabled !== false && !lowImpactMode;
  const effectiveMaxCandidates = lowImpactMode
    ? Math.min(toNumber(options?.maxCandidates) ?? 60, 36)
    : initialConceptCount > 0
      ? Math.max(toNumber(options?.maxCandidates) ?? 60, 140)
    : toNumber(options?.maxCandidates) ?? 60;

  const getWorstIndices = () =>
    Array.from({ length: working.length }, (_, index) => index)
      .filter((index) => !locked.has(working[index]?.id))
      .sort((a, b) => {
        const playerA = working[a];
        const playerB = working[b];
        const ratingA = toNumber(playerA?.rating) ?? 0;
        const ratingB = toNumber(playerB?.rating) ?? 0;
        if (ratingA !== ratingB) return ratingB - ratingA;
        if (Boolean(playerA?.isSpecial) !== Boolean(playerB?.isSpecial))
          return Boolean(playerA?.isSpecial) ? -1 : 1;
        if (Boolean(playerA?.isUntradeable) !== Boolean(playerB?.isUntradeable))
          return Boolean(playerA?.isUntradeable) ? 1 : -1;
        return 0;
      })
      .slice(0, 6);

  const getLowestIndices = () =>
    Array.from({ length: working.length }, (_, index) => index)
      .filter((index) => !locked.has(working[index]?.id))
      .sort((a, b) => {
        const ratingA = toNumber(working[a]?.rating) ?? 0;
        const ratingB = toNumber(working[b]?.rating) ?? 0;
        if (ratingA !== ratingB) return ratingA - ratingB;
        if (Boolean(working[a]?.isSpecial) !== Boolean(working[b]?.isSpecial))
          return Boolean(working[a]?.isSpecial) ? -1 : 1;
        return 0;
      })
      .slice(0, 6);

  for (let iteration = 0; iteration < effectiveMaxIterations; iteration += 1) {
    if (isExpired()) break;
    const candidates = buildRefinementCandidatePool(working, pool, target, {
      pivot,
      window: options?.window,
      maxCandidates: effectiveMaxCandidates,
      supplyMaps,
    });
    let bestMove = null;

    for (let index = 0; index < working.length; index += 1) {
      if (isExpired()) break;
      const outPlayer = working[index];
      const outId = outPlayer?.id ?? null;
      if (outId != null && locked.has(outId)) continue;

      const seenDefs = new Set();
      for (let j = 0; j < working.length; j += 1) {
        if (j === index) continue;
        const defKey = getDefinitionKey(working[j]);
        if (defKey == null) continue;
        seenDefs.add(String(defKey));
      }

      for (const candidate of candidates) {
        if (isExpired()) break;
        if (!candidate || candidate.id == null) continue;
        if (usedIds.has(candidate.id)) continue;
        const candidateDef = getDefinitionKey(candidate);
        if (candidateDef != null && seenDefs.has(String(candidateDef))) continue;

        const nextSquad = working.slice();
        nextSquad[index] = candidate;
        const nextEval = evaluateCandidate(nextSquad);
        if (!nextEval) continue;
        if (!isSolvedSquadValueBetter(nextEval.value, bestEval.value)) continue;
        if (
          !bestMove ||
          isSolvedSquadValueBetter(nextEval.value, bestMove.eval.value)
        ) {
          bestMove = {
            kind: "single",
            index,
            outPlayer,
            inPlayer: candidate,
            eval: nextEval,
          };
        }
      }
    }

    if (!bestMove && effectivePairSearchEnabled && !isExpired()) {
      const worstIndices = getWorstIndices();
      const lowestIndices = getLowestIndices();
      const pairIndexSets = [];
      const pairIndexKeys = new Set();
      const pushPairIndexSet = (aIndex, bIndex) => {
        if (aIndex === bIndex) return;
        const normalized = [aIndex, bIndex].sort((a, b) => a - b);
        const key = normalized.join(":");
        if (pairIndexKeys.has(key)) return;
        pairIndexKeys.add(key);
        pairIndexSets.push(normalized);
      };
      for (let a = 0; a < worstIndices.length; a += 1) {
        for (let b = a + 1; b < worstIndices.length; b += 1) {
          pushPairIndexSet(worstIndices[a], worstIndices[b]);
        }
      }
      const highOutliers = worstIndices.filter((index) => {
        const rating = toNumber(working[index]?.rating) ?? 0;
        return rating > pivot + 2;
      });
      for (const highIndex of highOutliers) {
        for (const lowIndex of lowestIndices) {
          pushPairIndexSet(highIndex, lowIndex);
        }
      }
      const pairCandidates = candidates.slice(0, pairCandidateLimit);
      for (const [outAIndex, outBIndex] of pairIndexSets) {
        if (isExpired()) break;
          const outA = working[outAIndex];
          const outB = working[outBIndex];
          if (!outA || !outB) continue;

          const seenDefs = new Set();
          for (let k = 0; k < working.length; k += 1) {
            if (k === outAIndex || k === outBIndex) continue;
            const defKey = getDefinitionKey(working[k]);
            if (defKey == null) continue;
            seenDefs.add(String(defKey));
          }

          for (let i = 0; i < pairCandidates.length && !isExpired(); i += 1) {
            const inA = pairCandidates[i];
            if (!inA || inA.id == null || usedIds.has(inA.id)) continue;
            const inADef = getDefinitionKey(inA);
            if (inADef != null && seenDefs.has(String(inADef))) continue;

            for (
              let j = i + 1;
              j < pairCandidates.length && !isExpired();
              j += 1
            ) {
              const inB = pairCandidates[j];
              if (!inB || inB.id == null || usedIds.has(inB.id)) continue;
              if (inB.id === inA.id) continue;
              const inBDef = getDefinitionKey(inB);
              if (inBDef != null && seenDefs.has(String(inBDef))) continue;
              if (
                inADef != null &&
                inBDef != null &&
                String(inADef) === String(inBDef)
              ) {
                continue;
              }

              const nextSquad = working.slice();
              nextSquad[outAIndex] = inA;
              nextSquad[outBIndex] = inB;
              const nextEval = evaluateCandidate(nextSquad);
              if (!nextEval) continue;
              if (!isSolvedSquadValueBetter(nextEval.value, bestEval.value))
                continue;
              if (
                !bestMove ||
                isSolvedSquadValueBetter(nextEval.value, bestMove.eval.value)
              ) {
                bestMove = {
                  kind: "pair",
                  outAIndex,
                  outBIndex,
                  outA,
                  outB,
                  inA,
                  inB,
                  eval: nextEval,
                };
              }
            }
          }
      }
    }

    if (!bestMove) break;

    if (bestMove.kind === "pair") {
      working[bestMove.outAIndex] = bestMove.inA;
      working[bestMove.outBIndex] = bestMove.inB;
      if (bestMove.outA?.id != null) usedIds.delete(bestMove.outA.id);
      if (bestMove.outB?.id != null) usedIds.delete(bestMove.outB.id);
      if (bestMove.inA?.id != null) usedIds.add(bestMove.inA.id);
      if (bestMove.inB?.id != null) usedIds.add(bestMove.inB.id);
      pairEscapes += 1;
      debugPush?.({
        stage: "refine",
        action: "swap_pair",
        outIds: [bestMove.outA?.id ?? null, bestMove.outB?.id ?? null],
        inIds: [bestMove.inA?.id ?? null, bestMove.inB?.id ?? null],
        metrics: bestMove.eval.value,
      });
    } else {
      working[bestMove.index] = bestMove.inPlayer;
      if (bestMove.outPlayer?.id != null) usedIds.delete(bestMove.outPlayer.id);
      if (bestMove.inPlayer?.id != null) usedIds.add(bestMove.inPlayer.id);
      singleSwaps += 1;
      debugPush?.({
        stage: "refine",
        action: "swap",
        outId: bestMove.outPlayer?.id ?? null,
        inId: bestMove.inPlayer?.id ?? null,
        metrics: bestMove.eval.value,
      });
    }

    bestEval = bestMove.eval;
    changed = true;
  }

  const elapsedMs = Date.now() - startedAt;
  debugPush?.({
    stage: "refine",
    action: "summary",
    ran: true,
    changed,
    singleSwaps,
    pairEscapes,
    elapsedMs,
    before: initialEval?.value ?? null,
    after: bestEval?.value ?? initialEval?.value ?? null,
  });

  return {
    squad: changed ? working : squad,
    changed,
    ran: true,
    before: initialEval?.value ?? null,
    after: bestEval?.value ?? initialEval?.value ?? null,
    singleSwaps,
    pairEscapes,
    elapsedMs,
    chemistry: bestEval?.chemistry ?? options?.initialChemistry ?? null,
  };
};

const refineSolvedSquadBalancedReshape = (
  squad,
  pool,
  rules,
  squadSize,
  lockedIds,
  debugPush,
  options = {},
) => {
  if (!Array.isArray(squad) || squad.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      triggerReason: null,
      before: null,
      after: null,
      candidatesEvaluated: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const startedAt = Date.now();
  const timeBudgetMs = Math.max(0, toNumber(options?.timeBudgetMs) ?? 0);
  const deadlineAt = timeBudgetMs > 0 ? startedAt + timeBudgetMs : null;
  const isExpired = () => deadlineAt != null && Date.now() >= deadlineAt;
  const chemistryRequired = Boolean(options?.chemistryRequired);
  const slotsForChemistry = Array.isArray(options?.slotsForChemistry)
    ? options.slotsForChemistry
    : [];
  if (chemistryRequired && slotsForChemistry.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      triggerReason: null,
      before: null,
      after: null,
      candidatesEvaluated: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }

  const working = squad.slice(0, squadSize);
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  const target = toNumber(options?.ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const signature = options?.signature ?? null;
  const supplyMaps = options?.supplyMaps || buildSupplyMaps(pool || []);

  const evaluateCandidate = (candidateSquad) => {
    const chemistry = chemistryRequired
      ? computeChemistryEval(candidateSquad, slotsForChemistry, squadSize)
      : null;
    const evalCtx = {
      checkChemistry: chemistryRequired,
      chemistry,
    };
    for (const rule of rules || []) {
      if (!rule) continue;
      const failing = evaluateRule(rule, candidateSquad, squadSize, evalCtx);
      if (failing) return null;
    }
    return {
      chemistry,
      value: getSolvedSquadValueMetrics(candidateSquad, pool, target, {
        pivot,
        requiredInforms: options?.requiredInforms ?? 0,
        requiredSpecials: options?.requiredSpecials ?? 0,
        supplyMaps,
        signature: options?.signature ?? null,
      }),
    };
  };

  const initialEval =
    evaluateCandidate(working) ||
    (() => ({
      chemistry: chemistryRequired ? options?.initialChemistry ?? null : null,
      value: getSolvedSquadValueMetrics(working, pool, target, {
        pivot,
        requiredInforms: options?.requiredInforms ?? 0,
        requiredSpecials: options?.requiredSpecials ?? 0,
        supplyMaps,
        signature: options?.signature ?? null,
      }),
    }))();

  const triggerReason = shouldRunBalancedReshape(
    initialEval?.value,
    target,
    signature,
  )
    ? "anchor_heavy"
    : null;
  if (!triggerReason) {
    return {
      squad,
      changed: false,
      ran: false,
      triggerReason: null,
      before: initialEval?.value ?? null,
      after: initialEval?.value ?? null,
      candidatesEvaluated: 0,
      elapsedMs: 0,
      chemistry: initialEval?.chemistry ?? options?.initialChemistry ?? null,
    };
  }

  const candidatePool = buildBalancedReplacementCandidates(
    working,
    pool,
    target,
    signature,
    {
      pivot,
      maxCandidates: options?.maxCandidates ?? 72,
    },
  );
  if (!candidatePool.length) {
    return {
      squad,
      changed: false,
      ran: true,
      triggerReason,
      before: initialEval?.value ?? null,
      after: initialEval?.value ?? null,
      candidatesEvaluated: 0,
      elapsedMs: Date.now() - startedAt,
      chemistry: initialEval?.chemistry ?? options?.initialChemistry ?? null,
    };
  }

  const getPlayerPosNames = (player) => {
    const alt = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : [];
    if (alt.length) return alt.map((name) => String(name));
    const preferred = player?.preferredPositionName ?? null;
    return preferred == null ? [] : [String(preferred)];
  };
  const getSlotPosName = (index) => {
    const slot = slotsForChemistry[index] ?? null;
    const name = slot?.positionName ?? slot?.position ?? null;
    return name == null ? null : String(name);
  };
  const isPlayableAtIndex = (player, index) => {
    if (!chemistryRequired) return true;
    const slotName = getSlotPosName(index);
    if (!slotName) return true;
    const posNames = getPlayerPosNames(player);
    return posNames.includes(slotName);
  };
  const composition = buildCompositionSnapshot(working, squadSize);
  const requiredLeagueIds = new Set(
    (signature?.requiredLeagueIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const requiredNationIds = new Set(
    (signature?.requiredNationIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const requiredClubIds = new Set(
    (signature?.requiredClubIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null),
  );
  const requiredLeagueTarget = Math.max(
    0,
    toNumber(signature?.requiredLeagueTarget) ?? 0,
  );
  const requiredNationTarget = Math.max(
    0,
    toNumber(signature?.requiredNationTarget) ?? 0,
  );
  const requiredClubTarget = Math.max(
    0,
    toNumber(signature?.requiredClubTarget) ?? 0,
  );
  const currentRequiredLeagueCount = working.reduce(
    (sum, player) => (requiredLeagueIds.has(player?.leagueId) ? sum + 1 : sum),
    0,
  );
  const currentRequiredNationCount = working.reduce(
    (sum, player) => (requiredNationIds.has(player?.nationId) ? sum + 1 : sum),
    0,
  );
  const currentRequiredClubCount = working.reduce(
    (sum, player) => (requiredClubIds.has(player?.teamId) ? sum + 1 : sum),
    0,
  );
  const dominantAxes = new Set(
    Array.isArray(signature?.dominantAxes) ? signature.dominantAxes : [],
  );
  const perPlayerChem = Array.isArray(initialEval?.chemistry?.perPlayerChem)
    ? initialEval.chemistry.perPlayerChem
    : [];
  const potentialByPlayer = Array.isArray(initialEval?.chemistry?.potentialByPlayer)
    ? initialEval.chemistry.potentialByPlayer
    : [];
  const rateReplaceable = (index) => {
    const player = working[index];
    if (!player) return -Infinity;
    const rating = toNumber(player?.rating) ?? 0;
    const effectiveTarget =
      target != null ? target : toNumber(initialEval?.value?.squadRating) ?? pivot;
    let score = rating * 8;
    score += Math.max(0, rating - effectiveTarget) * 35;
    if (Boolean(player?.isSpecial)) score += 28;
    if (!player?.isUntradeable) score += 18;
    if (!isPlayableAtIndex(player, index)) score += 45;
    const chemAtIndex = toNumber(perPlayerChem[index]) ?? 0;
    score += Math.max(0, 3 - chemAtIndex) * 12;
    const potentialAtIndex = toNumber(potentialByPlayer[index]) ?? 0;
    score += Math.max(0, 2 - potentialAtIndex) * 6;
    if (
      requiredLeagueIds.size &&
      requiredLeagueTarget > 0 &&
      requiredLeagueIds.has(player?.leagueId) &&
      currentRequiredLeagueCount <= requiredLeagueTarget
    ) {
      score -= 42;
    }
    if (
      requiredNationIds.size &&
      requiredNationTarget > 0 &&
      requiredNationIds.has(player?.nationId) &&
      currentRequiredNationCount <= requiredNationTarget
    ) {
      score -= 36;
    }
    if (
      requiredClubIds.size &&
      requiredClubTarget > 0 &&
      requiredClubIds.has(player?.teamId) &&
      currentRequiredClubCount <= requiredClubTarget
    ) {
      score -= 36;
    }
    if (
      dominantAxes.has("league") &&
      composition?.dominantLeague != null &&
      player?.leagueId !== composition.dominantLeague
    ) {
      score += 22;
    }
    if (
      dominantAxes.has("nation") &&
      composition?.dominantNation != null &&
      player?.nationId !== composition.dominantNation
    ) {
      score += 18;
    }
    if (
      dominantAxes.has("club") &&
      composition?.dominantClub != null &&
      player?.teamId !== composition.dominantClub
    ) {
      score += 14;
    }
    return score;
  };

  const scoredReplaceables = Array.from(
    { length: working.length },
    (_, index) => index,
  )
    .filter((index) => !locked.has(working[index]?.id))
    .map((index) => ({
      index,
      score: rateReplaceable(index),
      rating: toNumber(working[index]?.rating) ?? 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.rating - a.rating;
    });
  const lowRatedReplaceables = scoredReplaceables
    .slice()
    .sort((a, b) => a.rating - b.rating)
    .slice(0, 3);
  const replacementPool = [];
  const replacementSeen = new Set();
  for (const entry of [...scoredReplaceables.slice(0, 6), ...lowRatedReplaceables]) {
    if (!entry || replacementSeen.has(entry.index)) continue;
    replacementSeen.add(entry.index);
    replacementPool.push(entry.index);
  }

  const replacementSets = [];
  const replacementSetKeys = new Set();
  const pushReplacementSet = (indices) => {
    if (!Array.isArray(indices) || indices.length < 3) return;
    const normalized = indices.slice().sort((a, b) => a - b);
    const key = normalized.join(",");
    if (replacementSetKeys.has(key)) return;
    replacementSetKeys.add(key);
    replacementSets.push(normalized);
  };
  const buildReplacementCombos = (
    sourceIndices,
    size,
    start = 0,
    acc = [],
    limit = 18,
  ) => {
    if (replacementSets.length >= limit) return;
    if (acc.length >= size) {
      pushReplacementSet(acc);
      return;
    }
    for (let i = start; i < sourceIndices.length; i += 1) {
      acc.push(sourceIndices[i]);
      buildReplacementCombos(sourceIndices, size, i + 1, acc, limit);
      acc.pop();
      if (replacementSets.length >= limit) return;
    }
  };
  for (const size of [3, 4]) {
    if (replacementPool.length >= size) {
      buildReplacementCombos(replacementPool, size);
    }
  }
  if (replacementPool.length >= 5) {
    pushReplacementSet(replacementPool.slice(0, 5));
  }

  let bestEval = initialEval;
  let bestSquad = working;
  let candidatesEvaluated = 0;
  const maxEvaluations = Math.max(
    40,
    toNumber(options?.maxEvaluations) ?? 220,
  );

  for (const replaceIndices of replacementSets) {
    if (isExpired()) break;
    const perSlotLimit =
      replaceIndices.length >= 5 ? 3 : replaceIndices.length === 4 ? 4 : 6;
    const slotCandidates = replaceIndices.map((index) => {
      const outPlayer = working[index];
      const seenDefs = new Set();
      for (let j = 0; j < working.length; j += 1) {
        if (j === index) continue;
        const defKey = getDefinitionKey(working[j]);
        if (defKey == null) continue;
        seenDefs.add(String(defKey));
      }
      const filtered = candidatePool
        .filter((candidate) => {
          if (!candidate || candidate.id == null) return false;
          if (candidate.id === outPlayer?.id) return false;
          const defKey = getDefinitionKey(candidate);
          if (defKey != null && seenDefs.has(String(defKey))) return false;
          return true;
        });
      const playable = filtered.filter((candidate) =>
        isPlayableAtIndex(candidate, index),
      );
      return (playable.length ? playable : filtered).slice(0, perSlotLimit);
    });

    const trial = working.slice();
    const usedIds = new Set(
      working
        .map((player) => player?.id)
        .filter((id) => id != null),
    );
    const usedDefs = new Set(
      working
        .map((player) => getDefinitionKey(player))
        .filter((value) => value != null)
        .map((value) => String(value)),
    );
    for (const index of replaceIndices) {
      usedIds.delete(trial[index]?.id);
      const defKey = getDefinitionKey(trial[index]);
      if (defKey != null) usedDefs.delete(String(defKey));
    }

    const assignReplacement = (depth = 0) => {
      if (isExpired()) return;
      if (candidatesEvaluated >= maxEvaluations) return;
      if (depth >= replaceIndices.length) {
        candidatesEvaluated += 1;
        const nextEval = evaluateCandidate(trial);
        if (!nextEval) return;
        if (isSolvedSquadValueBetter(nextEval.value, bestEval.value)) {
          bestEval = nextEval;
          bestSquad = trial.slice();
        }
        return;
      }

      const slotIndex = replaceIndices[depth];
      const previous = trial[slotIndex];
      for (const candidate of slotCandidates[depth]) {
        if (isExpired()) return;
        if (!candidate || candidate.id == null) continue;
        if (usedIds.has(candidate.id)) continue;
        const defKey = getDefinitionKey(candidate);
        if (defKey != null && usedDefs.has(String(defKey))) continue;

        trial[slotIndex] = candidate;
        usedIds.add(candidate.id);
        if (defKey != null) usedDefs.add(String(defKey));
        assignReplacement(depth + 1);
        usedIds.delete(candidate.id);
        if (defKey != null) usedDefs.delete(String(defKey));
        trial[slotIndex] = previous;

        if (candidatesEvaluated >= maxEvaluations) return;
      }
    };

    assignReplacement(0);
  }

  const changed =
    bestSquad !== working &&
    isSolvedSquadValueBetter(bestEval?.value, initialEval?.value);
  const elapsedMs = Date.now() - startedAt;
  debugPush?.({
    stage: "refine",
    action: "balanced_reshape_summary",
    ran: true,
    triggerReason,
    changed,
    candidatesEvaluated,
    elapsedMs,
    before: initialEval?.value ?? null,
    after: bestEval?.value ?? initialEval?.value ?? null,
  });

  return {
    squad: changed ? bestSquad : squad,
    changed,
    ran: true,
    triggerReason,
    before: initialEval?.value ?? null,
    after: bestEval?.value ?? initialEval?.value ?? null,
    candidatesEvaluated,
    elapsedMs,
    chemistry: bestEval?.chemistry ?? options?.initialChemistry ?? null,
  };
};

const refineSolvedSquad = (
  squad,
  pool,
  rules,
  squadSize,
  lockedIds,
  debugPush,
  options = {},
) => {
  const localBudget = Math.max(
    0,
    toNumber(options?.localTimeBudgetMs) ??
      Math.floor((toNumber(options?.timeBudgetMs) ?? 0) * 0.45),
  );
  const reshapeBudget = Math.max(
    0,
    toNumber(options?.reshapeTimeBudgetMs) ??
      Math.floor((toNumber(options?.timeBudgetMs) ?? 0) * 0.55),
  );
  const reshapeEnabled = options?.balancedReshapeEnabled === true;
  const local = refineSolvedSquadLocal(
    squad,
    pool,
    rules,
    squadSize,
    lockedIds,
    debugPush,
    {
      ...options,
      timeBudgetMs: localBudget,
    },
  );
  const baseSquad = local?.changed ? local.squad : squad;
  const baseChemistry =
    local?.changed
      ? local?.chemistry ?? options?.initialChemistry ?? null
      : options?.initialChemistry ?? null;
  const reshape = reshapeEnabled
    ? refineSolvedSquadBalancedReshape(
        baseSquad,
        pool,
        rules,
        squadSize,
        lockedIds,
        debugPush,
        {
          ...options,
          initialChemistry: baseChemistry,
          timeBudgetMs: reshapeBudget,
        },
      )
    : {
        squad: baseSquad,
        changed: false,
        ran: false,
        triggerReason: null,
        before: null,
        after: null,
        candidatesEvaluated: 0,
        elapsedMs: 0,
        chemistry: baseChemistry,
      };
  const changed = Boolean(local?.changed) || Boolean(reshape?.changed);
  const finalSquad = reshape?.changed
    ? reshape.squad
    : local?.changed
      ? local.squad
      : squad;
  const finalChemistry =
    reshape?.changed
      ? reshape?.chemistry ?? baseChemistry
      : local?.changed
        ? local?.chemistry ?? options?.initialChemistry ?? null
        : options?.initialChemistry ?? null;
  return {
    squad: finalSquad,
    changed,
    ran: Boolean(local?.ran) || Boolean(reshape?.ran),
    before: local?.before ?? null,
    after:
      (reshape?.ran ? reshape?.after : null) ??
      (local?.ran ? local?.after : null) ??
      null,
    singleSwaps: local?.singleSwaps ?? 0,
    pairEscapes: local?.pairEscapes ?? 0,
    reshapeTriggered: Boolean(reshape?.ran && reshape?.triggerReason),
    reshapeReason: reshape?.triggerReason ?? null,
    reshapeChanged: Boolean(reshape?.changed),
    reshapeCandidatesEvaluated: reshape?.candidatesEvaluated ?? 0,
    elapsedMs: (local?.elapsedMs ?? 0) + (reshape?.elapsedMs ?? 0),
    chemistry: finalChemistry,
  };
};

const optimizeSolvedConservationSquad = (
  squad,
  pool,
  rules,
  squadSize,
  lockedIds,
  debugPush,
  options = {},
) => {
  if (!Array.isArray(squad) || squad.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      mode: null,
      evaluations: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const profile = options?.profile ?? null;
  if (!profile?.enabled) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      mode: null,
      evaluations: 0,
      elapsedMs: 0,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const startedAt = Date.now();
  const timeBudgetMs = Math.max(0, toNumber(options?.timeBudgetMs) ?? 0);
  const deadlineAt = timeBudgetMs > 0 ? startedAt + timeBudgetMs : null;
  const isExpired = () => deadlineAt != null && Date.now() >= deadlineAt;
  const working = squad.slice(0, squadSize);
  const availablePool = Array.isArray(pool) ? pool : [];
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  const target = toNumber(options?.ratingTarget);
  const pivot =
    toNumber(options?.pivot) ??
    toNumber(profile?.pivot) ??
    (target != null ? Math.max(80, Math.floor(target) - 1) : 84);
  const softMax = toNumber(profile?.softMaxRating) ?? pivot + 2;
  const chemistryRequired = Boolean(options?.chemistryRequired);
  const slotsForChemistry = Array.isArray(options?.slotsForChemistry)
    ? options.slotsForChemistry
    : [];
  if (chemistryRequired && slotsForChemistry.length < squadSize) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      mode: null,
      evaluations: 0,
      elapsedMs: Date.now() - startedAt,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const chemistryTargets = options?.chemistryTargets ?? null;
  const signature = options?.signature ?? null;
  const requiredInforms = Math.max(0, toNumber(options?.requiredInforms) ?? 0);
  const requiredSpecials = Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const supplyMaps = options?.supplyMaps || buildSupplyMaps(availablePool);
  const requiredLeagueIds = new Set(
    (signature?.requiredLeagueIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const requiredNationIds = new Set(
    (signature?.requiredNationIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const requiredClubIds = new Set(
    (signature?.requiredClubIds || [])
      .map(toNumber)
      .filter((value) => value != null),
  );
  const rareTarget = Math.max(0, toNumber(signature?.rareTarget) ?? 0);

  let evaluations = 0;
  const evaluateCandidate = (candidateSquad) => {
    if (isExpired()) return null;
    evaluations += 1;
    const chemistry = chemistryRequired
      ? computeChemistryEval(candidateSquad, slotsForChemistry, squadSize)
      : null;
    const evalCtx = {
      checkChemistry: chemistryRequired,
      chemistry,
    };
    for (const rule of rules || []) {
      if (!rule) continue;
      const failing = evaluateRule(rule, candidateSquad, squadSize, evalCtx);
      if (failing) return null;
    }
    return {
      chemistry,
      value: getSolvedSquadValueMetrics(candidateSquad, availablePool, target, {
        pivot,
        requiredInforms,
        requiredSpecials,
        supplyMaps,
        signature,
      }),
    };
  };

  const initialEval = evaluateCandidate(working);
  if (!initialEval) {
    return {
      squad,
      changed: false,
      ran: false,
      before: null,
      after: null,
      mode: null,
      evaluations,
      elapsedMs: Date.now() - startedAt,
      chemistry: options?.initialChemistry ?? null,
    };
  }
  const shouldOptimize =
    (toNumber(initialEval.value?.maxRating) ?? 0) >
      (toNumber(profile?.wasteMaxRating) ?? softMax + 2) ||
    (toNumber(initialEval.value?.highRatingScore) ?? 0) >
      (toNumber(profile?.wasteHighRatingScore) ?? 64) ||
    (toNumber(initialEval.value?.ratingExcess) ?? 0) > 0 ||
    (toNumber(initialEval.value?.excessSpecialCount) ?? 0) > 0 ||
    (toNumber(initialEval.value?.excessInformCount) ?? 0) > 0;
  if (!shouldOptimize) {
    return {
      squad,
      changed: false,
      ran: false,
      before: initialEval.value,
      after: initialEval.value,
      mode: null,
      evaluations,
      elapsedMs: Date.now() - startedAt,
      chemistry: initialEval.chemistry ?? options?.initialChemistry ?? null,
    };
  }

  const initialChem = chemistryRequired
    ? initialEval.chemistry ?? options?.initialChemistry ?? null
    : null;
  const playerChem = new Array(working.length).fill(0);
  if (Array.isArray(initialChem?.slotToPlayerIndex)) {
    for (
      let slotIndex = 0;
      slotIndex < Math.min(squadSize, initialChem.slotToPlayerIndex.length);
      slotIndex += 1
    ) {
      const playerIndex = initialChem.slotToPlayerIndex[slotIndex];
      if (playerIndex == null || playerIndex < 0 || playerIndex >= working.length) {
        continue;
      }
      playerChem[playerIndex] = Math.max(
        playerChem[playerIndex] || 0,
        toNumber(initialChem.perSlotChem?.[slotIndex]) ?? 0,
      );
    }
  }

  const countRemainingSupply = (player, attr, counts) => {
    const value = player?.[attr] ?? null;
    if (value == null) return 0;
    const map =
      attr === "teamId"
        ? supplyMaps.club
        : attr === "leagueId"
          ? supplyMaps.league
          : supplyMaps.nation;
    return Math.max(0, (map.get(value) || 0) - (counts.get(value) || 0));
  };
  const clubCounts = countByAttr(working, "teamId");
  const leagueCounts = countByAttr(working, "leagueId");
  const nationCounts = countByAttr(working, "nationId");
  const requiredLeagueTarget = Math.max(
    0,
    toNumber(signature?.requiredLeagueTarget) ?? 0,
  );
  const requiredNationTarget = Math.max(
    0,
    toNumber(signature?.requiredNationTarget) ?? 0,
  );
  const requiredClubTarget = Math.max(
    0,
    toNumber(signature?.requiredClubTarget) ?? 0,
  );
  const requiredLeagueCount = working.reduce(
    (sum, player) => (requiredLeagueIds.has(player?.leagueId) ? sum + 1 : sum),
    0,
  );
  const requiredNationCount = working.reduce(
    (sum, player) => (requiredNationIds.has(player?.nationId) ? sum + 1 : sum),
    0,
  );
  const requiredClubCount = working.reduce(
    (sum, player) => (requiredClubIds.has(player?.teamId) ? sum + 1 : sum),
    0,
  );
  const rareCount = working.filter((player) => isRareNonSpecialPlayer(player)).length;
  const dominantLeague = getDominantCountEntry(working, "leagueId");
  const dominantNation = getDominantCountEntry(working, "nationId");
  const dominantClub = getDominantCountEntry(working, "teamId");

  const isRequiredIdentityCritical = (player, axis) => {
    if (!player) return false;
    if (axis === "league") {
      return (
        requiredLeagueTarget > 0 &&
        requiredLeagueIds.has(player.leagueId) &&
        requiredLeagueCount <= requiredLeagueTarget
      );
    }
    if (axis === "nation") {
      return (
        requiredNationTarget > 0 &&
        requiredNationIds.has(player.nationId) &&
        requiredNationCount <= requiredNationTarget
      );
    }
    if (axis === "club") {
      return (
        requiredClubTarget > 0 &&
        requiredClubIds.has(player.teamId) &&
        requiredClubCount <= requiredClubTarget
      );
    }
    return false;
  };

  const protectionScore = (player, index) => {
    if (!player) return 9999;
    let score = 0;
    if (locked.has(player.id)) score += 10000;
    if (isRequiredIdentityCritical(player, "club")) score += 70;
    if (isRequiredIdentityCritical(player, "nation")) score += 56;
    if (isRequiredIdentityCritical(player, "league")) score += 48;
    if (rareTarget > 0 && rareCount <= rareTarget && isRareNonSpecialPlayer(player)) {
      score += 80;
    }
    score += (toNumber(playerChem[index]) ?? 0) * 28;
    if (countRemainingSupply(player, "teamId", clubCounts) <= 0) score += 30;
    if (countRemainingSupply(player, "leagueId", leagueCounts) <= 1) score += 18;
    if (countRemainingSupply(player, "nationId", nationCounts) <= 1) score += 12;
    if (String(player?.leagueId ?? "") === String(dominantLeague?.value ?? "")) {
      score += 10;
    }
    if (String(player?.teamId ?? "") === String(dominantClub?.value ?? "")) {
      score += 8;
    }
    return score;
  };

  const indexInfo = working.map((player, index) => {
    const rating = toNumber(player?.rating) ?? 0;
    const overPivot = Math.max(0, rating - pivot);
    const highWaste = Math.max(0, rating - softMax);
    const protection = protectionScore(player, index);
    return {
      index,
      player,
      rating,
      protection,
      wasteScore:
        highWaste * 180 +
        overPivot * overPivot * overPivot +
        (player?.isSpecial ? 500 : 0) +
        (!player?.isUntradeable ? 8 : 0) -
        protection * 0.2,
      companionScore:
        Math.max(0, 90 - protection) +
        Math.max(0, Math.abs(rating - pivot) <= 5 ? 20 : 0) +
        Math.max(0, pivot - rating) * 5 +
        countRemainingSupply(player, "teamId", clubCounts) * 2 +
        countRemainingSupply(player, "leagueId", leagueCounts),
    };
  });
  const wasteIndices = indexInfo
    .filter((entry) => !locked.has(entry.player?.id))
    .filter(
      (entry) =>
        entry.rating > softMax ||
        entry.rating > pivot + 2 ||
        entry.player?.isSpecial,
    )
    .sort((a, b) => b.wasteScore - a.wasteScore)
    .slice(0, Math.max(1, toNumber(options?.maxWasteCards) ?? 4));
  const companionIndices = indexInfo
    .filter((entry) => !locked.has(entry.player?.id))
    .filter((entry) => !wasteIndices.some((waste) => waste.index === entry.index))
    .sort((a, b) => b.companionScore - a.companionScore)
    .slice(0, Math.max(2, toNumber(options?.maxCompanionCards) ?? 7));
  if (!wasteIndices.length) {
    return {
      squad,
      changed: false,
      ran: true,
      before: initialEval.value,
      after: initialEval.value,
      mode: null,
      evaluations,
      elapsedMs: Date.now() - startedAt,
      chemistry: initialEval.chemistry ?? options?.initialChemistry ?? null,
    };
  }

  const groupKeys = new Set();
  const groups = [];
  const pushGroup = (indices, mode) => {
    const unique = Array.from(new Set(indices))
      .filter((index) => index != null && index >= 0 && index < working.length)
      .sort((a, b) => a - b);
    if (!unique.length || unique.length > 3) return;
    const key = unique.join(":");
    if (groupKeys.has(key)) return;
    groupKeys.add(key);
    groups.push({ indices: unique, mode });
  };
  for (const waste of wasteIndices) pushGroup([waste.index], "single");
  for (const waste of wasteIndices) {
    for (const companion of companionIndices) {
      pushGroup([waste.index, companion.index], "waste_companion_pair");
    }
  }
  for (let i = 0; i < wasteIndices.length; i += 1) {
    for (let j = i + 1; j < wasteIndices.length; j += 1) {
      pushGroup([wasteIndices[i].index, wasteIndices[j].index], "multi_waste_pair");
    }
  }
  for (const waste of wasteIndices.slice(0, 2)) {
    for (let i = 0; i < Math.min(4, companionIndices.length); i += 1) {
      for (let j = i + 1; j < Math.min(5, companionIndices.length); j += 1) {
        pushGroup(
          [waste.index, companionIndices[i].index, companionIndices[j].index],
          "waste_companion_triple",
        );
      }
    }
  }
  if (wasteIndices.length >= 2) {
    for (const companion of companionIndices.slice(0, 5)) {
      pushGroup(
        [wasteIndices[0].index, wasteIndices[1].index, companion.index],
        "multi_waste_triple",
      );
    }
  }

  const scoreReplacement = (player, outgoingPlayers, outgoingRatingSum) => {
    const rating = toNumber(player?.rating) ?? 0;
    let identityScore = 0;
    for (const outgoing of outgoingPlayers) {
      if (String(player?.teamId ?? "") === String(outgoing?.teamId ?? "")) {
        identityScore += 26;
      }
      if (String(player?.leagueId ?? "") === String(outgoing?.leagueId ?? "")) {
        identityScore += 18;
      }
      if (String(player?.nationId ?? "") === String(outgoing?.nationId ?? "")) {
        identityScore += 16;
      }
    }
    if (String(player?.leagueId ?? "") === String(dominantLeague?.value ?? "")) {
      identityScore += 14;
    }
    if (String(player?.nationId ?? "") === String(dominantNation?.value ?? "")) {
      identityScore += 10;
    }
    if (String(player?.teamId ?? "") === String(dominantClub?.value ?? "")) {
      identityScore += 8;
    }
    const ratingPressure =
      rating > softMax + 1 ? (rating - softMax) * 80 : Math.abs(rating - pivot) * 5;
    const storageBonus = getStoragePreferenceScore(player) * 4;
    const groupRatingRoom = Math.max(0, outgoingRatingSum - rating);
    const outgoingRequiredLeagueCount = outgoingPlayers.reduce(
      (sum, outgoing) => (requiredLeagueIds.has(outgoing?.leagueId) ? sum + 1 : sum),
      0,
    );
    const outgoingRequiredNationCount = outgoingPlayers.reduce(
      (sum, outgoing) => (requiredNationIds.has(outgoing?.nationId) ? sum + 1 : sum),
      0,
    );
    const outgoingRequiredClubCount = outgoingPlayers.reduce(
      (sum, outgoing) => (requiredClubIds.has(outgoing?.teamId) ? sum + 1 : sum),
      0,
    );
    if (
      requiredLeagueTarget > 0 &&
      requiredLeagueIds.has(player?.leagueId) &&
      requiredLeagueCount - outgoingRequiredLeagueCount < requiredLeagueTarget
    ) {
      identityScore += 44;
    }
    if (
      requiredNationTarget > 0 &&
      requiredNationIds.has(player?.nationId) &&
      requiredNationCount - outgoingRequiredNationCount < requiredNationTarget
    ) {
      identityScore += 38;
    }
    if (
      requiredClubTarget > 0 &&
      requiredClubIds.has(player?.teamId) &&
      requiredClubCount - outgoingRequiredClubCount < requiredClubTarget
    ) {
      identityScore += 36;
    }
    return (
      identityScore * 12 +
      storageBonus +
      Math.min(40, groupRatingRoom) -
      ratingPressure -
      (player?.isSpecial ? 500 : 0) -
      (!player?.isUntradeable ? 2 : 0)
    );
  };

  const usedIdsInitial = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const maxEvaluations = Math.max(120, toNumber(options?.maxEvaluations) ?? 900);
  const maxGroups = Math.max(4, toNumber(options?.maxGroups) ?? 28);
  const maxReplacementCandidates = Math.max(
    12,
    toNumber(options?.maxReplacementCandidates) ?? 44,
  );
  const maxEvaluationsPerGroup = Math.max(
    80,
    toNumber(options?.maxEvaluationsPerGroup) ?? 360,
  );
  let best = {
    squad: working,
    eval: initialEval,
    mode: null,
    outIds: [],
    inIds: [],
  };

  for (const group of groups.slice(0, maxGroups)) {
    if (isExpired() || evaluations >= maxEvaluations) break;
    const outgoingPlayers = group.indices.map((index) => working[index]).filter(Boolean);
    if (!outgoingPlayers.length) continue;
    const groupStartEvaluations = evaluations;
    const isGroupBudgetExpired = () =>
      evaluations - groupStartEvaluations >= maxEvaluationsPerGroup;
    const outgoingIds = new Set(
      outgoingPlayers.map((player) => player?.id).filter((id) => id != null),
    );
    const outgoingDefs = new Set(
      outgoingPlayers
        .map((player) => getDefinitionKey(player))
        .filter((value) => value != null)
        .map(String),
    );
    const remainingDefs = new Set();
    for (let index = 0; index < working.length; index += 1) {
      if (group.indices.includes(index)) continue;
      const defKey = getDefinitionKey(working[index]);
      if (defKey != null) remainingDefs.add(String(defKey));
    }
    const remainingIds = new Set(usedIdsInitial);
    for (const id of outgoingIds) remainingIds.delete(id);
    const outgoingRatingSum = outgoingPlayers.reduce(
      (sum, player) => sum + (toNumber(player?.rating) ?? 0),
      0,
    );
    const maxOutgoingRating = Math.max(
      0,
      ...outgoingPlayers.map((player) => toNumber(player?.rating) ?? 0),
    );
    const replacementPool = availablePool
      .filter((player) => player && player.id != null)
      .filter((player) => !remainingIds.has(player.id))
      .filter((player) => {
        const defKey = getDefinitionKey(player);
        return defKey == null || !remainingDefs.has(String(defKey));
      })
      .filter((player) => {
        const rating = toNumber(player?.rating) ?? 0;
        if (rating > maxOutgoingRating && group.indices.length === 1) return false;
        return rating <= Math.max(maxOutgoingRating - 1, softMax + 1);
      })
      .map((player) => ({
        player,
        score: scoreReplacement(player, outgoingPlayers, outgoingRatingSum),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (toNumber(a.player?.rating) ?? 0) - (toNumber(b.player?.rating) ?? 0);
      })
      .slice(0, maxReplacementCandidates)
      .map((entry) => entry.player);
    if (replacementPool.length < group.indices.length) continue;

    const tryCombo = (combo) => {
      if (
        isExpired() ||
        evaluations >= maxEvaluations ||
        isGroupBudgetExpired()
      ) {
        return;
      }
      const comboIds = new Set();
      const comboDefs = new Set(remainingDefs);
      for (const player of combo) {
        if (!player || player.id == null || comboIds.has(player.id)) return;
        comboIds.add(player.id);
        const defKey = getDefinitionKey(player);
        if (defKey != null) {
          const normalized = String(defKey);
          if (comboDefs.has(normalized)) return;
          comboDefs.add(normalized);
        }
      }
      const nextSquad = working.slice();
      for (let index = 0; index < group.indices.length; index += 1) {
        nextSquad[group.indices[index]] = combo[index];
      }
      const nextEval = evaluateCandidate(nextSquad);
      if (!nextEval) return;
      if (!isSolvedSquadValueBetter(nextEval.value, best.eval.value)) return;
      best = {
        squad: nextSquad,
        eval: nextEval,
        mode: group.mode,
        outIds: outgoingPlayers.map((player) => player?.id ?? null),
        inIds: combo.map((player) => player?.id ?? null),
      };
    };
    const tryComboPermutations = (combo) => {
      if (combo.length <= 1) {
        tryCombo(combo);
        return;
      }
      if (combo.length === 2) {
        tryCombo(combo);
        tryCombo([combo[1], combo[0]]);
        return;
      }
      tryCombo(combo);
      tryCombo([combo[0], combo[2], combo[1]]);
      tryCombo([combo[1], combo[0], combo[2]]);
      tryCombo([combo[1], combo[2], combo[0]]);
      tryCombo([combo[2], combo[0], combo[1]]);
      tryCombo([combo[2], combo[1], combo[0]]);
    };

    if (group.indices.length === 1) {
      for (const a of replacementPool) tryComboPermutations([a]);
    } else if (group.indices.length === 2) {
      for (let a = 0; a < replacementPool.length; a += 1) {
        for (let b = a + 1; b < replacementPool.length; b += 1) {
          tryComboPermutations([replacementPool[a], replacementPool[b]]);
          if (isExpired() || evaluations >= maxEvaluations || isGroupBudgetExpired()) break;
        }
        if (isExpired() || evaluations >= maxEvaluations || isGroupBudgetExpired()) break;
      }
    } else {
      const triplePool = replacementPool.slice(0, Math.min(24, replacementPool.length));
      for (let a = 0; a < triplePool.length; a += 1) {
        for (let b = a + 1; b < triplePool.length; b += 1) {
          for (let c = b + 1; c < triplePool.length; c += 1) {
            tryComboPermutations([triplePool[a], triplePool[b], triplePool[c]]);
            if (isExpired() || evaluations >= maxEvaluations || isGroupBudgetExpired()) break;
          }
          if (isExpired() || evaluations >= maxEvaluations || isGroupBudgetExpired()) break;
        }
        if (isExpired() || evaluations >= maxEvaluations || isGroupBudgetExpired()) break;
      }
    }
  }

  const changed = best.squad !== working;
  debugPush?.({
    stage: "conservation",
    action: "summary",
    ran: true,
    changed,
    mode: best.mode,
    outIds: best.outIds,
    inIds: best.inIds,
    evaluations,
    elapsedMs: Date.now() - startedAt,
    before: initialEval.value,
    after: best.eval.value,
  });

  return {
    squad: changed ? best.squad : squad,
    changed,
    ran: true,
    before: initialEval.value,
    after: best.eval.value,
    mode: best.mode,
    outIds: best.outIds,
    inIds: best.inIds,
    evaluations,
    elapsedMs: Date.now() - startedAt,
    chemistry: best.eval.chemistry ?? options?.initialChemistry ?? null,
  };
};

const optimizeSquadForPreservation = (
  squad,
  pool,
  rules,
  squadSize,
  ratingTarget,
  lockedIds,
  debugPush,
  options = {},
) => {
  if (!Array.isArray(squad) || !squad.length) return { squad, changed: false };
  if (!Array.isArray(pool) || !pool.length) return { squad, changed: false };
  const target = toNumber(ratingTarget);
  if (target == null) return { squad, changed: false };

  const requiredInforms = Math.max(0, toNumber(options?.requiredInforms) ?? 0);
  const requiredSpecials = Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const preferLowerExcessInforms = options?.preferLowerExcessInforms !== false;
  const pivot =
    toNumber(options?.pivot) ??
    // Default: penalize ratings above the minimum needed to hit the squad rating.
    Math.max(80, Math.floor(target) - 1);
  const maxIterations = Math.max(1, toNumber(options?.maxIterations) ?? 30);
  const pairSearchEnabled = options?.pairSearch !== false;
  const pairOutlierThreshold = Math.max(
    0,
    toNumber(options?.pairOutlierThreshold) ?? 4,
  );
  const pairCandidateLimit = toNumber(options?.pairCandidates);

  let changed = false;
  const working = squad.slice(0, squadSize);
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );

  const metricsBefore = getSquadPreservationMetrics(
    working,
    target,
    pivot,
    requiredInforms,
    requiredSpecials,
  );

  const buildOptimizationCandidates = () => {
    const window = Math.max(1, toNumber(options?.window) ?? 6);
    const maxCandidates = Math.max(40, toNumber(options?.maxCandidates) ?? 220);
    const minRating = pivot - window;
    const maxRating = pivot + window;

    const available = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => !usedIds.has(player.id));

    const windowed = available
      .filter((player) => {
        const rating = toNumber(player?.rating);
        if (rating == null) return false;
        return rating >= minRating && rating <= maxRating;
      })
      .sort((a, b) => a.rating - b.rating);

    const low = available
      .slice()
      .sort((a, b) => a.rating - b.rating)
      .slice(0, 40);
    const high = available
      .slice()
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 40);

    const combined = [];
    const seen = new Set();
    for (const list of [windowed, low, high]) {
      for (const player of list) {
        if (!player || player.id == null) continue;
        if (seen.has(player.id)) continue;
        seen.add(player.id);
        combined.push(player);
        if (combined.length >= maxCandidates) break;
      }
      if (combined.length >= maxCandidates) break;
    }
    return combined;
  };

  let bestMetrics = metricsBefore;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let bestMove = null;
    let bestMoveKind = null;

    const candidates = buildOptimizationCandidates();

    for (let index = 0; index < working.length; index += 1) {
      const outPlayer = working[index];
      const outId = outPlayer?.id ?? null;
      if (outId != null && lockedIds?.has(outId)) continue;

      const seenDefs = new Set();
      for (let j = 0; j < working.length; j += 1) {
        if (j === index) continue;
        const defKey = getDefinitionKey(working[j]);
        if (defKey == null) continue;
        seenDefs.add(String(defKey));
      }

      for (const candidate of candidates) {
        if (!candidate) continue;
        const inId = candidate.id ?? null;
        if (inId == null) continue;
        if (usedIds.has(inId)) continue;

        const candidateDef = getDefinitionKey(candidate);
        if (candidateDef != null && seenDefs.has(String(candidateDef)))
          continue;

        const previous = working[index];
        working[index] = candidate;

        const valid = isSquadValid(rules, working, squadSize);
        if (!valid) {
          working[index] = previous;
          continue;
        }

        const candidateMetrics = getSquadPreservationMetrics(
          working,
          target,
          pivot,
          requiredInforms,
          requiredSpecials,
        );
        if (
          isPreservationMetricsBetter(candidateMetrics, bestMetrics, {
            preferLowerExcessInforms,
          })
        ) {
          bestMetrics = candidateMetrics;
          bestMove = {
            index,
            outPlayer: previous,
            inPlayer: candidate,
          };
          bestMoveKind = "single";
        }

        working[index] = previous;
      }
    }

    if (!bestMove) {
      // Attempt pair swaps (high+low smoothing) when single swaps cannot improve.
      const currentMax = working.reduce(
        (max, player) => Math.max(max, toNumber(player?.rating) ?? 0),
        0,
      );
      const shouldTryPairs =
        pairSearchEnabled && currentMax - pivot >= pairOutlierThreshold;
      if (!shouldTryPairs) break;

      const pairCandidates =
        pairCandidateLimit != null
          ? candidates
              .slice()
              .sort((a, b) => {
                const aRating = toNumber(a?.rating) ?? 0;
                const bRating = toNumber(b?.rating) ?? 0;
                const aDist = Math.abs(aRating - pivot);
                const bDist = Math.abs(bRating - pivot);
                if (aDist !== bDist) return aDist - bDist;
                return aRating - bRating;
              })
              .slice(0, Math.max(2, Math.floor(pairCandidateLimit)))
          : candidates;
      for (let i = 0; i < working.length; i += 1) {
        const outA = working[i];
        const outAId = outA?.id ?? null;
        if (outAId != null && lockedIds?.has(outAId)) continue;

        for (let j = i + 1; j < working.length; j += 1) {
          const outB = working[j];
          const outBId = outB?.id ?? null;
          if (outBId != null && lockedIds?.has(outBId)) continue;

          const seenDefs = new Set();
          for (let k = 0; k < working.length; k += 1) {
            if (k === i || k === j) continue;
            const defKey = getDefinitionKey(working[k]);
            if (defKey == null) continue;
            seenDefs.add(String(defKey));
          }

          for (let a = 0; a < pairCandidates.length; a += 1) {
            const inA = pairCandidates[a];
            if (!inA || inA.id == null) continue;
            if (usedIds.has(inA.id)) continue;
            const inADef = getDefinitionKey(inA);
            if (inADef != null && seenDefs.has(String(inADef))) continue;

            for (let b = a + 1; b < pairCandidates.length; b += 1) {
              const inB = pairCandidates[b];
              if (!inB || inB.id == null) continue;
              if (usedIds.has(inB.id)) continue;
              if (inB.id === inA.id) continue;

              const inBDef = getDefinitionKey(inB);
              if (inBDef != null && seenDefs.has(String(inBDef))) continue;
              if (
                inADef != null &&
                inBDef != null &&
                String(inADef) === String(inBDef)
              ) {
                continue;
              }

              const prevA = working[i];
              const prevB = working[j];
              working[i] = inA;
              working[j] = inB;

              const valid = isSquadValid(rules, working, squadSize);
              if (!valid) {
                working[i] = prevA;
                working[j] = prevB;
                continue;
              }

              const candidateMetrics = getSquadPreservationMetrics(
                working,
                target,
                pivot,
                requiredInforms,
                requiredSpecials,
              );
              if (
                isPreservationMetricsBetter(candidateMetrics, bestMetrics, {
                  preferLowerExcessInforms,
                })
              ) {
                bestMetrics = candidateMetrics;
                bestMove = {
                  i,
                  j,
                  outA: prevA,
                  outB: prevB,
                  inA,
                  inB,
                };
                bestMoveKind = "pair";
              }

              working[i] = prevA;
              working[j] = prevB;
            }
          }
        }
      }
    }

    if (!bestMove) break;

    if (bestMoveKind === "pair") {
      working[bestMove.i] = bestMove.inA;
      working[bestMove.j] = bestMove.inB;
      if (bestMove.outA?.id != null) usedIds.delete(bestMove.outA.id);
      if (bestMove.outB?.id != null) usedIds.delete(bestMove.outB.id);
      if (bestMove.inA?.id != null) usedIds.add(bestMove.inA.id);
      if (bestMove.inB?.id != null) usedIds.add(bestMove.inB.id);
      changed = true;
      debugPush?.({
        stage: "preserve",
        action: "swap_pair",
        pivot,
        requiredInforms,
        outAId: bestMove.outA?.id ?? null,
        outARating: bestMove.outA?.rating ?? null,
        outBId: bestMove.outB?.id ?? null,
        outBRating: bestMove.outB?.rating ?? null,
        inAId: bestMove.inA?.id ?? null,
        inARating: bestMove.inA?.rating ?? null,
        inBId: bestMove.inB?.id ?? null,
        inBRating: bestMove.inB?.rating ?? null,
        metrics: bestMetrics,
      });
    } else {
      const outId = bestMove.outPlayer?.id ?? null;
      const inId = bestMove.inPlayer?.id ?? null;
      working[bestMove.index] = bestMove.inPlayer;
      if (outId != null) usedIds.delete(outId);
      if (inId != null) usedIds.add(inId);
      changed = true;
      debugPush?.({
        stage: "preserve",
        action: "swap",
        pivot,
        requiredInforms,
        outId,
        outRating: bestMove.outPlayer?.rating ?? null,
        inId,
        inRating: bestMove.inPlayer?.rating ?? null,
        metrics: bestMetrics,
      });
    }
  }

  const metricsAfter = changed
    ? getSquadPreservationMetrics(
        working,
        target,
        pivot,
        requiredInforms,
        requiredSpecials,
      )
    : metricsBefore;

  debugPush?.({
    stage: "preserve",
    action: "summary",
    changed,
    pivot,
    requiredInforms,
    before: metricsBefore,
    after: metricsAfter,
  });

  return {
    squad: working,
    changed,
    before: metricsBefore,
    after: metricsAfter,
  };
};

const getDefinitionKey = (player) =>
  player?.definitionId ?? player?.defId ?? player?.id ?? null;

const getDuplicateDefinitionKeys = (squad, squadSize = null) => {
  const n = Math.min(
    toNumber(squadSize) ?? squad?.length ?? 0,
    squad?.length ?? 0,
  );
  const counts = new Map();
  for (let index = 0; index < n; index += 1) {
    const defKey = getDefinitionKey(squad?.[index]);
    if (defKey == null) continue;
    const normalized = String(defKey);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
};

const hasDuplicateDefinitions = (squad, squadSize = null) =>
  getDuplicateDefinitionKeys(squad, squadSize).length > 0;

const isSquadValid = (rules, squad, squadSize) => {
  for (const rule of rules || []) {
    if (!rule) continue;
    const failing = evaluateRule(rule, squad, squadSize);
    if (failing) return false;
  }
  return true;
};

const enforceUniqueDefinitions = (
  squad,
  pool,
  rules,
  squadSize,
  debugPush,
  options = {},
) => {
  const usedIds = new Set(
    (squad || []).map((player) => player?.id).filter((id) => id != null),
  );
  const seenDefs = new Set();
  let replaced = 0;
  const chemistryRequired = Boolean(options?.chemistryRequired);
  const slotsForChemistry = Array.isArray(options?.slotsForChemistry)
    ? options.slotsForChemistry
    : null;
  const chemistryTargets = options?.chemistryTargets ?? null;
  const currentChemistry = options?.currentChemistry ?? null;
  const chemistryIsRelevant =
    chemistryRequired &&
    Array.isArray(slotsForChemistry) &&
    slotsForChemistry.length >= squadSize &&
    chemistryTargets;
  const requireChemistrySatisfied =
    chemistryIsRelevant &&
    isChemistrySatisfied(currentChemistry, chemistryTargets);

  for (let index = 0; index < (squad || []).length; index += 1) {
    const player = squad[index];
    if (!player) continue;
    const defKey = getDefinitionKey(player);
    if (defKey == null) continue;
    if (!seenDefs.has(defKey)) {
      seenDefs.add(defKey);
      continue;
    }
    if (options?.lockedIds?.has(player.id)) continue;

    const candidates = (pool || [])
      .filter((candidate) => candidate && candidate.id != null)
      .filter((candidate) => !usedIds.has(candidate.id))
      .filter((candidate) => {
        const candidateDef = getDefinitionKey(candidate);
        if (candidateDef == null) return true;
        return !seenDefs.has(candidateDef);
      })
      .sort((a, b) => a.rating - b.rating);

    let replacedThis = false;
    let bestReplacement = null;
    for (const candidate of candidates) {
      const previous = squad[index];
      squad[index] = candidate;
      if (isSquadValid(rules, squad, squadSize)) {
        const nextChem = chemistryIsRelevant
          ? computeChemistryEval(squad, slotsForChemistry, squadSize)
          : null;
        const nextChemSatisfied = chemistryIsRelevant
          ? isChemistrySatisfied(nextChem, chemistryTargets)
          : true;
        const nextShortfall = chemistryIsRelevant
          ? getChemistryShortfall(nextChem, chemistryTargets).score
          : 0;
        const replacementScore = {
          keepsChemistry:
            requireChemistrySatisfied ? Number(nextChemSatisfied) : 0,
          chemistryShortfall: nextShortfall,
          rating: toNumber(candidate?.rating) ?? 0,
        };
        if (
          !bestReplacement ||
          replacementScore.keepsChemistry > bestReplacement.score.keepsChemistry ||
          (replacementScore.keepsChemistry ===
            bestReplacement.score.keepsChemistry &&
            replacementScore.chemistryShortfall <
              bestReplacement.score.chemistryShortfall) ||
          (replacementScore.keepsChemistry ===
            bestReplacement.score.keepsChemistry &&
            replacementScore.chemistryShortfall ===
              bestReplacement.score.chemistryShortfall &&
            replacementScore.rating < bestReplacement.score.rating)
        ) {
          bestReplacement = {
            candidate,
            previous,
            chemistry: nextChem,
            score: replacementScore,
          };
        }
      }
      squad[index] = previous;
    }

    if (
      bestReplacement &&
      (!requireChemistrySatisfied || bestReplacement.score.keepsChemistry > 0)
    ) {
      const { candidate, previous, chemistry: replacementChemistry } =
        bestReplacement;
      squad[index] = candidate;
      const candidateDef = getDefinitionKey(candidate);
      usedIds.delete(previous?.id ?? null);
      usedIds.add(candidate.id);
      if (candidateDef != null) seenDefs.add(candidateDef);
      replaced += 1;
      replacedThis = true;
      debugPush?.({
        stage: "dedupe",
        action: "replace",
        outId: previous?.id ?? null,
        outDefinitionId: getDefinitionKey(previous),
        inId: candidate.id,
        inDefinitionId: candidateDef ?? null,
        chemistryShortfall: chemistryIsRelevant
          ? bestReplacement.score.chemistryShortfall
          : null,
        chemistrySatisfied: chemistryIsRelevant
          ? isChemistrySatisfied(replacementChemistry, chemistryTargets)
          : null,
      });
    }

    if (!replacedThis) {
      debugPush?.({
        stage: "dedupe",
        action: "skip",
        reason: "no_valid_replacement",
        id: player?.id ?? null,
        definitionId: defKey,
      });
    }
  }

  return replaced;
};

const isSquadValidWithIgnoredTypes = (
  rules,
  squad,
  squadSize,
  ignoredTypes,
) => {
  const ignored =
    ignoredTypes instanceof Set ? ignoredTypes : new Set(ignoredTypes || []);
  for (const rule of rules || []) {
    if (!rule) continue;
    if (ignored.has(rule.type)) continue;
    const failing = evaluateRule(rule, squad, squadSize);
    if (failing) return false;
  }
  return true;
};

const reduceUniqueAttrCount = (
  squad,
  pool,
  rules,
  squadSize,
  attr,
  maxUnique,
  lockedIds,
  debugPush,
  options = {},
) => {
  const max = toNumber(maxUnique);
  if (max == null) return false;
  const n = Math.min(toNumber(squadSize) ?? 0, squad?.length ?? 0);
  if (!Array.isArray(squad) || n <= 0) return false;
  const working = squad.slice(0, n);
  const usedIds = new Set(
    working.map((player) => player?.id).filter((id) => id != null),
  );
  const locked =
    lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  const maxIterations = Math.max(10, toNumber(options?.maxIterations) ?? 120);
  const allowedAttrs = Array.isArray(options?.allowedAttrs)
    ? options.allowedAttrs
    : [];

  const ignoredTypes = new Set(options?.ignoredTypes || []);
  ignoredTypes.add("team_rating");
  ignoredTypes.add("chemistry_points");
  ignoredTypes.add("all_players_chemistry_points");

  const maxReseed = Math.max(0, toNumber(options?.maxReseed) ?? 2);
  const reseedSlack = Math.max(0, toNumber(options?.reseedSlack) ?? 2);
  const maxUniqueCap = max + reseedSlack;
  let reseedCount = 0;
  // When we "reseed" a new group to gain supply, treat it as sticky so we don't immediately
  // eliminate it on the next iteration.
  const protectedValues = new Set();

  let iterations = 0;
  while (iterations < maxIterations) {
    iterations += 1;
    const counts = countByAttr(working, attr);
    const uniqueCount = counts.size;
    if (uniqueCount <= max) break;

    const existingValues = new Set(counts.keys());
    const allowedSets = allowedAttrs.map((name) => ({
      name,
      values: new Set(countByAttr(working, name).keys()),
    }));

    const available = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => !usedIds.has(player.id))
      .slice();
    const supply = countByAttr(available, attr);
    available.sort((a, b) => {
      const aSupply = supply.get(a?.[attr]) || 0;
      const bSupply = supply.get(b?.[attr]) || 0;
      if (bSupply !== aSupply) return bSupply - aSupply;
      if (a.rating !== b.rating) return a.rating - b.rating;
      const storagePreferenceDiff =
        getStoragePreferenceScore(b) - getStoragePreferenceScore(a);
      if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
      return 0;
    });

    let bestMove = null;
    const seenDefsByIndex = new Map();
    const getSeenDefs = (outIndex) => {
      if (seenDefsByIndex.has(outIndex)) return seenDefsByIndex.get(outIndex);
      const seen = new Set();
      for (let j = 0; j < working.length; j += 1) {
        if (j === outIndex) continue;
        const defKey = getDefinitionKey(working[j]);
        if (defKey == null) continue;
        seen.add(String(defKey));
      }
      seenDefsByIndex.set(outIndex, seen);
      return seen;
    };

    const tryPickMove = (outIndices, mode) => {
      let best = null;
      for (const outIndex of outIndices) {
        const outPlayer = working[outIndex];
        const outValue = outPlayer?.[attr] ?? null;
        if (outValue == null) continue;

        const outCount = counts.get(outValue) || 0;
        if (mode === "eliminate" && outCount !== 1) continue;
        if (mode === "setup" && outCount <= 1) continue;

        const seenDefs = getSeenDefs(outIndex);

        for (const candidate of available) {
          if (!candidate) continue;
          const value = candidate?.[attr];
          if (value == null) continue;
          let allowed = true;
          for (const extra of allowedSets) {
            const extraValue = candidate?.[extra.name];
            if (extraValue == null || !extra.values.has(extraValue)) {
              allowed = false;
              break;
            }
          }
          if (!allowed) continue;
          // Only swap in players from *existing* groups so the unique count never increases.
          if (!existingValues.has(value)) continue;
          // Must be a different group to reduce the out-group count.
          if (value === outValue) continue;

          const candidateDef = getDefinitionKey(candidate);
          if (candidateDef != null && seenDefs.has(String(candidateDef)))
            continue;

          const previous = working[outIndex];
          working[outIndex] = candidate;
          const nextUnique = countByAttr(working, attr).size;
          const validUnique =
            mode === "eliminate"
              ? nextUnique < uniqueCount
              : // Setup moves should not increase unique counts.
                nextUnique <= uniqueCount;
          const valid =
            validUnique &&
            isSquadValidWithIgnoredTypes(rules, working, n, ignoredTypes);
          working[outIndex] = previous;

          if (!valid) continue;

          const valueSupply = supply.get(value) || 0;
          const becomesSingleton = outCount - 1 === 1;
          // Prefer swapping into groups with large remaining supply to make future reductions easier.
          // For setup moves, strongly prefer turning a count=2 group into a singleton so it can be
          // eliminated on the next iteration.
          const key = {
            becomesSingleton: becomesSingleton ? 1 : 0,
            outCount,
            valueSupply,
            inRating: candidate.rating,
          };
          const isBetter = (a, b) => {
            if (!b) return true;
            if (mode === "setup") {
              if (a.becomesSingleton !== b.becomesSingleton) {
                return a.becomesSingleton > b.becomesSingleton;
              }
              if (a.outCount !== b.outCount) return a.outCount < b.outCount;
            }
            if (a.valueSupply !== b.valueSupply)
              return a.valueSupply > b.valueSupply;
            // Prefer lower-rated candidates to preserve club value. Rating improvement happens later.
            return a.inRating < b.inRating;
          };

          if (!best || isBetter(key, best.key)) {
            best = {
              outIndex,
              outPlayer: previous,
              inPlayer: candidate,
              nextUnique,
              valueSupply,
              mode,
              key,
            };
          }

          // For elimination moves, the candidate list is supply+rating sorted, so we can't do better
          // for this outIndex after the first valid hit.
          if (mode === "eliminate") break;
        }
      }
      return best;
    };

    const outIndicesEliminate = [];
    for (let index = 0; index < working.length; index += 1) {
      const player = working[index];
      if (!player) continue;
      if (locked.has(player.id)) continue;
      const value = player?.[attr];
      if (value == null) continue;
      const count = counts.get(value) || 0;
      if (count === 1 && !protectedValues.has(value))
        outIndicesEliminate.push(index);
    }

    bestMove = tryPickMove(outIndicesEliminate, "eliminate");

    if (!bestMove) {
      // No valid singleton elimination exists. This can happen when the only singletons are
      // structurally required by other constraints (e.g. "Napoli OR Roma: Min 2" with one each).
      // In that case, perform a "setup" swap that reduces a count>1 group down towards 1, without
      // increasing unique counts. This enables a later singleton elimination.
      const outIndicesSetup = [];
      for (let index = 0; index < working.length; index += 1) {
        const player = working[index];
        if (!player) continue;
        if (locked.has(player.id)) continue;
        const value = player?.[attr];
        if (value == null) continue;
        if (protectedValues.has(value)) continue;
        const count = counts.get(value) || 0;
        if (count > 1) outIndicesSetup.push(index);
      }
      bestMove = tryPickMove(outIndicesSetup, "setup");
    }

    if (!bestMove) {
      // If we still can't find a move, we may have exhausted the supply of every existing group
      // (i.e. no unused players remain from any of them). In that case, allow a limited "reseed"
      // move that introduces a new group with high supply, then eliminate multiple old groups to
      // reach the max.
      if (reseedCount >= maxReseed || uniqueCount >= maxUniqueCap) break;

      const outIndicesReseed = [];
      for (let index = 0; index < working.length; index += 1) {
        const player = working[index];
        if (!player) continue;
        if (locked.has(player.id)) continue;
        const outValue = player?.[attr];
        if (outValue == null) continue;
        if (protectedValues.has(outValue)) continue;
        const outCount = counts.get(outValue) || 0;
        if (outCount <= 1) continue; // don't replace singletons (usually required)
        outIndicesReseed.push(index);
      }
      outIndicesReseed.sort((a, b) => {
        const aValue = working[a]?.[attr];
        const bValue = working[b]?.[attr];
        const aCount =
          aValue == null ? Infinity : counts.get(aValue) || Infinity;
        const bCount =
          bValue == null ? Infinity : counts.get(bValue) || Infinity;
        if (aCount !== bCount) return aCount - bCount;
        const aRating = working[a]?.rating ?? 0;
        const bRating = working[b]?.rating ?? 0;
        return aRating - bRating;
      });

      const newCandidates = available
        .filter((candidate) => {
          const value = candidate?.[attr];
          const valueSupply = value == null ? 0 : supply.get(value) || 0;
          return (
            value != null && !existingValues.has(value) && valueSupply >= 2
          );
        })
        .slice();

      let reseedMove = null;
      for (const outIndex of outIndicesReseed) {
        const outPlayer = working[outIndex];
        const outValue = outPlayer?.[attr] ?? null;
        if (outValue == null) continue;

        const seenDefs = getSeenDefs(outIndex);

        for (const candidate of newCandidates) {
          const value = candidate?.[attr];
          if (value == null) continue;

          let allowed = true;
          for (const extra of allowedSets) {
            const extraValue = candidate?.[extra.name];
            if (extraValue == null || !extra.values.has(extraValue)) {
              allowed = false;
              break;
            }
          }
          if (!allowed) continue;

          const candidateDef = getDefinitionKey(candidate);
          if (candidateDef != null && seenDefs.has(String(candidateDef)))
            continue;

          const previous = working[outIndex];
          working[outIndex] = candidate;
          const nextUnique = countByAttr(working, attr).size;
          const valid =
            nextUnique <= maxUniqueCap &&
            isSquadValidWithIgnoredTypes(rules, working, n, ignoredTypes);
          working[outIndex] = previous;
          if (!valid) continue;

          reseedMove = {
            outIndex,
            outPlayer: previous,
            inPlayer: candidate,
            nextUnique,
            valueSupply: supply.get(value) || 0,
            mode: "reseed",
          };
          break;
        }

        if (reseedMove) break;
      }

      if (!reseedMove) break;
      reseedCount += 1;
      bestMove = reseedMove;
    }

    const prev = working[bestMove.outIndex];
    working[bestMove.outIndex] = bestMove.inPlayer;
    usedIds.delete(prev?.id ?? null);
    usedIds.add(bestMove.inPlayer.id);
    if (bestMove.mode === "reseed") {
      protectedValues.clear();
      const protectedValue = bestMove.inPlayer?.[attr];
      if (protectedValue != null) protectedValues.add(protectedValue);
    }

    debugPush?.({
      stage: "unique",
      action: "swap",
      mode: bestMove.mode ?? "eliminate",
      attr,
      maxUnique: max,
      outId: bestMove.outPlayer?.id ?? null,
      outRating: bestMove.outPlayer?.rating ?? null,
      inId: bestMove.inPlayer?.id ?? null,
      inRating: bestMove.inPlayer?.rating ?? null,
      uniqueCount: countByAttr(working, attr).size,
    });
  }

  // Mutate input squad.
  squad.length = 0;
  squad.push(...working);

  return countByAttr(working, attr).size <= max;
};

const evaluateRule = (rule, squad, squadSize, evalCtx) => {
  if (!rule) return null;
  const required = getRuleCount(rule, squadSize);
  if (rule.type === "player_quality" || rule.type === "player_level") {
    // EA sometimes encodes quality/level constraints as squad-wide gates (ex: "Max Silver")
    // without providing a player-count target. In that case, every player must satisfy
    // the ordinal bound.
    if (required == null) {
      const gatePredicate =
        rule.gatePredicate || buildQualityGatePredicate(rule);
      if (gatePredicate) {
        const ok = (squad || []).every((player) => gatePredicate(player));
        if (!ok) return rule.raw;
        return null;
      }
    }
  }
  if (rule.type === "players_in_squad") {
    if (squad.length !== squadSize) return rule.raw;
    return null;
  }
  if (rule.type === "team_rating") {
    if (required == null) return null;
    const rating = getSquadRating(squad);
    if (rule.op === "max" && rating > required) return rule.raw;
    if (rule.op === "exact" && rating !== required) return rule.raw;
    if (rule.op !== "max" && rule.op !== "exact" && rating < required) return rule.raw;
    return null;
  }
  if (rule.type === "chemistry_points") {
    if (!evalCtx?.checkChemistry) return null;
    if (required == null) return null;
    const totalChem = toNumber(evalCtx?.chemistry?.totalChem);
    if (totalChem == null) return rule.raw;
    if (totalChem < required) return rule.raw;
    return null;
  }
  if (rule.type === "all_players_chemistry_points") {
    if (!evalCtx?.checkChemistry) return null;
    if (required == null) return null;
    const minChem = toNumber(evalCtx?.chemistry?.minChem);
    if (minChem == null) return rule.raw;
    if (minChem < required) return rule.raw;
    return null;
  }
  if (rule.type === "nation_count") {
    const count = countByAttr(squad, "nationId").size;
    if (rule.op === "min" && count < required) return rule.raw;
    if (rule.op === "max" && count > required) return rule.raw;
    if (rule.op === "exact" && count !== required) return rule.raw;
    return null;
  }
  if (rule.type === "league_count") {
    const count = countByAttr(squad, "leagueId").size;
    if (rule.op === "min" && count < required) return rule.raw;
    if (rule.op === "max" && count > required) return rule.raw;
    if (rule.op === "exact" && count !== required) return rule.raw;
    return null;
  }
  if (rule.type === "club_count") {
    const count = countByAttr(squad, "teamId").size;
    if (rule.op === "min" && count < required) return rule.raw;
    if (rule.op === "max" && count > required) return rule.raw;
    if (rule.op === "exact" && count !== required) return rule.raw;
    return null;
  }
  if (rule.type === "same_nation_count") {
    const max = Math.max(0, ...countByAttr(squad, "nationId").values());
    if (rule.op === "min" && max < required) return rule.raw;
    if (rule.op === "max" && max > required) return rule.raw;
    if (rule.op === "exact" && max !== required) return rule.raw;
    return null;
  }
  if (rule.type === "same_league_count") {
    const max = Math.max(0, ...countByAttr(squad, "leagueId").values());
    if (rule.op === "min" && max < required) return rule.raw;
    if (rule.op === "max" && max > required) return rule.raw;
    if (rule.op === "exact" && max !== required) return rule.raw;
    return null;
  }
  if (rule.type === "same_club_count") {
    const max = Math.max(0, ...countByAttr(squad, "teamId").values());
    if (rule.op === "min" && max < required) return rule.raw;
    if (rule.op === "max" && max > required) return rule.raw;
    if (rule.op === "exact" && max !== required) return rule.raw;
    return null;
  }
  if (
    rule.type === "nation_id" ||
    rule.type === "player_geo_region" ||
    rule.type === "league_id" ||
    rule.type === "club_id" ||
    rule.type === "player_level" ||
    rule.type === "player_quality" ||
    rule.type === "player_rarity" ||
    rule.type === "player_rarity_group" ||
    rule.type === "player_tots" ||
    rule.type === "player_totw_or_tots" ||
    rule.type === "player_rarity_or_totw" ||
    rule.type === "player_tradability" ||
    rule.type === "first_owner_players_count" ||
    rule.type === "loan_players" ||
    rule.type === "player_min_ovr" ||
    rule.type === "player_max_ovr" ||
    rule.type === "player_exact_ovr" ||
    rule.type === "player_inform"
  ) {
    const predicate = rule.predicate || buildPredicate(rule);
    if (!predicate || required == null) return null;
    const count = countMatching(squad, predicate);
    if (rule.op === "min" && count < required) return rule.raw;
    if (rule.op === "max" && count > required) return rule.raw;
    if (rule.op === "exact" && count !== required) return rule.raw;
    return null;
  }
  return null;
};

const computeChemistryEval = (squad, slots, squadSize) => {
  const list = Array.isArray(squad) ? squad : [];
  const slotList = Array.isArray(slots) ? slots : [];
  const n = Math.min(
    toNumber(squadSize) ?? list.length ?? 0,
    list.length,
    slotList.length,
  );
  if (n <= 0) return null;
  return computeBestChemistryAssignment(list.slice(0, n), slotList.slice(0, n));
};

const improveChemistrySmart = (
  squad,
  pool,
  rules,
  squadSize,
  slots,
  targets,
  hardLockedIds,
  debugPush,
  options = {},
) => {
  const slotList = Array.isArray(slots) ? slots : [];
  if (!slotList.length) return false;
  const n = Math.min(toNumber(squadSize) ?? 0, slotList.length, squad.length);
  if (n <= 0) return false;

  const totalTarget = toNumber(targets?.total);
  const minTarget = toNumber(targets?.minEach);
  const checkTotal = totalTarget != null;
  const checkMin = minTarget != null;

  let maxIterations = Math.max(10, toNumber(options?.maxIterations) ?? 60);
  let candidateLimit = Math.max(40, toNumber(options?.maxCandidates) ?? 160);
  let chemistryEscapeDepth = Math.max(
    1,
    toNumber(options?.chemistryEscapeDepth) ?? 3,
  );
  let chemistryEscapeBeamWidth = Math.max(
    8,
    toNumber(options?.chemistryEscapeBeamWidth) ?? 14,
  );
  let chemistryEscapeCandidateLimit = Math.max(
    20,
    toNumber(options?.chemistryEscapeCandidateLimit) ?? 70,
  );
  let chemistryEscapePenaltySlack = Math.max(
    0,
    toNumber(options?.chemistryEscapePenaltySlack) ?? 30,
  );
  const adaptiveNearTarget = options?.adaptiveNearTarget !== false;
  const nearTargetShortfallThreshold = Math.max(
    0,
    toNumber(options?.nearTargetShortfallThreshold) ?? 2,
  );
  const timeBudgetMs = Math.max(0, toNumber(options?.timeBudgetMs) ?? 0);
  const deadlineAt = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : null;
  const isExpired = () => deadlineAt != null && Date.now() >= deadlineAt;

  const requiredInforms = Math.max(0, toNumber(options?.requiredInforms) ?? 0);
  const requiredSpecials = Math.max(0, toNumber(options?.requiredSpecials) ?? 0);
  const avoidInforms = options?.avoidInforms !== false && requiredInforms <= 0;
  const avoidTotwOrTots =
    options?.avoidTotwOrTots !== false && requiredSpecials <= 0;
  const preferLowerExcessInforms = options?.preferLowerExcessInforms !== false;
  const seed = options?.seed ?? null;
  const ratingTarget = toNumber(options?.ratingTarget) ?? null;
  const pivot =
    toNumber(options?.pivot) ??
    (ratingTarget != null ? Math.max(80, Math.floor(ratingTarget) - 1) : 84);

  const hardLocked = hardLockedIds instanceof Set ? hardLockedIds : new Set();

  const slotPositionSet = new Set(
    slotList
      .slice(0, n)
      .map((slot) => slot?.positionName ?? null)
      .filter(Boolean)
      .map((value) => String(value)),
  );
  const slotPositions = slotList
    .slice(0, n)
    .map((slot) => slot?.positionName ?? null)
    .map((value) => (value == null ? null : String(value)));
  const getPlayerPosNames = (player) => {
    const alt = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : [];
    if (alt.length) return alt.map((name) => String(name));
    const preferred = player?.preferredPositionName ?? null;
    return preferred == null ? [] : [String(preferred)];
  };

  const computePenalty = (chem) => {
    if (!chem) return Infinity;
    const totalShort = checkTotal
      ? Math.max(0, totalTarget - chem.totalChem)
      : 0;
    const minShort = checkMin ? Math.max(0, minTarget - chem.minChem) : 0;
    // Strongly prioritize satisfying the per-player minimum if present.
    return minShort * 1000 + totalShort * 10;
  };

  const sumPotential = (chem) =>
    (chem?.potentialByPlayer || []).reduce(
      (sum, value) => sum + (toNumber(value) ?? 0),
      0,
    );

  const buildKey = (chem, penalty, preserve) => ({
    penalty: toNumber(penalty) ?? Infinity,
    totalChem: toNumber(chem?.totalChem) ?? 0,
    onPos: toNumber(chem?.onPositionCount) ?? 0,
    potentialSum: sumPotential(chem),
    preserve,
  });

  const isKeyBetter = (candidate, current) => {
    if (!candidate || !current) return false;
    if (candidate.penalty !== current.penalty)
      return candidate.penalty < current.penalty;
    if (candidate.totalChem !== current.totalChem)
      return candidate.totalChem > current.totalChem;
    if (candidate.onPos !== current.onPos)
      return candidate.onPos > current.onPos;
    if (candidate.potentialSum !== current.potentialSum) {
      return candidate.potentialSum > current.potentialSum;
    }
    return isPreservationMetricsBetter(candidate.preserve, current.preserve, {
      preferLowerExcessInforms,
    });
  };
  const compareStateKeys = (a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    if (a.totalChem !== b.totalChem) return b.totalChem - a.totalChem;
    if (a.onPos !== b.onPos) return b.onPos - a.onPos;
    if (a.potentialSum !== b.potentialSum) return b.potentialSum - a.potentialSum;
    if (
      isPreservationMetricsBetter(a.preserve, b.preserve, {
        preferLowerExcessInforms,
      })
    ) {
      return -1;
    }
    if (
      isPreservationMetricsBetter(b.preserve, a.preserve, {
        preferLowerExcessInforms,
      })
    ) {
      return 1;
    }
    return 0;
  };
  const buildSquadStateKey = (list) =>
    (list || [])
      .slice(0, n)
      .map((player) => String(player?.id ?? 0))
      .sort()
      .join(",");

  const buildCandidatePool = (workingSquad, currentChem) => {
    const usedIds = new Set(
      (workingSquad || [])
        .map((player) => player?.id)
        .filter((id) => id != null),
    );
    const counts = {
      club: countByAttr(workingSquad, "teamId"),
      league: countByAttr(workingSquad, "leagueId"),
      nation: countByAttr(workingSquad, "nationId"),
    };

    const available = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => !usedIds.has(player.id))
      .filter((player) => (avoidInforms ? !isInformPlayer(player) : true))
      .filter((player) => (avoidTotwOrTots ? !player?.isTotwOrTots : true));

    const scoreCandidate = (player, posNames) => {
      const posMatches = posNames.reduce(
        (sum, name) => (slotPositionSet.has(name) ? sum + 1 : sum),
        0,
      );
      const club = counts.club.get(player.teamId) || 0;
      const league = counts.league.get(player.leagueId) || 0;
      const nation = counts.nation.get(player.nationId) || 0;
      const synergy = club + league + nation;
      return { posMatches, synergy };
    };

    const scored = available.map((player) => {
      const posNames = getPlayerPosNames(player);
      const score = scoreCandidate(player, posNames);
      return {
        player,
        posNames,
        posSet: new Set(posNames),
        posMatches: score.posMatches,
        synergy: score.synergy,
      };
    });

    scored.sort((a, b) => {
      if (b.posMatches !== a.posMatches) return b.posMatches - a.posMatches;
      if (b.synergy !== a.synergy) return b.synergy - a.synergy;
      const seedBiasDiff =
        getSeedPoolBiasScore(a.player, seed) -
        getSeedPoolBiasScore(b.player, seed);
      if (seedBiasDiff !== 0) return seedBiasDiff;
      if (a.player.rating !== b.player.rating)
        return a.player.rating - b.player.rating;
      const storagePreferenceDiff =
        getStoragePreferenceScore(b.player) - getStoragePreferenceScore(a.player);
      if (storagePreferenceDiff !== 0) return storagePreferenceDiff;
      return 0;
    });

    const positionCoveragePerSlot = Math.max(
      4,
      toNumber(options?.positionCoveragePerSlot) ?? 10,
    );
    const candidateHardCap = Math.max(
      candidateLimit,
      Math.min(320, slotPositionSet.size * positionCoveragePerSlot),
    );
    const neededPositions = new Set(slotPositionSet);
    if (
      Array.isArray(currentChem?.onPosition) &&
      currentChem.onPosition.length >= n
    ) {
      for (let slotIndex = 0; slotIndex < n; slotIndex += 1) {
        if (currentChem.onPosition[slotIndex]) continue;
        const position = slotPositions[slotIndex];
        if (position) neededPositions.add(position);
      }
    }

    const selectedById = new Map();
    const pushCandidate = (entry) => {
      const id = entry?.player?.id;
      if (id == null || selectedById.has(id)) return false;
      selectedById.set(id, entry.player);
      return true;
    };

    // Ensure every required position gets representation in the candidate set,
    // so chemistry recovery can replace off-position players (e.g., missing GK).
    for (const position of neededPositions) {
      let addedForPosition = 0;
      for (const entry of scored) {
        if (selectedById.size >= candidateHardCap) break;
        if (addedForPosition >= positionCoveragePerSlot) break;
        if (!entry.posSet.has(position)) continue;
        if (pushCandidate(entry)) {
          addedForPosition += 1;
        }
      }
    }

    for (const entry of scored) {
      if (selectedById.size >= candidateHardCap) break;
      pushCandidate(entry);
    }

    return Array.from(selectedById.values());
  };

  let bestChem = computeChemistryEval(squad, slotList, n);
  let bestPenalty = computePenalty(bestChem);
  const initialShortfall = getChemistryShortfall(bestChem, {
    total: totalTarget,
    minEach: minTarget,
  });
  if (
    adaptiveNearTarget &&
    initialShortfall.score > 0 &&
    initialShortfall.score <= nearTargetShortfallThreshold
  ) {
    maxIterations = Math.max(
      maxIterations,
      toNumber(options?.nearTargetMaxIterations) ?? 110,
    );
    candidateLimit = Math.max(
      candidateLimit,
      toNumber(options?.nearTargetMaxCandidates) ?? 240,
    );
    chemistryEscapeDepth = Math.max(
      chemistryEscapeDepth,
      toNumber(options?.nearTargetEscapeDepth) ?? 5,
    );
    chemistryEscapeBeamWidth = Math.max(
      chemistryEscapeBeamWidth,
      toNumber(options?.nearTargetEscapeBeamWidth) ?? 24,
    );
    chemistryEscapeCandidateLimit = Math.max(
      chemistryEscapeCandidateLimit,
      toNumber(options?.nearTargetEscapeCandidateLimit) ?? 140,
    );
    chemistryEscapePenaltySlack = Math.max(
      chemistryEscapePenaltySlack,
      toNumber(options?.nearTargetEscapePenaltySlack) ?? 45,
    );
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (isExpired()) {
      debugPush?.({
        stage: "chemistry",
        action: "budget_exhausted",
        iteration,
        totalChem: bestChem?.totalChem ?? null,
        minChem: bestChem?.minChem ?? null,
        penalty: bestPenalty,
      });
      break;
    }
    if (bestPenalty <= 0 && isChemistrySatisfied(bestChem, targets)) {
      debugPush?.({
        stage: "chemistry",
        action: "done",
        iteration,
        totalTarget: totalTarget ?? null,
        minTarget: minTarget ?? null,
        totalChem: bestChem?.totalChem ?? null,
        minChem: bestChem?.minChem ?? null,
      });
      return true;
    }

    const candidates = buildCandidatePool(squad, bestChem);
    if (!candidates.length) break;

    const currentPreserve = getSquadPreservationMetrics(
      squad.slice(0, n),
      ratingTarget,
      pivot,
      requiredInforms,
      requiredSpecials,
    );
    const currentKey = buildKey(bestChem, bestPenalty, currentPreserve);

    const usedDefs = new Set(
      squad
        .slice(0, n)
        .map((player) => getDefinitionKey(player))
        .filter((value) => value != null)
        .map((value) => String(value)),
    );

    let move = null;
    let moveKey = null;
    for (let outIndex = 0; outIndex < n; outIndex += 1) {
      if (isExpired()) break;
      const outPlayer = squad[outIndex];
      if (!outPlayer) continue;
      if (hardLocked.has(outPlayer.id)) continue;

      const outDef = getDefinitionKey(outPlayer);

      for (const inPlayer of candidates) {
        if (isExpired()) break;
        if (!inPlayer) continue;
        if (inPlayer.id === outPlayer.id) continue;

        const inDef = getDefinitionKey(inPlayer);
        if (inDef != null) {
          const key = String(inDef);
          if (key !== String(outDef) && usedDefs.has(key)) continue;
        }

        const nextSquad = squad.slice();
        nextSquad[outIndex] = inPlayer;
        if (!isSquadValid(rules, nextSquad, n)) continue;

        const nextChem = computeChemistryEval(nextSquad, slotList, n);
        const nextPenalty = computePenalty(nextChem);
        if (nextPenalty > bestPenalty) continue;

        const nextPreserve = getSquadPreservationMetrics(
          nextSquad.slice(0, n),
          ratingTarget,
          pivot,
          requiredInforms,
          requiredSpecials,
        );
        const nextKey = buildKey(nextChem, nextPenalty, nextPreserve);
        if (!isKeyBetter(nextKey, currentKey)) continue;
        if (!moveKey || isKeyBetter(nextKey, moveKey)) {
          move = {
            outIndex,
            outPlayer,
            inPlayer,
            chem: nextChem,
            penalty: nextPenalty,
            preserve: nextPreserve,
          };
          moveKey = nextKey;
        }
      }
    }

    if (!move) {
      // If chemistry requires crossing count thresholds, a single swap may not help.
      // Try a small two-swap search focused on the lowest-chem contributors.
      const tryDualSwap = () => {
        if (isExpired()) return null;
        const currentChem = bestChem;
        const playerChem = new Array(n).fill(0);
        if (currentChem?.slotToPlayerIndex?.length === n) {
          for (let slotIndex = 0; slotIndex < n; slotIndex += 1) {
            const playerIndex = currentChem.slotToPlayerIndex[slotIndex];
            if (playerIndex == null || playerIndex < 0 || playerIndex >= n)
              continue;
            playerChem[playerIndex] = currentChem.perSlotChem?.[slotIndex] ?? 0;
          }
        }

        const worst = Array.from({ length: n }, (_, idx) => idx)
          .filter((idx) => !hardLocked.has(squad[idx]?.id))
          .sort((a, b) => playerChem[a] - playerChem[b])
          .slice(0, 6);

        const dualCandidates = candidates.slice(
          0,
          Math.min(candidates.length, 60),
        );
        if (worst.length < 2 || dualCandidates.length < 2) return null;

        const baseDefs = new Set(
          squad
            .slice(0, n)
            .map((player) => getDefinitionKey(player))
            .filter((value) => value != null)
            .map((value) => String(value)),
        );

        let best = null;
        for (let x = 0; x < worst.length; x += 1) {
          if (isExpired()) return best;
          for (let y = x + 1; y < worst.length; y += 1) {
            if (isExpired()) return best;
            const outAIndex = worst[x];
            const outBIndex = worst[y];
            const outA = squad[outAIndex];
            const outB = squad[outBIndex];
            if (!outA || !outB) continue;

            const outADef = getDefinitionKey(outA);
            const outBDef = getDefinitionKey(outB);

            for (let a = 0; a < dualCandidates.length; a += 1) {
              if (isExpired()) return best;
              for (let b = a + 1; b < dualCandidates.length; b += 1) {
                if (isExpired()) return best;
                const inA = dualCandidates[a];
                const inB = dualCandidates[b];
                if (!inA || !inB) continue;
                if (inA.id === inB.id) continue;

                const inADef = getDefinitionKey(inA);
                const inBDef = getDefinitionKey(inB);
                if (
                  inADef != null &&
                  inBDef != null &&
                  String(inADef) === String(inBDef)
                ) {
                  continue;
                }

                // Enforce unique definitions (the base squad is already deduped).
                if (
                  inADef != null &&
                  baseDefs.has(String(inADef)) &&
                  String(inADef) !== String(outADef) &&
                  String(inADef) !== String(outBDef)
                ) {
                  continue;
                }
                if (
                  inBDef != null &&
                  baseDefs.has(String(inBDef)) &&
                  String(inBDef) !== String(outADef) &&
                  String(inBDef) !== String(outBDef)
                ) {
                  continue;
                }

                const nextSquad = squad.slice();
                nextSquad[outAIndex] = inA;
                nextSquad[outBIndex] = inB;
                if (!isSquadValid(rules, nextSquad, n)) continue;

                const nextChem = computeChemistryEval(nextSquad, slotList, n);
                const nextPenalty = computePenalty(nextChem);
                if (nextPenalty > bestPenalty) continue;

                const nextPreserve = getSquadPreservationMetrics(
                  nextSquad.slice(0, n),
                  ratingTarget,
                  pivot,
                  requiredInforms,
                  requiredSpecials,
                );
                const nextKey = buildKey(nextChem, nextPenalty, nextPreserve);
                if (!isKeyBetter(nextKey, currentKey)) continue;

                if (!best || !best.key || isKeyBetter(nextKey, best.key)) {
                  best = {
                    key: nextKey,
                    outAIndex,
                    outBIndex,
                    outA,
                    outB,
                    inA,
                    inB,
                    chem: nextChem,
                    penalty: nextPenalty,
                    preserve: nextPreserve,
                  };
                }
              }
            }
          }
        }

        return best;
      };

      const dual = tryDualSwap();
      if (dual) {
        squad[dual.outAIndex] = dual.inA;
        squad[dual.outBIndex] = dual.inB;
        bestChem = dual.chem;
        bestPenalty = dual.penalty;
        debugPush?.({
          stage: "chemistry",
          action: "swap2",
          iteration,
          outIds: [dual.outA?.id ?? null, dual.outB?.id ?? null],
          inIds: [dual.inA?.id ?? null, dual.inB?.id ?? null],
          totalChem: bestChem?.totalChem ?? null,
          minChem: bestChem?.minChem ?? null,
          penalty: bestPenalty,
        });
        continue;
      }

      const tryChemistryEscape = () => {
        if (isExpired()) return null;
        const baseCandidates = buildCandidatePool(squad, bestChem)
          .slice(0, chemistryEscapeCandidateLimit)
          .filter(Boolean);
        if (!baseCandidates.length) return null;

        const makeNode = (nextSquad, depth) => {
          const chem = computeChemistryEval(nextSquad, slotList, n);
          const penalty = computePenalty(chem);
          const preserve = getSquadPreservationMetrics(
            nextSquad.slice(0, n),
            ratingTarget,
            pivot,
            requiredInforms,
            requiredSpecials,
          );
          const key = buildKey(chem, penalty, preserve);
          return {
            squad: nextSquad,
            chem,
            penalty,
            preserve,
            key,
            depth,
          };
        };

        const startNode = {
          squad: squad.slice(),
          chem: bestChem,
          penalty: bestPenalty,
          preserve: currentPreserve,
          key: currentKey,
          depth: 0,
        };
        let beam = [startNode];
        const visited = new Set([buildSquadStateKey(startNode.squad)]);
        let bestFallback = null;

        for (let depth = 0; depth < chemistryEscapeDepth; depth += 1) {
          if (isExpired()) break;
          const nextBeam = [];
          for (const node of beam) {
            if (isExpired()) break;
            const nodeSquad = node.squad;
            const usedIds = new Set(
              nodeSquad
                .slice(0, n)
                .map((player) => player?.id)
                .filter((id) => id != null),
            );
            const usedDefs = new Set(
              nodeSquad
                .slice(0, n)
                .map((player) => getDefinitionKey(player))
                .filter((value) => value != null)
                .map((value) => String(value)),
            );

            for (let outIndex = 0; outIndex < n; outIndex += 1) {
              if (isExpired()) break;
              const outPlayer = nodeSquad[outIndex];
              if (!outPlayer) continue;
              if (hardLocked.has(outPlayer.id)) continue;

              const outDef = getDefinitionKey(outPlayer);

              for (const inPlayer of baseCandidates) {
                if (isExpired()) break;
                if (!inPlayer) continue;
                if (inPlayer.id === outPlayer.id) continue;
                if (usedIds.has(inPlayer.id) && inPlayer.id !== outPlayer.id)
                  continue;

                const inDef = getDefinitionKey(inPlayer);
                if (inDef != null) {
                  const key = String(inDef);
                  if (key !== String(outDef) && usedDefs.has(key)) continue;
                }

                const nextSquad = nodeSquad.slice();
                nextSquad[outIndex] = inPlayer;
                const stateKey = buildSquadStateKey(nextSquad);
                if (visited.has(stateKey)) continue;
                visited.add(stateKey);

                if (!isSquadValid(rules, nextSquad, n)) continue;
                const nextNode = makeNode(nextSquad, depth + 1);
                if (
                  nextNode.penalty >
                  bestPenalty + chemistryEscapePenaltySlack
                ) {
                  continue;
                }

                if (
                  nextNode.penalty <= 0 &&
                  isChemistrySatisfied(nextNode.chem, targets)
                ) {
                  return {
                    solved: true,
                    node: nextNode,
                  };
                }

                if (!bestFallback || isKeyBetter(nextNode.key, bestFallback.key))
                  bestFallback = nextNode;
                nextBeam.push(nextNode);
              }
            }
          }

          if (!nextBeam.length) break;
          nextBeam.sort((a, b) => compareStateKeys(a.key, b.key));
          beam = nextBeam.slice(0, chemistryEscapeBeamWidth);
        }

        if (bestFallback && isKeyBetter(bestFallback.key, currentKey)) {
          return {
            solved: false,
            node: bestFallback,
          };
        }
        return null;
      };
      const escaped = tryChemistryEscape();
      if (escaped?.node) {
        squad.splice(0, squad.length, ...escaped.node.squad);
        bestChem = escaped.node.chem;
        bestPenalty = escaped.node.penalty;
        debugPush?.({
          stage: "chemistry",
          action: escaped.solved ? "escape_solved" : "escape",
          iteration,
          depth: escaped.node.depth,
          totalChem: bestChem?.totalChem ?? null,
          minChem: bestChem?.minChem ?? null,
          penalty: bestPenalty,
        });
        if (escaped.solved) return true;
        continue;
      }

      debugPush?.({
        stage: "chemistry",
        action: "stuck",
        iteration,
        totalTarget: totalTarget ?? null,
        minTarget: minTarget ?? null,
        totalChem: bestChem?.totalChem ?? null,
        minChem: bestChem?.minChem ?? null,
        penalty: bestPenalty,
      });
      break;
    }

    squad[move.outIndex] = move.inPlayer;
    bestChem = move.chem;
    bestPenalty = move.penalty;
    debugPush?.({
      stage: "chemistry",
      action: "swap",
      iteration,
      outId: move.outPlayer?.id ?? null,
      outRating: move.outPlayer?.rating ?? null,
      inId: move.inPlayer?.id ?? null,
      inRating: move.inPlayer?.rating ?? null,
      totalChem: bestChem?.totalChem ?? null,
      minChem: bestChem?.minChem ?? null,
      penalty: bestPenalty,
    });
  }

  return isChemistrySatisfied(bestChem, targets);
};

const extractRequiredPositionSet = (slots, squadSize) => {
  const list = Array.isArray(slots) ? slots : [];
  const n = Math.max(0, toNumber(squadSize) ?? list.length ?? 0);
  const set = new Set();
  for (const slot of list.slice(0, n)) {
    const name = slot?.positionName ?? slot?.position ?? null;
    if (!name) continue;
    set.add(String(name));
  }
  return set;
};

const buildClubStats = (players, requiredPositions, requiredNationIds) => {
  const posSet =
    requiredPositions instanceof Set ? requiredPositions : new Set();
  const nationSet =
    requiredNationIds instanceof Set ? requiredNationIds : new Set();
  const stats = new Map();

  for (const player of players || []) {
    if (!player) continue;
    const clubId = player.teamId ?? null;
    if (clubId == null) continue;

    if (!stats.has(clubId)) {
      stats.set(clubId, {
        clubId,
        count: 0,
        sumRating: 0,
        requiredNationCount: 0,
        positions: new Set(),
      });
    }

    const entry = stats.get(clubId);
    entry.count += 1;
    entry.sumRating += toNumber(player.rating) ?? 0;
    if (nationSet.size && nationSet.has(player.nationId)) {
      entry.requiredNationCount += 1;
    }

    const posNames = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : player?.preferredPositionName
        ? [player.preferredPositionName]
        : [];
    for (const name of posNames) {
      const normalized = name == null ? null : String(name);
      if (!normalized) continue;
      if (!posSet.size || posSet.has(normalized))
        entry.positions.add(normalized);
    }
  }

  return stats;
};

const getClubCandidateList = (clubStats, options = {}) => {
  const stats = clubStats instanceof Map ? clubStats : new Map();
  const maxCandidates = Math.max(10, toNumber(options?.maxCandidates) ?? 70);
  const includeClubIds = new Set(
    (options?.includeClubIds || []).map(toNumber).filter((v) => v != null),
  );

  const list = Array.from(stats.values()).map((entry) => {
    const avgRating = entry.count ? entry.sumRating / entry.count : 0;
    const posCount = entry.positions?.size ?? 0;
    const requiredNationCount = entry.requiredNationCount ?? 0;
    const count = entry.count ?? 0;

    // Score clubs that:
    // - cover many required positions (avoid off-position chem=0),
    // - have enough players to form a club core,
    // - supply required nations (e.g. Italy min 3),
    // - and are generally low-rated (preservation).
    const score =
      posCount * 3 +
      Math.min(5, count) +
      (count >= 3 ? 3 : count >= 2 ? 1 : 0) +
      Math.min(5, requiredNationCount) * 4 -
      avgRating / 100;

    return {
      clubId: entry.clubId,
      count,
      avgRating,
      posCount,
      requiredNationCount,
      score,
    };
  });

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.requiredNationCount !== a.requiredNationCount) {
      return b.requiredNationCount - a.requiredNationCount;
    }
    if (b.posCount !== a.posCount) return b.posCount - a.posCount;
    if (b.count !== a.count) return b.count - a.count;
    return a.avgRating - b.avgRating;
  });

  const picked = [];
  const seen = new Set();

  for (const clubId of includeClubIds) {
    if (clubId == null) continue;
    if (seen.has(clubId)) continue;
    seen.add(clubId);
    picked.push(clubId);
  }

  for (const item of list) {
    if (!item) continue;
    const clubId = toNumber(item.clubId);
    if (clubId == null) continue;
    if (seen.has(clubId)) continue;
    // Clubs with <2 players are usually bad chemistry anchors and rarely help with max-club constraints.
    if ((toNumber(item.count) ?? 0) < 2) continue;
    seen.add(clubId);
    picked.push(clubId);
    if (picked.length >= maxCandidates) break;
  }

  return picked;
};

const isOnlyChemistryFailing = (failingRequirements) => {
  const failing = Array.isArray(failingRequirements) ? failingRequirements : [];
  for (const rule of failing) {
    const type = rule?.keyNameNormalized ?? rule?.type ?? null;
    if (!type) continue;
    if (type === "chemistry_points" || type === "all_players_chemistry_points")
      continue;
    return false;
  }
  return failing.length > 0;
};

const DEFAULT_RESTART_TIME_BUDGET_MS = 8000;
const WINNING_SEED_CACHE = new Map();

export const getSquadAverageRating = (players) => {
  const list = Array.isArray(players) ? players : [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    const rating = toNumber(list[i]?.rating);
    if (rating == null) continue;
    sum += rating;
    count += 1;
  }
  return count ? sum / count : 0;
};

export const getSquadAdjustedAverage = (players) => {
  const list = Array.isArray(players) ? players : [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    const rating = toNumber(list[i]?.rating);
    if (rating == null) continue;
    sum += rating;
    count += 1;
  }
  if (!count) return 0;
  const avg = sum / count;
  let adjustedSum = 0;
  for (let i = 0; i < list.length; i += 1) {
    const rating = toNumber(list[i]?.rating);
    if (rating == null) continue;
    adjustedSum += rating <= avg ? rating : 2 * rating - avg;
  }
  return adjustedSum / count;
};

export const getSquadRating = (players) => {
  const adjustedAverage = getSquadAdjustedAverage(players);
  const roundedAverage = roundTo(adjustedAverage, ROUND_DECIMALS);
  const decimal = roundedAverage - Math.floor(roundedAverage);
  const scaledDecimal = roundTo(decimal * 100, 2);
  const base = Math.floor(roundedAverage);
  if (scaledDecimal >= ROUND_THRESHOLD * 100) return base + 1;
  return base;
};

const buildCountsMap = (players, attr) => {
  const map = new Map();
  for (const player of players || []) {
    const value = player?.[attr];
    if (value == null) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
};

const getDominantCountEntry = (players, attr) => {
  const counts = buildCountsMap(players, attr);
  let value = null;
  let count = 0;
  for (const [nextValue, nextCount] of counts.entries()) {
    if (nextCount > count) {
      value = nextValue;
      count = nextCount;
    }
  }
  return { value, count, counts };
};

const serializeCountsMap = (counts, limit = 12) =>
  Object.fromEntries(
    Array.from(counts?.entries?.() || [])
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return String(a[0]).localeCompare(String(b[0]));
      })
      .slice(0, limit)
      .map(([key, value]) => [String(key), value]),
  );

const isRareNonSpecialPlayer = (player) => {
  if (!player || player.isSpecial) return false;
  const rarity = normalizeString(player?.rarityName);
  if (rarity?.includes("rare")) return true;
  const rarityId = toNumber(player?.rarityId);
  return rarityId != null ? rarityId >= 1 : false;
};

const isStorageLinkedPlayer = (player) => getStoragePreferenceScore(player) > 0;

const getStorageUsageMetrics = (players, squadSize = null) => {
  const list = Array.isArray(players) ? players : [];
  const n = Math.max(0, toNumber(squadSize) ?? list.length);
  const squad = list.slice(0, n || list.length);
  return {
    storageCount: squad.filter((player) => Boolean(player?.isStorage)).length,
    storageLinkedCount: squad.filter((player) => isStorageLinkedPlayer(player))
      .length,
    storageDuplicateCount: squad.filter((player) =>
      Boolean(player?.hasStorageDuplicate),
    ).length,
    clubDuplicateCount: squad.filter((player) =>
      Boolean(player?.hasClubDuplicate),
    ).length,
  };
};

const buildCompositionSnapshot = (players, squadSize = null) => {
  const list = Array.isArray(players) ? players : [];
  const n = Math.max(0, toNumber(squadSize) ?? list.length);
  const squad = list.slice(0, n || list.length);
  const leagues = getDominantCountEntry(squad, "leagueId");
  const nations = getDominantCountEntry(squad, "nationId");
  const clubs = getDominantCountEntry(squad, "teamId");
  const storageUsage = getStorageUsageMetrics(squad, squad.length);
  return {
    size: squad.length,
    uniqueLeagues: leagues.counts.size,
    uniqueNations: nations.counts.size,
    uniqueClubs: clubs.counts.size,
    leagueCounts: serializeCountsMap(leagues.counts),
    nationCounts: serializeCountsMap(nations.counts),
    clubCounts: serializeCountsMap(clubs.counts),
    dominantLeague: leagues.value,
    dominantLeagueCount: leagues.count,
    dominantNation: nations.value,
    dominantNationCount: nations.count,
    dominantClub: clubs.value,
    dominantClubCount: clubs.count,
    specialCount: squad.filter((player) => Boolean(player?.isSpecial)).length,
    totwTotsCount: squad.filter((player) => Boolean(player?.isTotwOrTots))
      .length,
    nonTotwSpecialCount: squad.filter(
      (player) => Boolean(player?.isSpecial) && !player?.isTotwOrTots,
    ).length,
    rareCount: squad.filter((player) => isRareNonSpecialPlayer(player)).length,
    ...storageUsage,
  };
};

const buildChallengeSignature = (rules, squadSize) => {
  const list = Array.isArray(rules) ? rules : [];
  const chemistryTargets = getChemistryRequirementTargets(list, squadSize);
  const ratingRequirement = getTeamRatingTarget(list);
  const signature = {
    hasChemistry:
      chemistryTargets?.total != null || chemistryTargets?.minEach != null,
    totalChemistryTarget: chemistryTargets?.total ?? null,
    minPlayerChemistryTarget: chemistryTargets?.minEach ?? null,
    ratingTarget: ratingRequirement?.target ?? null,
    nationCountMin: null,
    nationCountMax: null,
    leagueCountMin: null,
    leagueCountMax: null,
    clubCountMin: null,
    clubCountMax: null,
    hasSameLeagueMin: false,
    hasSameNationMin: false,
    hasSameClubMin: false,
    sameLeagueMin: null,
    sameNationMin: null,
    sameClubMin: null,
    sameLeagueMax: null,
    sameNationMax: null,
    sameClubMax: null,
    requiredLeagueIds: [],
    requiredNationIds: [],
    requiredClubIds: [],
    requiredLeagueTarget: null,
    requiredNationTarget: null,
    requiredClubTarget: null,
    hasRareRequirement: false,
    rareTarget: null,
    hasInformRequirement: false,
    isCompositionPuzzle: false,
    dominantAxes: [],
  };
  const requiredLeagueIds = new Set();
  const requiredNationIds = new Set();
  const requiredClubIds = new Set();
  for (const rule of list) {
    if (!rule) continue;
    const required = getRuleCount(rule, squadSize);
    if (rule.type === "nation_count") {
      if (rule.op === "min" || rule.op === "exact") {
        if (required != null) {
          signature.nationCountMin = Math.max(signature.nationCountMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.nationCountMax =
          signature.nationCountMax == null
            ? required
            : Math.min(signature.nationCountMax, required);
      }
      continue;
    }
    if (rule.type === "league_count") {
      if (rule.op === "min" || rule.op === "exact") {
        if (required != null) {
          signature.leagueCountMin = Math.max(signature.leagueCountMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.leagueCountMax =
          signature.leagueCountMax == null
            ? required
            : Math.min(signature.leagueCountMax, required);
      }
      continue;
    }
    if (rule.type === "club_count") {
      if (rule.op === "min" || rule.op === "exact") {
        if (required != null) {
          signature.clubCountMin = Math.max(signature.clubCountMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.clubCountMax =
          signature.clubCountMax == null
            ? required
            : Math.min(signature.clubCountMax, required);
      }
      continue;
    }
    if (rule.type === "same_league_count") {
      if (rule.op === "min" || rule.op === "exact") {
        signature.hasSameLeagueMin = true;
        if (required != null) {
          signature.sameLeagueMin = Math.max(signature.sameLeagueMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.sameLeagueMax =
          signature.sameLeagueMax == null
            ? required
            : Math.min(signature.sameLeagueMax, required);
      }
      continue;
    }
    if (rule.type === "same_nation_count") {
      if (rule.op === "min" || rule.op === "exact") {
        signature.hasSameNationMin = true;
        if (required != null) {
          signature.sameNationMin = Math.max(signature.sameNationMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.sameNationMax =
          signature.sameNationMax == null
            ? required
            : Math.min(signature.sameNationMax, required);
      }
      continue;
    }
    if (rule.type === "same_club_count") {
      if (rule.op === "min" || rule.op === "exact") {
        signature.hasSameClubMin = true;
        if (required != null) {
          signature.sameClubMin = Math.max(signature.sameClubMin ?? 0, required);
        }
      }
      if ((rule.op === "max" || rule.op === "exact") && required != null) {
        signature.sameClubMax =
          signature.sameClubMax == null
            ? required
            : Math.min(signature.sameClubMax, required);
      }
      continue;
    }
    if (rule.type === "league_id" && (rule.op === "min" || rule.op === "exact")) {
      if (required != null) {
        signature.requiredLeagueTarget = Math.max(
          signature.requiredLeagueTarget ?? 0,
          required,
        );
      }
      for (const value of getRuleValues(rule)) {
        const numeric = toNumber(value);
        if (numeric != null) requiredLeagueIds.add(numeric);
      }
      continue;
    }
    if (rule.type === "nation_id" && (rule.op === "min" || rule.op === "exact")) {
      if (required != null) {
        signature.requiredNationTarget = Math.max(
          signature.requiredNationTarget ?? 0,
          required,
        );
      }
      for (const value of getRuleValues(rule)) {
        const numeric = toNumber(value);
        if (numeric != null) requiredNationIds.add(numeric);
      }
      continue;
    }
    if (rule.type === "club_id" && (rule.op === "min" || rule.op === "exact")) {
      if (required != null) {
        signature.requiredClubTarget = Math.max(
          signature.requiredClubTarget ?? 0,
          required,
        );
      }
      for (const value of getRuleValues(rule)) {
        const numeric = toNumber(value);
        if (numeric != null) requiredClubIds.add(numeric);
      }
      continue;
    }
    if (
      rule.type === "player_rarity" ||
      rule.type === "player_rarity_group" ||
      rule.type === "player_rarity_or_totw"
    ) {
      signature.hasRareRequirement = true;
      if (required != null) {
        signature.rareTarget = Math.max(signature.rareTarget ?? 0, required);
      }
      continue;
    }
    if (
      rule.type === "player_inform" ||
      rule.type === "player_totw_or_tots" ||
      rule.type === "player_tots"
    ) {
      signature.hasInformRequirement = true;
    }
  }
  signature.requiredLeagueIds = Array.from(requiredLeagueIds);
  signature.requiredNationIds = Array.from(requiredNationIds);
  signature.requiredClubIds = Array.from(requiredClubIds);
  if (
    signature.hasSameLeagueMin ||
    (signature.requiredLeagueIds.length &&
      (toNumber(signature.requiredLeagueTarget) ?? 0) >=
        Math.ceil((toNumber(squadSize) ?? 11) / 2))
  ) {
    signature.dominantAxes.push("league");
  }
  if (
    signature.hasSameNationMin ||
    (signature.requiredNationIds.length &&
      (toNumber(signature.requiredNationTarget) ?? 0) >=
        Math.ceil((toNumber(squadSize) ?? 11) / 2))
  ) {
    signature.dominantAxes.push("nation");
  }
  if (
    signature.hasSameClubMin ||
    (signature.requiredClubIds.length &&
      (toNumber(signature.requiredClubTarget) ?? 0) >=
        Math.ceil((toNumber(squadSize) ?? 11) / 2))
  ) {
    signature.dominantAxes.push("club");
  }
  signature.isCompositionPuzzle = Boolean(
    signature.hasChemistry &&
      (
        signature.hasSameLeagueMin ||
        signature.hasSameNationMin ||
        signature.hasSameClubMin ||
        signature.requiredLeagueIds.length ||
        signature.requiredNationIds.length ||
        signature.requiredClubIds.length ||
        signature.sameClubMax != null ||
        signature.sameLeagueMax != null ||
        signature.sameNationMax != null ||
        (signature.totalChemistryTarget != null &&
          signature.totalChemistryTarget >=
            Math.max(22, Math.floor((toNumber(squadSize) ?? 11) * 2)))
      ),
  );
  signature.fingerprint = JSON.stringify({
    chemistry: [
      signature.totalChemistryTarget,
      signature.minPlayerChemistryTarget,
    ],
    ratingTarget: signature.ratingTarget,
    nationCountMin: signature.nationCountMin,
    nationCountMax: signature.nationCountMax,
    leagueCountMin: signature.leagueCountMin,
    leagueCountMax: signature.leagueCountMax,
    clubCountMin: signature.clubCountMin,
    clubCountMax: signature.clubCountMax,
    sameLeagueMin: signature.sameLeagueMin,
    sameNationMin: signature.sameNationMin,
    sameClubMin: signature.sameClubMin,
    sameLeagueMax: signature.sameLeagueMax,
    sameNationMax: signature.sameNationMax,
    sameClubMax: signature.sameClubMax,
    requiredLeagueIds: signature.requiredLeagueIds.slice().sort((a, b) => a - b),
    requiredNationIds: signature.requiredNationIds.slice().sort((a, b) => a - b),
    requiredClubIds: signature.requiredClubIds.slice().sort((a, b) => a - b),
    requiredLeagueTarget: signature.requiredLeagueTarget,
    requiredNationTarget: signature.requiredNationTarget,
    requiredClubTarget: signature.requiredClubTarget,
    hasRareRequirement: signature.hasRareRequirement,
    rareTarget: signature.rareTarget,
    hasInformRequirement: signature.hasInformRequirement,
    dominantAxes: signature.dominantAxes,
  });
  return signature;
};

const classifyHighChemShape = (signature, rules, squadSize, context = {}) => {
  const size = Math.max(1, toNumber(squadSize) ?? DEFAULT_SQUAD_SIZE);
  const totalChemistryTarget = toNumber(signature?.totalChemistryTarget);
  const minPlayerChemistryTarget = toNumber(
    signature?.minPlayerChemistryTarget,
  );
  const hasChemistry =
    totalChemistryTarget != null || minPlayerChemistryTarget != null;
  const leagueMin = toNumber(signature?.leagueCountMin) ?? 0;
  const nationMin = toNumber(signature?.nationCountMin) ?? 0;
  const clubMin = toNumber(signature?.clubCountMin) ?? 0;
  const sameLeagueMax = toNumber(signature?.sameLeagueMax);
  const sameNationMax = toNumber(signature?.sameNationMax);
  const sameClubMax = toNumber(signature?.sameClubMax);
  const targetRatio =
    totalChemistryTarget == null ? 0 : totalChemistryTarget / Math.max(1, size);
  const slotCount = Array.isArray(context?.squadSlots)
    ? context.squadSlots.length
    : 0;
  const list = Array.isArray(rules) ? rules : [];
  const hasGoldQuota = list.some((rule) => {
    if (!rule) return false;
    if (rule.type !== "player_quality" && rule.type !== "player_level")
      return false;
    const required = getRuleCount(rule, size);
    if (required == null || required <= 0) return false;
    const values = getRuleValues(rule).map((value) =>
      normalizeString(String(value)),
    );
    return values.some((value) => value.includes("gold"));
  });
  const hasSpecialPressure = Boolean(
    signature?.hasInformRequirement ||
      list.some(
        (rule) =>
          rule?.type === "player_totw_or_tots" ||
          rule?.type === "player_tots" ||
          rule?.type === "player_inform",
      ),
  );

  const shape = {
    enabled: Boolean(hasChemistry && signature?.isCompositionPuzzle),
    isHighChem: Boolean(
      totalChemistryTarget != null &&
        totalChemistryTarget >= Math.max(22, Math.floor(size * 2)),
    ),
    isVeryHighChem: Boolean(
      totalChemistryTarget != null &&
        totalChemistryTarget >= Math.max(31, Math.floor(size * 2.75)),
    ),
    totalChemistryTarget: totalChemistryTarget ?? null,
    minPlayerChemistryTarget: minPlayerChemistryTarget ?? null,
    targetRatio,
    squadSize: size,
    leagueMin,
    nationMin,
    clubMin,
    sameLeagueMax: sameLeagueMax ?? null,
    sameNationMax: sameNationMax ?? null,
    sameClubMax: sameClubMax ?? null,
    hasLeagueSpread: Boolean(
      leagueMin >= 3 || signature?.leagueCountMax != null || sameLeagueMax != null,
    ),
    hasNationSpread: Boolean(
      nationMin >= 3 || signature?.nationCountMax != null || sameNationMax != null,
    ),
    hasClubSpread: Boolean(
      clubMin >= 4 || signature?.clubCountMax != null || sameClubMax != null,
    ),
    hasSpreadPressure: false,
    hasCapPressure: Boolean(
      sameLeagueMax != null || sameNationMax != null || sameClubMax != null,
    ),
    hasRatingPressure: toNumber(signature?.ratingTarget) != null,
    hasGoldQuota,
    hasRareRequirement: Boolean(signature?.hasRareRequirement),
    hasSpecialPressure,
    hasStrictPositions: slotCount >= size,
  };
  shape.hasSpreadPressure = Boolean(
    shape.hasLeagueSpread || shape.hasNationSpread || shape.hasClubSpread,
  );
  shape.route =
    shape.isVeryHighChem && shape.hasLeagueSpread && shape.hasClubSpread
      ? "spread_cluster"
      : shape.isHighChem && shape.hasLeagueSpread
        ? "cross_league"
        : shape.isHighChem
          ? "club_core"
          : "default";
  return shape;
};

const summarizeHighChemShape = (shape) =>
  shape?.enabled
    ? {
        route: shape.route,
        targetChem: shape.totalChemistryTarget,
        minPlayerChem: shape.minPlayerChemistryTarget,
        leagueMin: shape.leagueMin,
        nationMin: shape.nationMin,
        clubMin: shape.clubMin,
        sameLeagueMax: shape.sameLeagueMax,
        sameNationMax: shape.sameNationMax,
        sameClubMax: shape.sameClubMax,
        high: shape.isHighChem,
        veryHigh: shape.isVeryHighChem,
        spread: shape.hasSpreadPressure,
        caps: shape.hasCapPressure,
        rating: shape.hasRatingPressure,
        gold: shape.hasGoldQuota,
        rare: shape.hasRareRequirement,
        special: shape.hasSpecialPressure,
        strictPositions: shape.hasStrictPositions,
      }
    : null;

const getBaselinePhaseConfig = (baseConfig = {}) => {
  const base = baseConfig && typeof baseConfig === "object" ? baseConfig : {};
  return {
    id: "baseline",
    optimize: {
      ...base,
      refineBalancedReshape: false,
    },
  };
};

const getPhaseConfig = (signature, baseConfig = {}) => {
  const base = baseConfig && typeof baseConfig === "object" ? baseConfig : {};
  if (!signature?.isCompositionPuzzle) {
    return {
      id: "default",
      optimize: {
        ...base,
        refineSolvedSquad: false,
        refineBalancedReshape: false,
      },
    };
  }
  const highChemLeagueNationSpread = Boolean(
    (toNumber(signature?.totalChemistryTarget) ?? 0) >= 31 &&
      (toNumber(signature?.leagueCountMin) ?? 0) >= 5 &&
      (toNumber(signature?.nationCountMin) ?? 0) >= 5,
  );
  return {
    id: "composition",
    optimize: {
      ...base,
      preserveHighCards: false,
      preserveMaxIterations: Math.min(
        toNumber(base.preserveMaxIterations) ?? 30,
        0,
      ),
      chemMaxIterations: Math.max(toNumber(base.chemMaxIterations) ?? 60, 75),
      chemExtendedMaxIterations: Math.max(
        toNumber(base.chemExtendedMaxIterations) ?? 120,
        140,
      ),
      chemEscapeDepth: Math.max(toNumber(base.chemEscapeDepth) ?? 3, 4),
      chemTimeBudgetMs: Math.max(toNumber(base.chemTimeBudgetMs) ?? 0, 1500),
      chemExtendedShortfallThreshold: Math.max(
        toNumber(base.chemExtendedShortfallThreshold) ?? 2,
        highChemLeagueNationSpread ? 5 : 4,
      ),
      chemNearTargetShortfall: Math.max(
        toNumber(base.chemNearTargetShortfall) ?? 2,
        highChemLeagueNationSpread ? 4 : 2,
      ),
      chemExtendedTimeBudgetMs: Math.max(
        toNumber(base.chemExtendedTimeBudgetMs) ?? 0,
        highChemLeagueNationSpread ? 8000 : 0,
      ),
      chemExtendedEscapeDepth: Math.max(
        toNumber(base.chemExtendedEscapeDepth) ?? 0,
        highChemLeagueNationSpread ? 6 : 0,
      ),
      chemExtendedEscapeBeamWidth: Math.max(
        toNumber(base.chemExtendedEscapeBeamWidth) ?? 0,
        highChemLeagueNationSpread ? 32 : 0,
      ),
      chemExtendedEscapeCandidateLimit: Math.max(
        toNumber(base.chemExtendedEscapeCandidateLimit) ?? 0,
        highChemLeagueNationSpread ? 180 : 0,
      ),
      refineSolvedSquad: false,
      refineBalancedReshape: false,
    },
  };
};

const buildSeedKey = (seed) =>
  seed?.key != null
    ? String(seed.key)
    : JSON.stringify({
    type: seed?.type ?? "baseline",
    axis: seed?.axis ?? null,
    groupId: seed?.groupId ?? null,
    tier: seed?.tier ?? 0,
    filter: Boolean(seed?.poolFilter),
  });

const createSeedDescriptor = ({
  type = "baseline",
  axis = null,
  groupId = null,
  label = "Baseline",
  strength = 3,
  family = null,
  reason = null,
  budgetMs = null,
  poolFilter = null,
  poolBias = null,
  prefillBias = null,
  prefillGroups = null,
  prefillPlayerIds = null,
  key = null,
  tier = 0,
}) => {
  const attr = axis ? AXIS_TO_ATTR[axis] ?? null : null;
  const biasMagnitude = Math.max(1, toNumber(strength) ?? 3) * 100;
  return {
    key,
    type,
    axis,
    groupId,
    label,
    tier,
    family,
    reason,
    budgetMs: toNumber(budgetMs) ?? null,
    poolBias:
      typeof poolBias === "function"
        ? poolBias
        :
      attr && groupId != null
        ? (player) =>
            String(player?.[attr] ?? "") === String(groupId)
              ? -biasMagnitude
              : 0
        : null,
    prefillBias:
      prefillBias && typeof prefillBias === "object"
        ? prefillBias
        :
      attr && groupId != null
        ? { axis, groupId, strength: Math.max(1, toNumber(strength) ?? 3) }
        : null,
    prefillGroups: Array.isArray(prefillGroups)
      ? prefillGroups
          .map((entry) => ({
            attr: entry?.attr ?? null,
            value: entry?.value ?? null,
            count: Math.max(0, toNumber(entry?.count) ?? 0),
          }))
          .filter((entry) => entry.attr && entry.value != null && entry.count > 0)
      : null,
    prefillPlayerIds: Array.isArray(prefillPlayerIds)
      ? prefillPlayerIds
          .map((value) => (value == null ? null : String(value)))
          .filter(Boolean)
      : null,
    poolFilter: typeof poolFilter === "function" ? poolFilter : null,
  };
};

const dedupeSeeds = (seeds) => {
  const seen = new Set();
  const list = [];
  for (const seed of seeds || []) {
    const key = buildSeedKey(seed);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(seed);
  }
  return list;
};

const scoreGroupSeed = (
  players,
  axis,
  groupId,
  signature,
  context,
  squadSize,
  mode = "default",
  rules = null,
) => {
  const attr = AXIS_TO_ATTR[axis] ?? null;
  if (!attr || groupId == null) return null;
  const groupPlayers = (players || []).filter(
    (player) => String(player?.[attr] ?? "") === String(groupId),
  );
  if (!groupPlayers.length) return null;
  const positions = new Set();
  const requiredPositions = extractRequiredPositionSet(context?.squadSlots, squadSize);
  for (const player of groupPlayers) {
    const posNames = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : player?.preferredPositionName
        ? [player.preferredPositionName]
        : [];
    for (const name of posNames) {
      const normalized = name == null ? null : String(name);
      if (!normalized) continue;
      if (!requiredPositions.size || requiredPositions.has(normalized)) {
        positions.add(normalized);
      }
    }
  }
  const clubs = buildCountsMap(groupPlayers, "teamId").size;
  const rareCount = groupPlayers.filter((player) => isRareNonSpecialPlayer(player)).length;
  const avgRating = computeAverage(groupPlayers.map((player) => player?.rating));
  const compositionFitScore = scoreGroupCompositionFit(
    groupPlayers,
    axis,
    signature,
    squadSize,
  );
  const ruleFitScore = scoreGroupRuleFit(
    groupPlayers,
    rules,
    signature,
    axis,
    squadSize,
    [],
    getSameAxisMinTarget(signature, axis, squadSize),
  );
  const requiredMatch =
    axis === "league"
      ? signature?.requiredLeagueIds?.includes?.(toNumber(groupId)) ?? false
      : axis === "nation"
        ? signature?.requiredNationIds?.includes?.(toNumber(groupId)) ?? false
        : signature?.requiredClubIds?.includes?.(toNumber(groupId)) ?? false;
  const defaultScore =
    groupPlayers.length * 12 +
    positions.size * 7 +
    rareCount * 2 +
    clubs * (axis === "club" ? 0 : 2) +
    compositionFitScore +
    ruleFitScore +
    (requiredMatch ? 30 : 0) -
    avgRating;
  const chemistryTarget = toNumber(signature?.totalChemistryTarget) ?? 0;
  const ratingTarget = toNumber(signature?.ratingTarget) ?? 0;
  const hasRatingTarget = toNumber(signature?.ratingTarget) != null;
  const ratingEfficiencyPenalty =
    hasRatingTarget
      ? mode === "chemistry_rating"
        ? avgRating * 4
        : mode === "rating_heavy"
          ? avgRating * 25
          : -avgRating
      : -avgRating * (mode === "chemistry_rating" ? 5 : 2);
  const chemistryRatingScore =
    groupPlayers.length * 6 +
    positions.size * 9 +
    rareCount * 2 +
    clubs * (axis === "club" ? 0 : 2) +
    ratingEfficiencyPenalty +
    chemistryTarget * 2 +
    ratingTarget * 3 +
    compositionFitScore * 1.5 +
    ruleFitScore * 1.25 +
    (requiredMatch ? 30 : 0);
  const cappedCount = Math.min(groupPlayers.length, Math.max(6, toNumber(squadSize) ?? 11));
  const ratingHeavyScore =
    cappedCount * 8 +
    positions.size * 15 +
    rareCount * 2 +
    clubs * (axis === "club" ? 0 : 2) +
    (hasRatingTarget ? avgRating * 25 : -avgRating * 4) +
    chemistryTarget * 2 +
    ratingTarget * 4 +
    compositionFitScore +
    ruleFitScore +
    (requiredMatch ? 30 : 0);
  const score =
    mode === "chemistry_rating"
      ? chemistryRatingScore
      : mode === "rating_heavy"
        ? ratingHeavyScore
        : defaultScore;
  return { axis, groupId, score };
};

const rankIdentityIdsBySupply = (players, attr, ids, limit = 4) => {
  const idSet = new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => (id == null ? null : String(toNumber(id) ?? id)))
      .filter(Boolean),
  );
  if (!idSet.size || !attr) return [];
  const entries = new Map();
  for (const player of players || []) {
    const raw = player?.[attr];
    if (raw == null) continue;
    const key = String(toNumber(raw) ?? raw);
    if (!idSet.has(key)) continue;
    const entry =
      entries.get(key) ?? {
        id: raw,
        count: 0,
        positions: new Set(),
        rareCount: 0,
        sumRating: 0,
      };
    entry.count += 1;
    entry.sumRating += toNumber(player?.rating) ?? 0;
    if (isRareNonSpecialPlayer(player)) entry.rareCount += 1;
    const positions = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : player?.preferredPositionName
        ? [player.preferredPositionName]
        : [];
    for (const position of positions) {
      if (position != null) entry.positions.add(String(position));
    }
    entries.set(key, entry);
  }
  return Array.from(entries.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.positions.size !== a.positions.size)
        return b.positions.size - a.positions.size;
      if (b.rareCount !== a.rareCount) return b.rareCount - a.rareCount;
      const avgA = a.count ? a.sumRating / a.count : 0;
      const avgB = b.count ? b.sumRating / b.count : 0;
      return avgB - avgA;
    })
    .slice(0, Math.max(1, toNumber(limit) ?? 4))
    .map((entry) => entry.id);
};

const getRequiredIdentityRule = (rules, type) =>
  (rules || []).find((rule) => {
    if (!rule || rule.type !== type) return false;
    if (rule.op !== "min" && rule.op !== "exact") return false;
    const required = getRuleCount(rule, 11);
    return required != null && required > 0;
  }) ?? null;

const createRequiredIdentityChemBridgeSeeds = ({
  signature,
  players,
  squadSize,
  rules,
}) => {
  if (!signature?.isCompositionPuzzle || !signature?.hasChemistry) return [];
  const chemistryTarget = toNumber(signature?.totalChemistryTarget) ?? 0;
  if (chemistryTarget < Math.max(22, Math.floor((toNumber(squadSize) ?? 11) * 2))) {
    return [];
  }
  if (!(signature?.requiredClubIds || []).length) return [];
  if (!(signature?.requiredNationIds || []).length) return [];

  const clubRule = getRequiredIdentityRule(rules, "club_id");
  const nationRule = getRequiredIdentityRule(rules, "nation_id");
  const clubRequired = Math.max(1, getRuleCount(clubRule, squadSize) ?? 1);
  const nationRequired = Math.max(1, getRuleCount(nationRule, squadSize) ?? 1);
  const ratingTarget = toNumber(signature?.ratingTarget);
  const lowRatingQuotaBridge = Boolean(
    ratingTarget != null &&
      ratingTarget >= 77 &&
      ratingTarget <= 78 &&
      clubRequired <= 3 &&
      (signature?.requiredClubIds || []).length > 1,
  );
  const rankedClubs = rankIdentityIdsBySupply(
    players,
    "teamId",
    signature.requiredClubIds,
    4,
  );
  const rankedNations = rankIdentityIdsBySupply(
    players,
    "nationId",
    signature.requiredNationIds,
    2,
  );
  if (!rankedClubs.length || !rankedNations.length) return [];

  const nationId = rankedNations[0];
  const requiredClubKeys = new Set(
    rankedClubs.map((id) => String(toNumber(id) ?? id)),
  );
  const requiredNationKey = String(toNumber(nationId) ?? nationId);
  const linkedLeagueCounts = new Map();
  for (const player of players || []) {
    const clubKey = String(toNumber(player?.teamId) ?? player?.teamId);
    if (!requiredClubKeys.has(clubKey)) continue;
    const leagueKey = String(toNumber(player?.leagueId) ?? player?.leagueId);
    if (!leagueKey || leagueKey === "null" || leagueKey === "undefined") continue;
    linkedLeagueCounts.set(leagueKey, (linkedLeagueCounts.get(leagueKey) ?? 0) + 1);
  }
  const linkedLeagueKeys = Array.from(linkedLeagueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => key);

  const buildBias = (clubKeys) => (player) => {
    if (!player) return 0;
    let score = 0;
    const clubKey = String(toNumber(player?.teamId) ?? player?.teamId);
    const nationKey = String(toNumber(player?.nationId) ?? player?.nationId);
    const leagueKey = String(toNumber(player?.leagueId) ?? player?.leagueId);
    const clubWeight = lowRatingQuotaBridge ? 220 : 900;
    const nationWeight = lowRatingQuotaBridge ? 180 : 520;
    const leagueWeight = lowRatingQuotaBridge ? 80 : 220;
    if (clubKeys.has(clubKey)) score -= clubWeight;
    if (nationKey === requiredNationKey) score -= nationWeight;
    if (linkedLeagueKeys.includes(leagueKey)) score -= leagueWeight;
    return score;
  };

  const seeds = [];
  if (rankedClubs.length >= 2 && clubRequired <= 3) {
    const selectedClubs = rankedClubs.slice(0, Math.min(2, clubRequired));
    const clubKeys = new Set(selectedClubs.map((id) => String(toNumber(id) ?? id)));
    seeds.push(
      createSeedDescriptor({
        key: `required_bridge:clubs=${selectedClubs
          .map((id) => toNumber(id) ?? id)
          .join(".")}:nation=${toNumber(nationId) ?? nationId}`,
        type: "required_identity_bridge",
        label: "Required club/nation bridge",
        family: "required_identity_bridge",
        reason: "high_chem_required_club_nation_pressure",
        tier: 1,
        prefillGroups: [
          ...selectedClubs.map((clubId) => ({
            attr: "teamId",
            value: clubId,
            count: 1,
          })),
          {
            attr: "nationId",
            value: nationId,
            count: lowRatingQuotaBridge
              ? Math.max(1, Math.min(3, nationRequired - 1))
              : Math.min(5, nationRequired),
          },
        ],
        poolBias: buildBias(clubKeys),
      }),
    );
  }

  for (const clubId of rankedClubs.slice(0, 2)) {
    const clubKey = String(toNumber(clubId) ?? clubId);
    const clubPrefillCount = lowRatingQuotaBridge
      ? 1
      : Math.min(4, clubRequired);
    const nationPrefillCount = lowRatingQuotaBridge
      ? Math.max(1, Math.min(3, nationRequired - 1))
      : Math.min(5, nationRequired);
    seeds.push(
      createSeedDescriptor({
        key: `required_bridge:club=${toNumber(clubId) ?? clubId}:count=${clubPrefillCount}:nation=${
          toNumber(nationId) ?? nationId
        }`,
        type: "required_identity_bridge",
        axis: "club",
        groupId: clubId,
        label: `Required club ${clubId} + nation ${nationId}`,
        family: "required_identity_bridge",
        reason: "high_chem_required_club_nation_pressure",
        tier: 1,
        prefillGroups: [
          {
            attr: "teamId",
            value: clubId,
            count: clubPrefillCount,
          },
          {
            attr: "nationId",
            value: nationId,
            count: nationPrefillCount,
          },
        ],
        poolBias: buildBias(new Set([clubKey])),
      }),
    );
  }

  return dedupeSeeds(seeds).slice(0, 3);
};

const generateBaselineSeeds = (signature, players, squadSize, context, rules = null) => {
  const baselineSeed = createSeedDescriptor({
    type: "baseline",
    label: "Baseline",
  });
  const highChemShape = classifyHighChemShape(
    signature,
    rules,
    squadSize,
    context,
  );
  const broadenLeagueExploration = shouldBroadenSeedExploration(
    signature,
    "league",
  );
  const broadenNationExploration = shouldBroadenSeedExploration(
    signature,
    "nation",
  );
  const hasUsefulSeedSignals = Boolean(
    (signature?.requiredLeagueIds || []).length ||
      (signature?.requiredNationIds || []).length ||
      (signature?.requiredClubIds || []).length ||
      signature?.hasSameLeagueMin ||
      signature?.hasSameNationMin ||
      signature?.hasSameClubMin ||
      signature?.sameLeagueMax != null ||
      signature?.sameNationMax != null ||
      signature?.sameClubMax != null ||
      (signature?.dominantAxes || []).length,
  );
  if (!hasUsefulSeedSignals) return [baselineSeed];
  const requiredSeeds = [];
  const exploratorySeeds = [];
  const chemistryExplorationWanted = Boolean(
    signature?.hasChemistry &&
      (
        (toNumber(signature?.totalChemistryTarget) ?? 0) >=
          Math.max(22, Math.floor((toNumber(squadSize) ?? 11) * 2)) ||
        signature?.sameLeagueMax != null ||
        signature?.sameNationMax != null ||
        signature?.sameClubMax != null ||
        toNumber(signature?.ratingTarget) >= 74
      ),
  );
  const ratingExplorationWanted = Boolean(
    signature?.hasChemistry &&
      (toNumber(signature?.ratingTarget) ?? 0) >= 74,
  );
  const lowRatingRequiredClubQuota = Boolean(
    (toNumber(signature?.ratingTarget) ?? 0) >= 77 &&
      (toNumber(signature?.ratingTarget) ?? 0) <= 78 &&
      (toNumber(signature?.requiredClubTarget) ?? 0) > 0 &&
      (toNumber(signature?.requiredClubTarget) ?? 0) <= 3 &&
      (signature?.requiredClubIds || []).length > 1,
  );
  for (const groupId of signature.requiredLeagueIds || []) {
    requiredSeeds.push(
      createSeedDescriptor({
        type: "required_identity",
        axis: "league",
        groupId,
        label: `Required league ${groupId}`,
        strength: 5,
      }),
    );
  }
  for (const groupId of signature.requiredNationIds || []) {
    requiredSeeds.push(
      createSeedDescriptor({
        type: "required_identity",
        axis: "nation",
        groupId,
        label: `Required nation ${groupId}`,
        strength: 5,
      }),
    );
  }
  for (const groupId of signature.requiredClubIds || []) {
    requiredSeeds.push(
      createSeedDescriptor({
        type: "required_identity",
        axis: "club",
        groupId,
        label: `Required club ${groupId}`,
        strength: lowRatingRequiredClubQuota ? 2 : 5,
      }),
    );
  }
  requiredSeeds.push(
    ...createRequiredIdentityChemBridgeSeeds({
      signature,
      players,
      squadSize,
      rules,
    }),
  );
  if (
    signature?.hasSameLeagueMin ||
    (signature?.requiredLeagueIds || []).length ||
    (signature?.dominantAxes || []).includes("league") ||
    chemistryExplorationWanted
  ) {
    const defaultLeagueSeedCount =
      chemistryExplorationWanted || ratingExplorationWanted
        ? broadenLeagueExploration
          ? 3
          : 1
        : broadenLeagueExploration
          ? 3
          : 2;
    const leagues = Array.from(buildCountsMap(players, "leagueId").keys())
      .map((groupId) =>
        scoreGroupSeed(
          players,
          "league",
          groupId,
          signature,
          context,
          squadSize,
          "default",
          rules,
        ),
      )
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, defaultLeagueSeedCount);
    for (const entry of leagues) {
      exploratorySeeds.push(
        createSeedDescriptor({
          type: "dominant_league",
          axis: "league",
          groupId: entry.groupId,
          label: `League ${entry.groupId}`,
          strength: 4,
        }),
      );
    }
    if (chemistryExplorationWanted) {
      const chemistryLeague = Array.from(buildCountsMap(players, "leagueId").keys())
        .map((groupId) =>
          scoreGroupSeed(
            players,
            "league",
            groupId,
            signature,
            context,
            squadSize,
            "chemistry_rating",
            rules,
          ),
        )
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, broadenLeagueExploration ? 2 : 1);
      for (const entry of chemistryLeague) {
        exploratorySeeds.push(
          createSeedDescriptor({
            type: "chemistry_league",
            axis: "league",
            groupId: entry.groupId,
            label: `Chem league ${entry.groupId}`,
            strength: 5,
          }),
        );
      }
    }
    if (ratingExplorationWanted) {
      const ratingLeague = Array.from(buildCountsMap(players, "leagueId").keys())
        .map((groupId) =>
          scoreGroupSeed(
            players,
            "league",
            groupId,
            signature,
            context,
            squadSize,
            "rating_heavy",
            rules,
          ),
        )
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);
      for (const entry of ratingLeague) {
        exploratorySeeds.push(
          createSeedDescriptor({
            type: "rating_league",
            axis: "league",
            groupId: entry.groupId,
            label: `Rating league ${entry.groupId}`,
            strength: 5,
          }),
        );
      }
    }
  }
  if (
    signature?.hasSameNationMin ||
    (signature?.requiredNationIds || []).length ||
    (signature?.dominantAxes || []).includes("nation") ||
    chemistryExplorationWanted
  ) {
    const defaultNationSeedCount =
      chemistryExplorationWanted || ratingExplorationWanted
        ? broadenNationExploration
          ? 3
          : 1
        : broadenNationExploration
          ? 3
          : 2;
    const nations = Array.from(buildCountsMap(players, "nationId").keys())
      .map((groupId) =>
        scoreGroupSeed(
          players,
          "nation",
          groupId,
          signature,
          context,
          squadSize,
          "default",
          rules,
        ),
      )
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, defaultNationSeedCount);
    for (const entry of nations) {
      exploratorySeeds.push(
        createSeedDescriptor({
          type: "dominant_nation",
          axis: "nation",
          groupId: entry.groupId,
          label: `Nation ${entry.groupId}`,
          strength: 4,
        }),
      );
    }
    if (chemistryExplorationWanted) {
      const chemistryNation = Array.from(buildCountsMap(players, "nationId").keys())
        .map((groupId) =>
          scoreGroupSeed(
            players,
            "nation",
            groupId,
            signature,
            context,
            squadSize,
            "chemistry_rating",
            rules,
          ),
        )
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, broadenNationExploration ? 2 : 1);
      for (const entry of chemistryNation) {
        exploratorySeeds.push(
          createSeedDescriptor({
            type: "chemistry_nation",
            axis: "nation",
            groupId: entry.groupId,
            label: `Chem nation ${entry.groupId}`,
            strength: 5,
          }),
        );
      }
    }
    if (ratingExplorationWanted) {
      const ratingNation = Array.from(buildCountsMap(players, "nationId").keys())
        .map((groupId) =>
          scoreGroupSeed(
            players,
            "nation",
            groupId,
            signature,
            context,
            squadSize,
            "rating_heavy",
            rules,
          ),
        )
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);
      for (const entry of ratingNation) {
        exploratorySeeds.push(
          createSeedDescriptor({
            type: "rating_nation",
            axis: "nation",
            groupId: entry.groupId,
            label: `Rating nation ${entry.groupId}`,
            strength: 5,
          }),
        );
      }
    }
  }
  const highChemSeeds = buildHighChemSeedPlan({
    shape: highChemShape,
    signature,
    players,
    squadSize,
    context,
    rules,
    phase: "baseline",
  });
  const highChemFirst = Boolean(
    highChemShape?.isVeryHighChem && (toNumber(highChemShape?.clubMin) ?? 0) >= 5,
  );
  const orderedSeeds = highChemFirst
    ? [
        baselineSeed,
        ...highChemSeeds,
        ...requiredSeeds,
        ...exploratorySeeds,
      ]
    : [
        baselineSeed,
        ...requiredSeeds,
        ...exploratorySeeds,
        ...highChemSeeds,
      ];
  return dedupeSeeds(orderedSeeds).slice(
    0,
    chemistryExplorationWanted || ratingExplorationWanted
      ? broadenLeagueExploration || broadenNationExploration
        ? 10
        : 8
      : 4,
  );
};

const buildFiltersFingerprint = (filters = {}) =>
  JSON.stringify({
    excludeSpecial: toBooleanSetting(filters?.excludeSpecial, false),
    useTotwPlayers: toBooleanSetting(filters?.useTotwPlayers, true),
    useEvolutionPlayers: toBooleanSetting(filters?.useEvolutionPlayers, false),
    onlyStorage: toBooleanSetting(filters?.onlyStorage, false),
    onlyUntradeables: toBooleanSetting(filters?.onlyUntradeables, false),
    onlyDuplicates: toBooleanSetting(filters?.onlyDuplicates, false),
    ratingMin: toNumber(filters?.ratingMin) ?? null,
    ratingMax: toNumber(filters?.ratingMax) ?? null,
    allowedCardBuckets: normalizeAllowedCardBuckets(
      filters?.allowedCardBuckets,
      CARD_BUCKETS,
    ).sort(),
    excludedLeagueIds: (filters?.excludedLeagueIds || []).map(String).sort(),
    excludedNationIds: (filters?.excludedNationIds || []).map(String).sort(),
  });

const buildWinningSeedCacheKey = (context, signature) =>
  JSON.stringify({
    signature: signature?.fingerprint ?? null,
    revision:
      toNumber(context?._cacheRevision) ??
      toNumber(context?.snapshotRevision) ??
      null,
    filters: buildFiltersFingerprint(context?.filters || {}),
  });

const summarizeFailure = (result, seed, signature, phaseConfig) => {
  const failingRequirements = Array.isArray(result?.failingRequirements)
    ? result.failingRequirements
    : [];
  const chemistryShortfall =
    result?.stats?.chemistryTargets?.total != null ||
    result?.stats?.chemistryTargets?.minEach != null
      ? getChemistryShortfall(
          {
            totalChem: toNumber(result?.stats?.chemistry?.totalChem) ?? 0,
            minChem: toNumber(result?.stats?.chemistry?.minChem) ?? 0,
          },
          result?.stats?.chemistryTargets,
        )
      : { score: Infinity };
  const snapshot = result?.compositionSnapshot ?? {
    uniqueLeagues: Infinity,
    uniqueNations: Infinity,
    uniqueClubs: Infinity,
    dominantLeague: null,
    dominantLeagueCount: 0,
    dominantNation: null,
    dominantNationCount: 0,
    dominantClub: null,
    dominantClubCount: 0,
    specialCount: 0,
    rareCount: 0,
  };
  return {
    seedType: seed?.type ?? "baseline",
    axis: seed?.axis ?? null,
    groupId: seed?.groupId ?? null,
    rating: toNumber(result?.stats?.squadRating) ?? null,
    totalChem: toNumber(result?.stats?.chemistry?.totalChem) ?? null,
    chemShortfall: toNumber(chemistryShortfall?.score) ?? Infinity,
    failingTypes: Array.from(
      new Set(
        failingRequirements
          .map((entry) => normalizeRequirementType(entry))
          .filter(Boolean),
      ),
    ),
    uniqueLeagues: snapshot.uniqueLeagues,
    uniqueNations: snapshot.uniqueNations,
    uniqueClubs: snapshot.uniqueClubs,
    dominantLeague: snapshot.dominantLeague,
    dominantLeagueCount: snapshot.dominantLeagueCount,
    dominantNation: snapshot.dominantNation,
    dominantNationCount: snapshot.dominantNationCount,
    dominantClub: snapshot.dominantClub,
    dominantClubCount: snapshot.dominantClubCount,
    specialCount: snapshot.specialCount,
    rareCount: snapshot.rareCount,
    phaseConfigId: phaseConfig?.id ?? null,
  };
};

const compareFailureSummaries = (a, b) => {
  const hardFailA = a?.failingTypes?.length ?? Infinity;
  const hardFailB = b?.failingTypes?.length ?? Infinity;
  if (hardFailA !== hardFailB) return hardFailA - hardFailB;
  const chemA = toNumber(a?.chemShortfall) ?? Infinity;
  const chemB = toNumber(b?.chemShortfall) ?? Infinity;
  if (chemA !== chemB) return chemA - chemB;
  const spreadA =
    (toNumber(a?.uniqueLeagues) ?? 99) +
    (toNumber(a?.uniqueNations) ?? 99) +
    (toNumber(a?.uniqueClubs) ?? 99);
  const spreadB =
    (toNumber(b?.uniqueLeagues) ?? 99) +
    (toNumber(b?.uniqueNations) ?? 99) +
    (toNumber(b?.uniqueClubs) ?? 99);
  if (spreadA !== spreadB) return spreadA - spreadB;
  return 0;
};

const compareSolverResults = (a, b) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const solvedA = Boolean(a?.stats?.solved);
  const solvedB = Boolean(b?.stats?.solved);
  if (solvedA !== solvedB) return solvedA ? -1 : 1;
  if (solvedA && solvedB) {
    const valueA =
      a?.stats?.solvedValue ??
      a?.stats?.refinement?.after ??
      a?.stats?.refinement?.before ??
      null;
    const valueB =
      b?.stats?.solvedValue ??
      b?.stats?.refinement?.after ??
      b?.stats?.refinement?.before ??
      null;
    if (valueA && valueB) {
      if (isSolvedSquadValueBetter(valueA, valueB)) return -1;
      if (isSolvedSquadValueBetter(valueB, valueA)) return 1;
    }
  }
  return compareFailureSummaries(
    summarizeFailure(a, a?.seed, a?.signature, a?.phaseConfig),
    summarizeFailure(b, b?.seed, b?.signature, b?.phaseConfig),
  );
};

const isNoRatingSolvedResultWasteful = (result, profile) => {
  if (!profile?.enabled || !result?.stats?.solved) return false;
  const value = result?.stats?.solvedValue ?? null;
  if (!value) return false;
  const excessSpecials = toNumber(value.excessSpecialCount) ?? 0;
  if (excessSpecials > 0) return true;
  const maxRating = toNumber(value.maxRating) ?? 0;
  if (maxRating > (toNumber(profile.wasteMaxRating) ?? 82)) return true;
  const highRatingScore = toNumber(value.highRatingScore) ?? 0;
  if (highRatingScore > (toNumber(profile.wasteHighRatingScore) ?? 64)) {
    return true;
  }
  return false;
};

const createNoRatingConservationCapSeeds = (result, profile, triedSeedKeys) => {
  if (!profile?.enabled || !result?.stats?.solved) return [];
  const value = result?.stats?.solvedValue ?? null;
  const currentMax = Math.floor(toNumber(value?.maxRating) ?? 0);
  const softMax = Math.floor(toNumber(profile?.softMaxRating) ?? 0);
  if (currentMax <= 0 || softMax <= 0 || currentMax <= softMax) return [];
  const caps = [
    softMax,
    Math.max(softMax, currentMax - 5),
    Math.max(softMax, currentMax - 2),
    currentMax - 1,
  ]
    .map((cap) => Math.floor(toNumber(cap) ?? 0))
    .filter((cap) => cap > 0 && cap < currentMax);
  const uniqueCaps = Array.from(new Set(caps)).sort((a, b) => a - b);
  const seeds = [];
  for (const cap of uniqueCaps.slice(0, 3)) {
    const seed = createSeedDescriptor({
      key: `no_rating_cap:${cap}`,
      type: "no_rating_conservation_cap",
      label: `No-rating cap ${cap}`,
      family: "no_rating_conservation",
      reason: "solved_squad_high_rating_waste",
      tier: 1,
      poolFilter: (player) => (toNumber(player?.rating) ?? 0) <= cap,
      poolBias: (player) => {
        const rating = toNumber(player?.rating) ?? 0;
        const overPivot = Math.max(0, rating - (toNumber(profile?.pivot) ?? 75));
        return overPivot * 20 + (player?.isSpecial ? 400 : 0);
      },
    });
    seed.ratingCap = cap;
    if (triedSeedKeys?.has?.(buildSeedKey(seed))) continue;
    seeds.push(seed);
  }
  return seeds;
};

const isLowRatingSolvedResultWasteful = (result, profile) => {
  if (!profile?.enabled || !result?.stats?.solved) return false;
  const value = result?.stats?.solvedValue ?? null;
  if (!value) return false;
  const excessSpecials = toNumber(value.excessSpecialCount) ?? 0;
  if (excessSpecials > 0) return true;
  const maxRating = toNumber(value.maxRating) ?? 0;
  if (maxRating > (toNumber(profile.wasteMaxRating) ?? 84)) return true;
  const highRatingScore = toNumber(value.highRatingScore) ?? 0;
  return highRatingScore > (toNumber(profile.wasteHighRatingScore) ?? 64);
};

const createLowRatingConservationCapSeeds = (
  result,
  profile,
  triedSeedKeys,
) => {
  if (!profile?.enabled || !result?.stats?.solved) return [];
  const value = result?.stats?.solvedValue ?? null;
  const currentMax = Math.floor(toNumber(value?.maxRating) ?? 0);
  const softMax = Math.floor(toNumber(profile?.softMaxRating) ?? 0);
  if (currentMax <= 0 || softMax <= 0 || currentMax <= softMax) return [];
  const caps = [
    Math.max(softMax, currentMax - 1),
    Math.max(softMax, currentMax - 2),
    Math.max(softMax, currentMax - 3),
    softMax,
  ]
    .map((cap) => Math.floor(toNumber(cap) ?? 0))
    .filter((cap) => cap > 0 && cap < currentMax);
  const uniqueCaps = Array.from(new Set(caps)).sort((a, b) => b - a);
  const seeds = [];
  for (const cap of uniqueCaps.slice(0, 3)) {
    const seed = createSeedDescriptor({
      key: `low_rating_cap:${cap}`,
      type: "low_rating_conservation_cap",
      label: `Low-rating cap ${cap}`,
      family: "low_rating_conservation",
      reason: "solved_squad_low_rating_high_card_waste",
      tier: 1,
      poolFilter: (player) => (toNumber(player?.rating) ?? 0) <= cap,
      poolBias: (player) => {
        const rating = toNumber(player?.rating) ?? 0;
        const overPivot = Math.max(0, rating - (toNumber(profile?.pivot) ?? 78));
        return overPivot * 20 + (player?.isSpecial ? 400 : 0);
      },
    });
    seed.ratingCap = cap;
    if (triedSeedKeys?.has?.(buildSeedKey(seed))) continue;
    seeds.push(seed);
  }
  return seeds;
};

const getTopClusterClubIds = (
  players,
  attr,
  value,
  limit = 2,
  options = {},
) => {
  if (!attr || value == null) return [];
  const byClub = new Map();
  for (const player of players || []) {
    if (!player || player.teamId == null) continue;
    if (String(player?.[attr] ?? "") !== String(value)) continue;
    if (!byClub.has(player.teamId)) {
      byClub.set(player.teamId, {
        clubId: player.teamId,
        count: 0,
        sumRating: 0,
        positions: new Set(),
      });
    }
    const entry = byClub.get(player.teamId);
    entry.count += 1;
    entry.sumRating += toNumber(player.rating) ?? 0;
    const posNames = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : player?.preferredPositionName
        ? [player.preferredPositionName]
        : [];
    for (const name of posNames) {
      if (name != null) entry.positions.add(String(name));
    }
  }
  const preferLowerRating = options?.preferLowerRating === true;
  return Array.from(byClub.values())
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => {
      if (b.positions.size !== a.positions.size)
        return b.positions.size - a.positions.size;
      if (b.count !== a.count) return b.count - a.count;
      const avgA = a.count ? a.sumRating / a.count : 0;
      const avgB = b.count ? b.sumRating / b.count : 0;
      return preferLowerRating ? avgA - avgB : avgB - avgA;
    })
    .slice(0, Math.max(1, toNumber(limit) ?? 2))
    .map((entry) => entry.clubId);
};

const getTopGroupIdsForAttr = (
  players,
  attr,
  signature,
  squadSize,
  limit = 8,
  preferredIds = [],
) => {
  const axis =
    Object.entries(AXIS_TO_ATTR).find(([, axisAttr]) => axisAttr === attr)?.[0] ??
    null;
  const groups = new Map();
  for (const player of players || []) {
    const value = player?.[attr];
    if (value == null) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(player);
  }
  const preferred = new Set(
    (preferredIds || [])
      .map((value) => toNumber(value))
      .filter((value) => value != null)
      .map((value) => String(value)),
  );
  return Array.from(groups.entries())
    .map(([value, list]) => {
      const positions = new Set();
      for (const player of list) {
        const names = Array.isArray(player?.alternativePositionNames)
          ? player.alternativePositionNames
          : player?.preferredPositionName
            ? [player.preferredPositionName]
            : [];
        for (const name of names) {
          if (name != null) positions.add(String(name));
        }
      }
      const avgRating = computeAverage(list.map((player) => player?.rating));
      const fitScore = axis
        ? scoreGroupCompositionFit(list, axis, signature, squadSize)
        : 0;
      const valueKey = String(toNumber(value) ?? value);
      return {
        value,
        score:
          list.length * 12 +
          positions.size * 16 +
          fitScore +
          (preferred.has(valueKey) ? 400 : 0) -
          avgRating,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, toNumber(limit) ?? 8))
    .map((entry) => entry.value);
};

const createLeagueSpreadTemplateSeeds = ({
  signature,
  failures,
  players,
  squadSize,
}) => {
  const minLeagues = toNumber(signature?.leagueCountMin) ?? 0;
  const chemistryTarget = toNumber(signature?.totalChemistryTarget) ?? 0;
  if (!signature?.isCompositionPuzzle) return [];
  if (minLeagues < 4 || chemistryTarget < 28) return [];

  const preferredLeagueIds = (failures || [])
    .map((failure) => toNumber(failure?.dominantLeague))
    .filter((value) => value != null);
  const candidateLeagueIds = getTopGroupIdsForAttr(
    players,
    "leagueId",
    signature,
    squadSize,
    10,
    preferredLeagueIds,
  );
  if (candidateLeagueIds.length < minLeagues) return [];

  const leagueCountDistributions =
    squadSize >= 11
      ? minLeagues >= 5
        ? [
            [5, 3, 1, 1, 1],
            [5, 2, 2, 1, 1],
            [3, 2, 2, 2, 2],
            [4, 2, 2, 2, 1],
            [3, 3, 2, 2, 1],
          ]
        : [
            [5, 3, 2, 1],
            [6, 2, 2, 1],
            [4, 3, 2, 2],
          ]
      : [
          [Math.max(1, squadSize - minLeagues + 1)].concat(
            new Array(Math.max(0, minLeagues - 1)).fill(1),
          ),
        ];
  const seeds = [];
  for (const distribution of leagueCountDistributions) {
    if (distribution.length < minLeagues) continue;
    const leagueIds = candidateLeagueIds.slice(0, distribution.length);
    if (leagueIds.length < distribution.length) continue;
    const key = `league_spread_counts:${distribution.join(".")}:${leagueIds
      .map((value) => toNumber(value) ?? value)
      .join(".")}`;
    const quotas = leagueIds.map((value, leagueIndex) => ({
      attr: "leagueId",
      value,
      count: distribution[leagueIndex],
    }));
    const quotaByLeague = new Map(
      quotas.map((entry) => [
        String(toNumber(entry.value) ?? entry.value),
        entry.count,
      ]),
    );
    seeds.push(
      createSeedDescriptor({
        key,
        type: "league_spread_template",
        label: `League count distribution ${distribution.join("-")}`,
        family: "league_spread_template",
        reason: "league_spread_pressure",
        tier: 2,
        prefillGroups: quotas,
        poolBias: (player) => {
          const leagueKey = String(toNumber(player?.leagueId) ?? player?.leagueId);
          const quota = quotaByLeague.get(leagueKey) ?? 0;
          if (quota <= 0) return 0;
          return -240 - quota * 90;
        },
      }),
    );
    if (seeds.length >= 3) break;
  }
  return seeds;
};

const createHighChemSpreadClusterSeed = ({
  signature,
  players,
  squadSize,
  context,
}) => {
  const minLeagues = toNumber(signature?.leagueCountMin) ?? 0;
  const minClubs = toNumber(signature?.clubCountMin) ?? 0;
  const sameNationMax = toNumber(signature?.sameNationMax);
  const chemistryTarget = toNumber(signature?.totalChemistryTarget) ?? 0;
  if (!signature?.isCompositionPuzzle) return null;
  if (squadSize !== 11) return null;
  if (chemistryTarget < 31 || minLeagues < 4 || minClubs < 5) return null;
  if (sameNationMax != null && sameNationMax > 4) return null;

  const slotList = normalizeSlotsForChemistry(context?.squadSlots || [], squadSize);
  if (slotList.length < squadSize) return null;
  const slotPositions = new Set(
    slotList
      .map((slot) => slot?.positionName ?? slot?.position ?? null)
      .filter(Boolean)
      .map(String),
  );
  const playablePositions = (player) => {
    const alt = Array.isArray(player?.alternativePositionNames)
      ? player.alternativePositionNames
      : [];
    if (alt.length) return alt.map(String);
    return player?.preferredPositionName == null
      ? []
      : [String(player.preferredPositionName)];
  };
  const isGoldPlayer = (player) => getPlayerQuality(player?.rating) === "gold";
  const uniqueDefinitionPlayers = (list) => {
    const sorted = (list || [])
      .filter((player) => player?.id != null)
      .slice()
      .sort((a, b) => {
        const goldDiff = (isGoldPlayer(b) ? 1 : 0) - (isGoldPlayer(a) ? 1 : 0);
        if (goldDiff !== 0) return goldDiff;
        return (toNumber(a?.rating) ?? 0) - (toNumber(b?.rating) ?? 0);
      });
    const seen = new Set();
    const out = [];
    for (const player of sorted) {
      const key = String(getDefinitionKey(player) ?? player.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(player);
    }
    return out;
  };
  const chooseCombos = (list, size, limit) => {
    const out = [];
    const source = list.slice(0, Math.max(size, 20));
    const walk = (start, acc) => {
      if (out.length >= limit) return;
      if (acc.length === size) {
        out.push(acc.slice());
        return;
      }
      for (let i = start; i <= source.length - (size - acc.length); i += 1) {
        acc.push(source[i]);
        walk(i + 1, acc);
        acc.pop();
      }
    };
    walk(0, []);
    return out;
  };
  const groupScore = (list) => {
    const positions = new Set();
    for (const player of list || []) {
      for (const position of playablePositions(player)) {
        if (slotPositions.has(position)) positions.add(position);
      }
    }
    const nations = buildCountsMap(list || [], "nationId");
    const nationScore = Array.from(nations.values()).reduce(
      (sum, count) => sum + count * count,
      0,
    );
    return (
      positions.size * 600 +
      (list || []).filter(isGoldPlayer).length * 1800 +
      nationScore * 180 -
      (list || []).reduce((sum, player) => sum + (toNumber(player?.rating) ?? 0), 0)
    );
  };
  const byClub = new Map();
  for (const player of players || []) {
    if (!player || player.leagueId == null || player.teamId == null) continue;
    if (getPlayerQuality(player?.rating) === "bronze") continue;
    const key = `${player.leagueId}|${player.teamId}`;
    if (!byClub.has(key)) byClub.set(key, []);
    byClub.get(key).push(player);
  }

  const pairsByLeague = new Map();
  const singlesByLeague = new Map();
  const trios = [];
  for (const [key, rawList] of byClub.entries()) {
    const [leagueId, teamId] = key.split("|");
    const list = uniqueDefinitionPlayers(rawList);
    for (const player of list) {
      if (!singlesByLeague.has(leagueId)) singlesByLeague.set(leagueId, []);
      singlesByLeague.get(leagueId).push({
        leagueId,
        teamId,
        players: [player],
        score: groupScore([player]),
      });
    }
    if (list.length >= 2) {
      const pairs = chooseCombos(list, 2, 80)
        .map((combo) => ({
          leagueId,
          teamId,
          players: combo,
          score: groupScore(combo),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      if (!pairsByLeague.has(leagueId)) pairsByLeague.set(leagueId, []);
      pairsByLeague.get(leagueId).push(...pairs);
    }
    if (list.length >= 3) {
      trios.push(
        ...chooseCombos(list, 3, 160)
          .map((combo) => ({
            leagueId,
            teamId,
            players: combo,
            score: groupScore(combo),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 12),
      );
    }
  }
  for (const list of pairsByLeague.values()) list.sort((a, b) => b.score - a.score);
  for (const list of singlesByLeague.values()) list.sort((a, b) => b.score - a.score);
  trios.sort((a, b) => b.score - a.score);

  const league4Groups = [];
  for (const [leagueId, pairs] of pairsByLeague.entries()) {
    const limited = pairs.slice(0, 80);
    for (let i = 0; i < limited.length; i += 1) {
      for (let j = i + 1; j < limited.length; j += 1) {
        if (limited[i].teamId === limited[j].teamId) continue;
        const groupPlayers = limited[i].players.concat(limited[j].players);
        const defs = new Set(
          groupPlayers.map((player) => String(getDefinitionKey(player) ?? player.id)),
        );
        if (defs.size !== groupPlayers.length) continue;
        league4Groups.push({
          leagueId,
          teamIds: [limited[i].teamId, limited[j].teamId],
          players: groupPlayers,
          score: limited[i].score + limited[j].score,
        });
      }
    }
  }
  league4Groups.sort((a, b) => b.score - a.score);

  const validTemplate = (squad) => {
    if (!Array.isArray(squad) || squad.length !== 11) return false;
    if (new Set(squad.map((player) => String(player.id))).size !== 11) return false;
    if (
      new Set(squad.map((player) => String(getDefinitionKey(player) ?? player.id))).size !==
      11
    ) {
      return false;
    }
    if (buildCountsMap(squad, "leagueId").size < minLeagues) return false;
    if (buildCountsMap(squad, "teamId").size < minClubs) return false;
    if (squad.filter(isGoldPlayer).length < 9) return false;
    const nationCounts = buildCountsMap(squad, "nationId");
    for (const count of nationCounts.values()) {
      if (sameNationMax != null && count > sameNationMax) return false;
      if (count < 2) return false;
    }
    return true;
  };

  let best = null;
  const remember = (groups) => {
    const squad = groups.flatMap((group) => group.players);
    if (!validTemplate(squad)) return false;
    const chem = computeChemistryEval(squad, slotList, squadSize);
    const score =
      (toNumber(chem?.totalChem) ?? 0) * 1000000 +
      (toNumber(chem?.minChem) ?? 0) * 10000 -
      squad.reduce((sum, player) => sum + (toNumber(player?.rating) ?? 0), 0);
    if (!best || score > best.score) {
      best = { groups, squad, chem, score };
    }
    return (toNumber(chem?.totalChem) ?? 0) >= chemistryTarget;
  };

  const topLeague4 = league4Groups.slice(0, 220);
  const topTrios = trios.slice(0, 500);
  for (const league4 of topLeague4) {
    for (let i = 0; i < topTrios.length; i += 1) {
      const trioA = topTrios[i];
      if (trioA.leagueId === league4.leagueId) continue;
      for (let j = i + 1; j < topTrios.length; j += 1) {
        const trioB = topTrios[j];
        if (
          trioB.leagueId === league4.leagueId ||
          trioB.leagueId === trioA.leagueId
        ) {
          continue;
        }
        const partial = [league4, trioA, trioB];
        const partialSquad = partial.flatMap((group) => group.players);
        if (
          new Set(
            partialSquad.map((player) => String(getDefinitionKey(player) ?? player.id)),
          ).size !== partialSquad.length
        ) {
          continue;
        }
        if (partialSquad.filter(isGoldPlayer).length < 8) continue;
        const partialNationCounts = buildCountsMap(partialSquad, "nationId");
        const maxPartialNation = Math.max(0, ...partialNationCounts.values());
        if (sameNationMax != null && maxPartialNation > sameNationMax) continue;
        const usedLeagues = new Set([league4.leagueId, trioA.leagueId, trioB.leagueId]);
        for (const [singleLeague, singles] of singlesByLeague.entries()) {
          if (usedLeagues.has(singleLeague)) continue;
          for (const single of singles.slice(0, 30)) {
            if (remember(partial.concat(single))) {
              const playerIds = best.squad.map((player) => String(player.id));
              const key = `spread_topology_4_3_3_1:${playerIds.join(".")}`;
              const preferred = new Set(playerIds);
              return createSeedDescriptor({
                key,
                type: "spread_topology_4_3_3_1",
                label: "Spread count 4/3/3/1 topology",
                family: "spread_cluster",
                reason: "very_high_chem_league_club_spread",
                tier: 2,
                prefillPlayerIds: playerIds,
                poolBias: (player) => (preferred.has(String(player?.id)) ? -1200 : 0),
              });
            }
          }
      }
    }
  }
  }
  return null;
};

const createHighChemClubCoreSeeds = ({
  shape,
  signature,
  players,
  squadSize,
  rules,
}) => {
  if (!shape?.enabled || !shape?.isHighChem) return [];
  if (shape.hasSpreadPressure && shape.route !== "club_core") return [];
  const seeds = [];
  const leagueIds = getTopGroupIdsForAttr(
    players,
    "leagueId",
    signature,
    squadSize,
    2,
    [],
  );
  for (const leagueId of leagueIds) {
    const clubIds = getTopClusterClubIds(players, "leagueId", leagueId, 3, {
      preferLowerRating: !shape.hasRatingPressure,
    });
    if (!clubIds.length) continue;
    const clubSet = new Set(clubIds.map((id) => String(toNumber(id) ?? id)));
    const leagueKey = String(toNumber(leagueId) ?? leagueId);
    seeds.push(
      createSeedDescriptor({
        key: `club_core:l=${leagueKey}:c=${Array.from(clubSet).join(".")}`,
        type: "club_core",
        axis: "league",
        groupId: leagueId,
        label: `Club core league ${leagueId}`,
        family: "same_league_club_core",
        reason: "high_chem_low_spread_pressure",
        strength: 5,
        tier: 1,
        poolBias: (player) => {
          if (!player) return 0;
          let score = 0;
          if (String(player?.leagueId ?? "") === String(leagueId)) score -= 320;
          if (clubSet.has(String(toNumber(player?.teamId) ?? player?.teamId))) {
            score -= 720;
          }
          return score;
        },
        prefillGroups:
          clubIds.length >= 2
            ? clubIds.slice(0, 2).map((clubId) => ({
                attr: "teamId",
                value: clubId,
                count: 2,
              }))
            : null,
      }),
    );
  }
  return dedupeSeeds(seeds).slice(0, rules ? 2 : 1);
};

const createHighChemCrossLeagueNationSeeds = ({
  shape,
  signature,
  players,
  squadSize,
}) => {
  if (!shape?.enabled || !shape?.isHighChem) return [];
  if (!shape.hasLeagueSpread && shape.route !== "cross_league") return [];
  if ((toNumber(shape?.nationMin) ?? 0) >= 5) return [];
  const nationIds = getTopGroupIdsForAttr(
    players,
    "nationId",
    signature,
    squadSize,
    3,
    [],
  );
  const seeds = [];
  for (const nationId of nationIds) {
    const nationKey = String(toNumber(nationId) ?? nationId);
    const clubCluster = getTopClusterClubIds(players, "nationId", nationId, 3, {
      preferLowerRating: !shape.hasRatingPressure,
    })
      .map((id) => String(toNumber(id) ?? id));
    seeds.push(
      createSeedDescriptor({
        key: `cross_league_nation:n=${nationKey}`,
        type: "cross_league_nation",
        axis: "nation",
        groupId: nationId,
        label: `Cross-league nation ${nationId}`,
        family: "same_nation_cross_league",
        reason: "high_chem_league_spread_pressure",
        strength: 5,
        tier: 1,
        poolBias: (player) => {
          if (!player) return 0;
          let score = 0;
          if (String(player?.nationId ?? "") === String(nationId)) score -= 620;
          if (clubCluster.includes(String(toNumber(player?.teamId) ?? player?.teamId))) {
            score -= 260;
          }
          return score;
        },
        prefillGroups: [
          {
            attr: "nationId",
            value: nationId,
            count: Math.min(
              squadSize,
              Math.max(3, Math.min(6, Math.ceil((squadSize || 11) / 2))),
            ),
          },
        ],
      }),
    );
  }
  return dedupeSeeds(seeds).slice(0, 2);
};

const buildHighChemSeedPlan = ({
  shape,
  signature,
  failures = [],
  players,
  squadSize,
  context,
  rules,
  phase = "baseline",
}) => {
  if (!shape?.enabled || !shape?.isHighChem) return [];
  const seeds = [];
  const push = (seed) => {
    if (!seed) return;
    seeds.push(seed);
  };

  if (shape.route === "spread_cluster") {
    push(
      createHighChemSpreadClusterSeed({
        signature,
        players,
        squadSize,
        context,
      }),
    );
  }

  if (shape.route === "club_core") {
    for (const seed of createHighChemClubCoreSeeds({
      shape,
      signature,
      players,
      squadSize,
      rules,
    })) {
      push(seed);
    }
  }

  if (shape.route === "cross_league" || shape.hasLeagueSpread) {
    for (const seed of createHighChemCrossLeagueNationSeeds({
      shape,
      signature,
      players,
      squadSize,
    })) {
      push(seed);
    }
  }

  if (shape.hasLeagueSpread) {
    for (const seed of createLeagueSpreadTemplateSeeds({
      signature,
      failures,
      players,
      squadSize,
    })) {
      push(seed);
    }
  }

  return dedupeSeeds(seeds).slice(0, phase === "rescue" ? 6 : 4);
};

const getHighChemRescueReason = (shape, failures = []) => {
  if (!shape?.enabled) return null;
  const best = (failures || []).slice().sort(compareFailureSummaries)[0] ?? null;
  if (!best) return "no_failure_memory";
  const failingTypes = Array.isArray(best?.failingTypes)
    ? best.failingTypes
    : [];
  const onlyChemistry =
    failingTypes.length > 0 &&
    failingTypes.every(
      (type) =>
        type === "chemistry_points" ||
        type === "all_players_chemistry_points",
    );
  if (onlyChemistry && (toNumber(best?.chemShortfall) ?? Infinity) <= 2) {
    return "chem_shortfall_near_target";
  }
  if (
    failingTypes.includes("league_count") ||
    failingTypes.includes("club_count") ||
    failingTypes.includes("nation_count")
  ) {
    return "spread_requirement_failed";
  }
  if (
    failingTypes.includes("same_league_count") ||
    failingTypes.includes("same_club_count") ||
    failingTypes.includes("same_nation_count")
  ) {
    return "identity_cap_failed";
  }
  if (failingTypes.includes("team_rating")) return "rating_after_chem_failed";
  return "generic_high_chem_rescue";
};

const createHybridClusterSeed = ({
  failures,
  players,
  index,
  tier = 1,
}) => {
  const sourceFailures = (failures || []).filter(Boolean);
  const leagueIds = new Set();
  const nationIds = new Set();
  const clubIds = new Set();

  for (const failure of sourceFailures) {
    const leagueId = toNumber(failure?.dominantLeague);
    const nationId = toNumber(failure?.dominantNation);
    const clubId = toNumber(failure?.dominantClub);
    if (leagueId != null) leagueIds.add(leagueId);
    if (nationId != null) nationIds.add(nationId);
    if (clubId != null) clubIds.add(clubId);
    for (const id of getTopClusterClubIds(players, "leagueId", leagueId, 2)) {
      const numeric = toNumber(id);
      if (numeric != null) clubIds.add(numeric);
    }
    for (const id of getTopClusterClubIds(players, "nationId", nationId, 2)) {
      const numeric = toNumber(id);
      if (numeric != null) clubIds.add(numeric);
    }
  }

  if (leagueIds.size + nationIds.size + clubIds.size < 2) return null;
  const leagueKey = Array.from(leagueIds).sort((a, b) => a - b);
  const nationKey = Array.from(nationIds).sort((a, b) => a - b);
  const clubKey = Array.from(clubIds).sort((a, b) => a - b);
  const key = `hybrid:${tier}:${index}:l=${leagueKey.join(".")}:n=${nationKey.join(".")}:c=${clubKey.join(".")}`;

  return createSeedDescriptor({
    key,
    type: "hybrid_cluster",
    label: `Hybrid cluster ${index}`,
    tier,
    poolFilter: (player) => {
      if (!player) return false;
      return (
        clubIds.has(toNumber(player.teamId)) ||
        leagueIds.has(toNumber(player.leagueId)) ||
        nationIds.has(toNumber(player.nationId))
      );
    },
    poolBias: (player) => {
      if (!player) return 0;
      let score = 0;
      const inClub = clubIds.has(toNumber(player.teamId));
      const inLeague = leagueIds.has(toNumber(player.leagueId));
      const inNation = nationIds.has(toNumber(player.nationId));
      if (inClub) score -= 900;
      if (inLeague) score -= 260;
      if (inNation) score -= 260;
      if (inClub && (inLeague || inNation)) score -= 180;
      if (inLeague && inNation) score -= 120;
      return score;
    },
  });
};

const generateRescueSeeds = (
  signature,
  failureMemory,
  players,
  squadSize,
  context,
  triedSeedKeys = new Set(),
) => {
  const sortedFailures = (failureMemory || []).slice().sort(compareFailureSummaries);
  const bestFailure = sortedFailures[0] ?? null;
  if (!bestFailure) return { tier1: [], tier3: [] };
  const tier1 = [];
  const tier3 = [];
  const queuedSeedKeys = new Set();
  const pushSeed = (list, seed) => {
    if (!seed) return;
    const key = buildSeedKey(seed);
    if (triedSeedKeys.has(key)) return;
    if (queuedSeedKeys.has(key)) return;
    queuedSeedKeys.add(key);
    list.push(seed);
  };
  const usefulFailures = sortedFailures.slice(0, 4);
  const highChemShape = classifyHighChemShape(
    signature,
    [],
    squadSize,
    context,
  );
  for (const seed of buildHighChemSeedPlan({
    shape: highChemShape,
    signature,
    failures: usefulFailures,
    players,
    squadSize,
    context,
    phase: "rescue",
  })) {
    pushSeed(tier1, seed);
  }
  for (const failure of usefulFailures) {
    if (
      failure.dominantLeague != null &&
      toNumber(failure.dominantLeagueCount) >=
        Math.max(3, Math.floor((squadSize || 11) / 3))
    ) {
      pushSeed(
        tier1,
        createSeedDescriptor({
          type: "rescue_full_dominant_league",
          axis: "league",
          groupId: failure.dominantLeague,
          label: `Rescue league ${failure.dominantLeague}`,
          strength: 6,
          tier: 1,
        }),
      );
      pushSeed(
        tier3,
        createSeedDescriptor({
          type: "rescue_full_dominant_league",
          axis: "league",
          groupId: failure.dominantLeague,
          label: `Rescue hard league ${failure.dominantLeague}`,
          strength: 7,
          tier: 3,
          poolFilter: (player) =>
            String(player?.leagueId ?? "") === String(failure.dominantLeague),
        }),
      );
    }
    if (
      failure.dominantNation != null &&
      toNumber(failure.dominantNationCount) >=
        Math.max(3, Math.floor((squadSize || 11) / 3))
    ) {
      pushSeed(
        tier1,
        createSeedDescriptor({
          type: "rescue_full_dominant_nation",
          axis: "nation",
          groupId: failure.dominantNation,
          label: `Rescue nation ${failure.dominantNation}`,
          strength: 6,
          tier: 1,
        }),
      );
    }
  }
  const nearChemistryFailures = sortedFailures.filter((failure) => {
    const shortfall = toNumber(failure?.chemShortfall);
    if (shortfall == null || shortfall <= 0 || shortfall > 4) return false;
    const failingTypes = Array.isArray(failure?.failingTypes)
      ? failure.failingTypes
      : [];
    return (
      failingTypes.length > 0 &&
      failingTypes.every(
        (type) =>
          type === "chemistry_points" ||
          type === "all_players_chemistry_points",
      )
    );
  });
  if (signature?.isCompositionPuzzle && nearChemistryFailures.length >= 2) {
    let hybridIndex = 0;
    for (let i = 0; i < Math.min(nearChemistryFailures.length, 4); i += 1) {
      for (
        let j = i + 1;
        j < Math.min(nearChemistryFailures.length, 4);
        j += 1
      ) {
        const seed = createHybridClusterSeed({
          failures: [nearChemistryFailures[i], nearChemistryFailures[j]],
          players,
          index: hybridIndex,
          tier: 2,
        });
        hybridIndex += 1;
        pushSeed(tier1, seed);
        if (hybridIndex >= 4) break;
      }
      if (hybridIndex >= 4) break;
    }
  }
  for (const seed of createLeagueSpreadTemplateSeeds({
    signature,
    failures: usefulFailures,
    players,
    squadSize,
  })) {
    pushSeed(tier1, seed);
  }
  for (const groupId of signature?.requiredLeagueIds || []) {
    pushSeed(
      tier1,
      createSeedDescriptor({
        type: "rescue_required_identity_not_tried",
        axis: "league",
        groupId,
        label: `Rescue required league ${groupId}`,
        strength: 6,
        tier: 1,
      }),
    );
  }
  return { tier1: dedupeSeeds(tier1), tier3: dedupeSeeds(tier3) };
};

const compareSolverResult = (validSquad, solverResult) => ({
  chemistryDelta:
    (toNumber(computeChemistryEval(validSquad || [], [], validSquad?.length ?? 0)?.totalChem) ?? 0) -
    (toNumber(solverResult?.stats?.chemistry?.totalChem) ?? 0),
  ratingDelta:
    (toNumber(getSquadRating(validSquad || [])) ?? 0) -
    (toNumber(solverResult?.stats?.squadRating) ?? 0),
  validSnapshot: buildCompositionSnapshot(validSquad || []),
  solverSnapshot: solverResult?.compositionSnapshot ?? null,
  failingRequirements: solverResult?.failingRequirements ?? [],
});

const summarizeScopeSettings = (filters = {}) => ({
  ratingMin: toNumber(filters?.ratingMin) ?? null,
  ratingMax: toNumber(filters?.ratingMax) ?? null,
  allowedCardBuckets: normalizeAllowedCardBuckets(
    filters?.allowedCardBuckets,
    CARD_BUCKETS,
  ),
  excludeSpecial: toBooleanSetting(filters?.excludeSpecial, false),
  useTotwPlayers: toBooleanSetting(filters?.useTotwPlayers, true),
  useEvolutionPlayers: toBooleanSetting(filters?.useEvolutionPlayers, false),
  allowConceptPlayers: toBooleanSetting(filters?.allowConceptPlayers, false),
  onlyStorage: toBooleanSetting(filters?.onlyStorage, false),
  onlyUntradeables: toBooleanSetting(filters?.onlyUntradeables, false),
  onlyDuplicates: toBooleanSetting(filters?.onlyDuplicates, false),
  useUnassigned: toBooleanSetting(filters?.useUnassigned, false),
  excludedLeagueIds: Array.isArray(filters?.excludedLeagueIds)
    ? filters.excludedLeagueIds.slice()
    : [],
  excludedNationIds: Array.isArray(filters?.excludedNationIds)
    ? filters.excludedNationIds.slice()
    : [],
  excludedPlayerIds: Array.isArray(filters?.excludedPlayerIds)
    ? filters.excludedPlayerIds.slice()
    : [],
});

const summarizeScopeSignature = (signature = {}) => ({
  hasChemistry: Boolean(signature?.hasChemistry),
  totalChemistryTarget: signature?.totalChemistryTarget ?? null,
  minPlayerChemistryTarget: signature?.minPlayerChemistryTarget ?? null,
  ratingTarget: signature?.ratingTarget ?? null,
  nationCountMin: signature?.nationCountMin ?? null,
  nationCountMax: signature?.nationCountMax ?? null,
  leagueCountMin: signature?.leagueCountMin ?? null,
  leagueCountMax: signature?.leagueCountMax ?? null,
  clubCountMin: signature?.clubCountMin ?? null,
  clubCountMax: signature?.clubCountMax ?? null,
  sameLeagueMin: signature?.sameLeagueMin ?? null,
  sameNationMin: signature?.sameNationMin ?? null,
  sameClubMin: signature?.sameClubMin ?? null,
  sameLeagueMax: signature?.sameLeagueMax ?? null,
  sameNationMax: signature?.sameNationMax ?? null,
  sameClubMax: signature?.sameClubMax ?? null,
  requiredLeagueIds: Array.isArray(signature?.requiredLeagueIds)
    ? signature.requiredLeagueIds.slice()
    : [],
  requiredNationIds: Array.isArray(signature?.requiredNationIds)
    ? signature.requiredNationIds.slice()
    : [],
  requiredClubIds: Array.isArray(signature?.requiredClubIds)
    ? signature.requiredClubIds.slice()
    : [],
  requiredLeagueTarget: signature?.requiredLeagueTarget ?? null,
  requiredNationTarget: signature?.requiredNationTarget ?? null,
  requiredClubTarget: signature?.requiredClubTarget ?? null,
  hasRareRequirement: Boolean(signature?.hasRareRequirement),
  rareTarget: signature?.rareTarget ?? null,
  hasInformRequirement: Boolean(signature?.hasInformRequirement),
  dominantAxes: Array.isArray(signature?.dominantAxes)
    ? signature.dominantAxes.slice()
    : [],
});

const getChallengeShape = (signature, failingTypes = []) => {
  const shapes = new Set();
  const failing = new Set(failingTypes || []);
  if (signature?.ratingTarget != null || failing.has("team_rating")) {
    shapes.add("rating");
  }
  if (signature?.hasChemistry || failing.has("chemistry_points")) {
    shapes.add("chemistry");
  }
  if (
    signature?.nationCountMin != null ||
    signature?.nationCountMax != null ||
    signature?.leagueCountMin != null ||
    signature?.leagueCountMax != null ||
    signature?.clubCountMin != null ||
    signature?.clubCountMax != null ||
    failing.has("nation_count") ||
    failing.has("league_count") ||
    failing.has("club_count")
  ) {
    shapes.add("composition");
  }
  if (
    signature?.requiredLeagueIds?.length ||
    signature?.requiredNationIds?.length ||
    signature?.requiredClubIds?.length ||
    failing.has("league_id") ||
    failing.has("nation_id") ||
    failing.has("club_id")
  ) {
    shapes.add("identity");
  }
  if (failing.has("player_level") || failing.has("player_quality")) {
    shapes.add("quality");
  }
  if (
    signature?.hasRareRequirement ||
    signature?.hasInformRequirement ||
    failing.has("player_rarity") ||
    failing.has("player_rarity_group") ||
    failing.has("player_totw_or_tots") ||
    failing.has("player_tots") ||
    failing.has("player_inform") ||
    failing.has("player_rarity_or_totw")
  ) {
    shapes.add("special_or_rarity");
  }
  if (!shapes.size) return "baseline";
  return shapes.size === 1 ? Array.from(shapes)[0] : "mixed";
};

const getScopeFailureShape = (shortcomings = [], solved = false) => {
  if (solved) return null;
  const reasons = new Set(
    (shortcomings || []).map((entry) => entry?.reason).filter(Boolean),
  );
  if (Array.from(reasons).some((reason) => reason?.includes("settings"))) {
    return "settings_conflict";
  }
  if (reasons.has("pool_exhaustion")) return "pool_exhaustion";
  if (reasons.has("rating_shortfall")) return "rating_shortfall";
  if (reasons.has("chemistry_shortfall")) return "chemistry_shortfall";
  if (Array.from(reasons).some((reason) => reason?.includes("identity"))) {
    return "identity_shortfall";
  }
  if (Array.from(reasons).some((reason) => reason?.includes("quality"))) {
    return "quality/card-type_shortfall";
  }
  if (Array.from(reasons).some((reason) => reason?.includes("rarity"))) {
    return "rarity_shortfall";
  }
  return shortcomings?.length ? "unsatisfied_requirements" : "unknown";
};

const summarizeScopeFailingRequirement = (entry) => ({
  type: normalizeRequirementType(entry),
  label: entry?.label ?? entry?.raw?.label ?? null,
  required: entry?.required ?? entry?.target ?? entry?.count ?? null,
  actual: entry?.actual ?? entry?.current ?? entry?.value ?? null,
});

const buildScopeWeakSlots = (squad, slots, chemistry, squadSize) => {
  const list = Array.isArray(squad) ? squad : [];
  const n = Math.min(toNumber(squadSize) ?? list.length, list.length);
  const perSlotChem = Array.isArray(chemistry?.perSlotChem)
    ? chemistry.perSlotChem
    : [];
  const onPosition = Array.isArray(chemistry?.onPosition)
    ? chemistry.onPosition
    : [];
  const slotList = Array.isArray(slots) ? slots : [];
  return list
    .slice(0, n)
    .map((player, index) => ({
      index,
      slotIndex: slotList[index]?.slotIndex ?? null,
      position:
        slotList[index]?.positionName ??
        slotList[index]?.position ??
        player?.preferredPositionName ??
        player?.preferredPositionId ??
        null,
      playerId: player?.id ?? null,
      rating: toNumber(player?.rating) ?? null,
      chemistry: toNumber(perSlotChem[index]) ?? null,
      onPosition:
        onPosition[index] == null ? null : Boolean(onPosition[index]),
      leagueId: player?.leagueId ?? null,
      nationId: player?.nationId ?? null,
      teamId: player?.teamId ?? null,
      cardBucket: getBaseCardBucket(player),
      isSpecial: Boolean(player?.isSpecial),
    }))
    .filter((slot) => slot.chemistry == null || slot.chemistry < 3 || !slot.onPosition)
    .sort((a, b) => {
      const chemA = toNumber(a.chemistry) ?? 99;
      const chemB = toNumber(b.chemistry) ?? 99;
      if (chemA !== chemB) return chemA - chemB;
      return Number(a.onPosition === true) - Number(b.onPosition === true);
    })
    .slice(0, 5);
};

const getSnapshotAxisCount = (snapshot, axis, id) => {
  if (id == null) return 0;
  const key = String(id);
  if (axis === "league") {
    return toNumber(snapshot?.leagueCounts?.[key]) ?? 0;
  }
  if (axis === "nation") {
    return toNumber(snapshot?.nationCounts?.[key]) ?? 0;
  }
  if (axis === "club") {
    return toNumber(snapshot?.clubCounts?.[key]) ?? 0;
  }
  return 0;
};

const getSameAxisMax = (signature, axis) => {
  if (axis === "league") return toNumber(signature?.sameLeagueMax);
  if (axis === "nation") return toNumber(signature?.sameNationMax);
  if (axis === "club") return toNumber(signature?.sameClubMax);
  return null;
};

const getSameAxisMin = (signature, axis) => {
  if (axis === "league") return toNumber(signature?.sameLeagueMin);
  if (axis === "nation") return toNumber(signature?.sameNationMin);
  if (axis === "club") return toNumber(signature?.sameClubMin);
  return null;
};

const getUniqueAxisMax = (signature, axis) => {
  if (axis === "league") return toNumber(signature?.leagueCountMax);
  if (axis === "nation") return toNumber(signature?.nationCountMax);
  if (axis === "club") return toNumber(signature?.clubCountMax);
  return null;
};

const getSnapshotUniqueAxisCount = (snapshot, axis) => {
  if (axis === "league") return toNumber(snapshot?.uniqueLeagues) ?? 0;
  if (axis === "nation") return toNumber(snapshot?.uniqueNations) ?? 0;
  if (axis === "club") return toNumber(snapshot?.uniqueClubs) ?? 0;
  return 0;
};

const getSnapshotAxisIds = (snapshot, axis) => {
  const counts =
    axis === "league"
      ? snapshot?.leagueCounts
      : axis === "nation"
        ? snapshot?.nationCounts
        : axis === "club"
          ? snapshot?.clubCounts
          : null;
  return Object.keys(counts || {})
    .map((id) => toNumber(id))
    .filter((id) => id != null)
    .sort((a, b) => a - b);
};

const getSlotAxisId = (slot, axis) => {
  if (axis === "league") return slot?.leagueId ?? null;
  if (axis === "nation") return slot?.nationId ?? null;
  if (axis === "club") return slot?.teamId ?? null;
  return null;
};

const buildScopeAxisPreference = (axis, id, slot, snapshot, signature) => {
  const entry = { axis, id };
  if (signature?.dominantAxes?.includes?.(axis)) {
    entry.priority = "primary";
    entry.reason =
      getSameAxisMin(signature, axis) != null
        ? `same_${axis}_min`
        : "dominant_axis";
  }
  const max = getSameAxisMax(signature, axis);
  if (max != null) {
    const current = getSnapshotAxisCount(snapshot, axis, id);
    const slotAxisId = getSlotAxisId(slot, axis);
    if (current >= max && String(slotAxisId) !== String(id)) {
      entry.status = "capped";
      entry.current = current;
      entry.max = max;
    }
  }
  return entry;
};

const sortScopeAxisPreferences = (entries) =>
  entries.slice().sort((a, b) => {
    const priorityScore = (entry) => (entry?.priority === "primary" ? 0 : 1);
    const byPriority = priorityScore(a) - priorityScore(b);
    if (byPriority !== 0) return byPriority;
    const axisOrder = { league: 0, nation: 1, club: 2 };
    return (axisOrder[a?.axis] ?? 99) - (axisOrder[b?.axis] ?? 99);
  });

const getRequiredAxisConfig = (signature, axis) => {
  if (axis === "league") {
    return {
      ids: signature?.requiredLeagueIds || [],
      target: signature?.requiredLeagueTarget,
      reason: "required_league",
    };
  }
  if (axis === "nation") {
    return {
      ids: signature?.requiredNationIds || [],
      target: signature?.requiredNationTarget,
      reason: "required_nation",
    };
  }
  if (axis === "club") {
    return {
      ids: signature?.requiredClubIds || [],
      target: signature?.requiredClubTarget,
      reason: "required_club",
    };
  }
  return { ids: [], target: null, reason: null };
};

const buildScopePreserveAxes = (slot, snapshot, signature) => {
  const preserve = [];
  for (const axis of ["league", "nation", "club"]) {
    const { ids, target, reason } = getRequiredAxisConfig(signature, axis);
    const id = getSlotAxisId(slot, axis);
    if (id == null) continue;
    if (ids?.includes?.(id)) {
      const requiredTarget = Math.max(toNumber(target) ?? 1, 1);
      const current = ids.reduce(
        (sum, nextId) => sum + getSnapshotAxisCount(snapshot, axis, nextId),
        0,
      );
      if (current <= requiredTarget) {
        preserve.push({ axis, id, reason, current, target: requiredTarget });
      }
    }
    const sameAxisMin = getSameAxisMin(signature, axis);
    const slotAxisCount = getSnapshotAxisCount(snapshot, axis, id);
    if (
      sameAxisMin != null &&
      slotAxisCount >= sameAxisMin &&
      slotAxisCount <= sameAxisMin
    ) {
      preserve.push({
        axis,
        id,
        reason: `same_${axis}_min`,
        current: slotAxisCount,
        target: sameAxisMin,
      });
    }
  }
  return preserve;
};

const buildScopeLocks = (snapshot, signature) => {
  const locks = [];
  for (const axis of ["league", "nation", "club"]) {
    const max = getUniqueAxisMax(signature, axis);
    if (max == null) continue;
    const current = getSnapshotUniqueAxisCount(snapshot, axis);
    if (current >= max) {
      locks.push({
        axis,
        reason: "unique_axis_max",
        current,
        max,
        allowedIds: getSnapshotAxisIds(snapshot, axis),
      });
    }
  }
  return locks;
};

const buildRequiredScopeRequirement = (axis, snapshot, signature) => {
  const { ids, target, reason } = getRequiredAxisConfig(signature, axis);
  if (!ids?.length) return null;
  const requiredTarget = Math.max(toNumber(target) ?? 1, 1);
  const satisfiedBy = ids
    .map((id) => ({ id, count: getSnapshotAxisCount(snapshot, axis, id) }))
    .filter((entry) => entry.count > 0);
  const current = satisfiedBy.reduce((sum, entry) => sum + entry.count, 0);
  return {
    axis,
    rule: reason,
    ids: ids.slice(),
    target: requiredTarget,
    current,
    status: current >= requiredTarget ? "satisfied" : "unsatisfied",
    margin: current - requiredTarget,
    satisfiedBy,
  };
};

const buildSameAxisScopeRequirement = (axis, snapshot, signature) => {
  const target = getSameAxisMin(signature, axis);
  if (target == null) return null;
  const counts =
    axis === "league"
      ? snapshot?.leagueCounts
      : axis === "nation"
        ? snapshot?.nationCounts
        : axis === "club"
          ? snapshot?.clubCounts
          : null;
  const satisfiedBy = Object.entries(counts || {})
    .map(([id, count]) => ({ id: toNumber(id), count: toNumber(count) ?? 0 }))
    .filter((entry) => entry.id != null && entry.count >= target)
    .sort((a, b) => b.count - a.count || a.id - b.id);
  const current = satisfiedBy[0]?.count ?? 0;
  return {
    axis,
    rule: `same_${axis}_min`,
    ids: satisfiedBy.map((entry) => entry.id),
    target,
    current,
    status: current >= target ? "satisfied" : "unsatisfied",
    margin: current - target,
    satisfiedBy,
  };
};

const buildScopeRequirements = (snapshot, signature) =>
  [
    ...["league", "nation", "club"].map((axis) =>
      buildRequiredScopeRequirement(axis, snapshot, signature),
    ),
    ...["league", "nation", "club"].map((axis) =>
      buildSameAxisScopeRequirement(axis, snapshot, signature),
    ),
  ].filter(Boolean);

const buildScopeConstrainedAxes = (axisPreference, scopeLocks) => {
  const preferredByAxis = new Map(
    (axisPreference || [])
      .filter((entry) => entry?.axis)
      .map((entry) => [entry.axis, entry]),
  );
  return (scopeLocks || []).map((lock) => {
    const preferred = preferredByAxis.get(lock.axis);
    return {
      axis: lock.axis,
      reason: lock.reason,
      allowedIds: Array.isArray(lock.allowedIds) ? lock.allowedIds.slice() : [],
      preferredId: preferred?.id ?? null,
      preferredPriority: preferred?.priority ?? null,
    };
  });
};

const QUALITY_RATING_BANDS = {
  bronze: { min: 0, max: 64 },
  silver: { min: 65, max: 74 },
  gold: { min: 75, max: 99 },
};

const getScopeQualityFromRequirement = (entry) => {
  const candidates = [
    ...getRuleValues(entry),
    entry?.quality,
    entry?.value,
    entry?.label,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeString(String(candidate ?? ""));
    if (normalized.includes("bronze")) return "bronze";
    if (normalized.includes("silver")) return "silver";
    if (normalized.includes("gold")) return "gold";
  }
  return null;
};

const getScopeQualityBlockers = (quality, settings) => {
  const blockers = [];
  const band = QUALITY_RATING_BANDS[quality];
  const ratingMin = toNumber(settings?.ratingMin);
  const ratingMax = toNumber(settings?.ratingMax);
  if (band) {
    if (ratingMax != null && ratingMax < band.min) {
      blockers.push(`rating_max_below_${quality}`);
    }
    if (ratingMin != null && ratingMin > band.max) {
      blockers.push(`rating_min_above_${quality}`);
    }
  }
  const allowedBuckets = new Set(settings?.allowedCardBuckets || []);
  if (
    quality &&
    !allowedBuckets.has(`common_${quality}`) &&
    !allowedBuckets.has(`rare_${quality}`)
  ) {
    blockers.push(`${quality}_base_cards_disabled`);
  }
  return blockers;
};

const buildScopeSearchHints = ({
  shortcomings,
  weakSlots,
  snapshot,
  signature,
  stats,
  settings,
  scopeLocks,
}) => {
  const hints = [];
  const allowedBuckets = new Set(settings?.allowedCardBuckets || []);
  const baseCardBlockers = [];
  if (!allowedBuckets.has("common_gold") && !allowedBuckets.has("rare_gold")) {
    baseCardBlockers.push("gold_base_cards_disabled");
  }
  if (
    !allowedBuckets.has("rare_bronze") &&
    !allowedBuckets.has("rare_silver") &&
    !allowedBuckets.has("rare_gold")
  ) {
    baseCardBlockers.push("rare_base_cards_disabled");
  }
  const specialBlockers = settings?.excludeSpecial
    ? ["non_totw_special_cards_disabled"]
    : [];
  const totwTotsBlockers = !settings?.useTotwPlayers
    ? ["totw_tots_disabled"]
    : [];
  const blockersForHint = (requiredAxes = [], options = {}) => {
    if (requiredAxes.includes("player_totw_or_tots")) {
      return [...baseCardBlockers, ...totwTotsBlockers];
    }
    if (options.includeSpecialBlockers) {
      return [...baseCardBlockers, ...specialBlockers, ...totwTotsBlockers];
    }
    return [...baseCardBlockers];
  };

  const ratingTarget = toNumber(signature?.ratingTarget);
  const squadRating = toNumber(stats?.squadRating);
  if (ratingTarget != null && squadRating != null && squadRating < ratingTarget) {
    const requiredAxes = signature?.hasInformRequirement
      ? ["player_totw_or_tots"]
      : [];
    hints.push({
      reason: "rating_shortfall",
      ratingBand: {
        min: Math.max(0, ratingTarget),
        max: Math.min(99, Math.max(ratingTarget + 3, squadRating + 5)),
      },
      requiredAxes,
      blockedBySettings: blockersForHint(requiredAxes, {
        includeSpecialBlockers: !requiredAxes.length,
      }),
    });
  }

  for (const shortcoming of shortcomings || []) {
    if (shortcoming?.reason !== "quality_shortfall") continue;
    const quality = shortcoming?.evidence?.quality ?? null;
    const band = quality ? QUALITY_RATING_BANDS[quality] : null;
    hints.push({
      reason: "quality_shortfall",
      quality,
      missing: shortcoming?.evidence?.missing ?? null,
      ratingBand: band ? { ...band } : null,
      blockedBySettings: getScopeQualityBlockers(quality, settings),
    });
  }

  if (signature?.hasChemistry) {
    for (const slot of weakSlots || []) {
      const axisPreference = [];
      if (snapshot?.dominantLeague != null) {
        axisPreference.push(
          buildScopeAxisPreference(
            "league",
            snapshot.dominantLeague,
            slot,
            snapshot,
            signature,
          ),
        );
      }
      if (snapshot?.dominantNation != null) {
        axisPreference.push(
          buildScopeAxisPreference(
            "nation",
            snapshot.dominantNation,
            slot,
            snapshot,
            signature,
          ),
        );
      }
      if (
        snapshot?.dominantClub != null &&
        (toNumber(snapshot?.dominantClubCount) ?? 0) >= 2
      ) {
        axisPreference.push(
          buildScopeAxisPreference(
            "club",
            snapshot.dominantClub,
            slot,
            snapshot,
            signature,
          ),
        );
      }
      const preserveAxes = buildScopePreserveAxes(slot, snapshot, signature);
      const sortedAxisPreference = sortScopeAxisPreferences(axisPreference);
      hints.push({
        reason: "weak_slot_chemistry",
        slotIndex: slot.slotIndex,
        position: slot.position,
        axisPreference: sortedAxisPreference,
        constrainedAxes: buildScopeConstrainedAxes(
          sortedAxisPreference,
          scopeLocks,
        ),
        preserveAxes,
        ratingBand: {
          min: Math.max(0, (toNumber(slot.rating) ?? 75) - 2),
          max: Math.min(99, (toNumber(slot.rating) ?? 75) + 6),
        },
        blockedBySettings: blockersForHint(),
      });
    }
  }

  for (const shortcoming of shortcomings || []) {
    if (shortcoming?.reason !== "rarity_shortfall") continue;
    hints.push({
      reason: "rarity_shortfall",
      rarity: "rare",
      missing: shortcoming?.evidence?.missing ?? null,
      blockedBySettings: baseCardBlockers.filter(
        (blocker) => blocker === "rare_base_cards_disabled",
      ),
    });
  }
  return hints.slice(0, 8);
};

const buildScopeAnalysis = ({
  context,
  signature,
  failingRequirements,
  squad,
  squadSize,
  chemistry,
  slotsForChemistry,
  stats,
  compositionSnapshot,
  rules,
}) => {
  const failing = Array.isArray(failingRequirements)
    ? failingRequirements.map(summarizeScopeFailingRequirement)
    : [];
  for (const entry of failing) {
    if (entry?.type === "team_rating") {
      entry.required = toNumber(signature?.ratingTarget) ?? entry.required;
      entry.actual = toNumber(stats?.squadRating) ?? entry.actual;
    }
    if (entry?.type === "chemistry_points") {
      entry.required =
        toNumber(signature?.totalChemistryTarget) ?? entry.required;
      entry.actual = toNumber(stats?.chemistry?.totalChem) ?? entry.actual;
    }
    if (entry?.type === "all_players_chemistry_points") {
      entry.required =
        toNumber(signature?.minPlayerChemistryTarget) ?? entry.required;
      entry.actual = toNumber(stats?.chemistry?.minChem) ?? entry.actual;
    }
  }
  const failingTypes = Array.from(
    new Set(failing.map((entry) => entry.type).filter(Boolean)),
  );
  const settings = summarizeScopeSettings(context?.filters || {});
  const signatureSummary = summarizeScopeSignature(signature);
  const snapshot =
    compositionSnapshot || buildCompositionSnapshot(squad || [], squadSize);
  const weakSlots = signature?.hasChemistry
    ? buildScopeWeakSlots(squad, slotsForChemistry, chemistry, squadSize)
    : [];
  const shortcomings = [];
  const reasoning = [];
  const solved = Boolean(stats?.solved);
  const ratingTarget = toNumber(signature?.ratingTarget);
  const squadRating = toNumber(stats?.squadRating);
  if (ratingTarget != null && squadRating != null && squadRating < ratingTarget) {
    const missing = ratingTarget - squadRating;
    shortcomings.push({
      code: `rating_below_target_${missing}`,
      reason: "rating_shortfall",
      evidence: { current: squadRating, target: ratingTarget, missing },
    });
    reasoning.push({
      reason: "rating_shortfall",
      evidence: { current: squadRating, target: ratingTarget },
      affectedSlots: [],
      preferredAxes: [],
    });
  }

  const totalTarget = toNumber(signature?.totalChemistryTarget);
  const totalChem = toNumber(stats?.chemistry?.totalChem);
  if (totalTarget != null && totalChem != null && totalChem < totalTarget) {
    const missing = totalTarget - totalChem;
    const affectedSlots = weakSlots
      .filter((slot) => (toNumber(slot.chemistry) ?? 0) < 3)
      .map((slot) => slot.index);
    shortcomings.push({
      code: `chemistry_missing_${missing}`,
      reason: "chemistry_shortfall",
      evidence: { current: totalChem, target: totalTarget, missing },
    });
    reasoning.push({
      reason: "chemistry_shortfall",
      evidence: { current: totalChem, target: totalTarget },
      affectedSlots,
      preferredAxes: signature?.dominantAxes?.length
        ? signature.dominantAxes.slice()
        : ["league", "nation"],
    });
  }

  if (signature?.hasRareRequirement) {
    const rareTarget = toNumber(signature?.rareTarget);
    const rareCount = toNumber(snapshot?.rareCount);
    if (rareTarget != null && rareCount != null && rareCount < rareTarget) {
      const missing = rareTarget - rareCount;
      shortcomings.push({
        code: `rare_shortfall_${missing}`,
        reason: "rarity_shortfall",
        evidence: { current: rareCount, target: rareTarget, missing },
      });
      reasoning.push({
        reason: "rarity_shortfall",
        evidence: { current: rareCount, target: rareTarget },
        affectedSlots: [],
        preferredAxes: [],
      });
    }
  }

  const filteredPlayerCount = toNumber(stats?.filteredPlayerCount) ?? 0;
  if (filteredPlayerCount < (toNumber(squadSize) ?? 0)) {
    shortcomings.push({
      code: "pool_exhaustion",
      reason: "pool_exhaustion",
      evidence: { filteredPlayerCount, squadSize },
    });
  }

  const allowedBuckets = new Set(settings.allowedCardBuckets || []);
  const hasGoldRule = (rules || []).some((rule) => {
    const type = normalizeRequirementType(rule);
    const label = normalizeString(rule?.label || rule?.raw?.label);
    return type === "player_level" && label?.includes("gold");
  });
  if (
    hasGoldRule &&
    !allowedBuckets.has("common_gold") &&
    !allowedBuckets.has("rare_gold")
  ) {
    shortcomings.push({
      code: "no_allowed_gold_pool",
      reason: "settings_conflict_quality",
      evidence: { allowedCardBuckets: settings.allowedCardBuckets },
    });
  }
  if (
    signature?.hasRareRequirement &&
    !allowedBuckets.has("rare_bronze") &&
    !allowedBuckets.has("rare_silver") &&
    !allowedBuckets.has("rare_gold")
  ) {
    shortcomings.push({
      code: "rare_base_cards_disabled",
      reason: "settings_conflict_rarity",
      evidence: { allowedCardBuckets: settings.allowedCardBuckets },
    });
  }

  for (const entry of failing) {
    if (!entry.type) continue;
    if (entry.type === "team_rating" || entry.type === "chemistry_points") {
      continue;
    }
    const quality =
      entry.type?.includes("level") || entry.type?.includes("quality")
        ? getScopeQualityFromRequirement(entry)
        : null;
    const reason = entry.type?.includes("rarity")
      ? "rarity_shortfall"
      : entry.type?.includes("level") || entry.type?.includes("quality")
        ? "quality_shortfall"
        : entry.type?.includes("club") ||
            entry.type?.includes("league") ||
            entry.type?.includes("nation")
          ? "identity_or_composition_shortfall"
          : "requirement_shortfall";
    const evidence = quality
      ? {
          ...entry,
          quality,
          missing: toNumber(entry?.required) ?? null,
        }
      : entry;
    shortcomings.push({
      code: `${entry.type}_unsatisfied`,
      reason,
      evidence,
    });
    if (quality) {
      const blockers = getScopeQualityBlockers(quality, settings);
      const band = QUALITY_RATING_BANDS[quality];
      for (const blocker of blockers) {
        shortcomings.push({
          code:
            blocker === `rating_max_below_${quality}`
              ? `${quality}_requirement_blocked_by_rating_max`
              : blocker === `rating_min_above_${quality}`
                ? `${quality}_requirement_blocked_by_rating_min`
                : blocker,
          reason: "settings_conflict_quality",
          evidence: {
            quality,
            ratingMin: settings.ratingMin,
            ratingMax: settings.ratingMax,
            ratingBand: band ? { ...band } : null,
            allowedCardBuckets: settings.allowedCardBuckets,
          },
        });
      }
    }
  }

  const challengeShape = getChallengeShape(signature, failingTypes);
  const failureShape = getScopeFailureShape(shortcomings, solved);
  const conceptSearchEligible = !solved && shortcomings.length > 0;
  const scopeLocks = buildScopeLocks(snapshot, signature);
  const scopeRequirements = buildScopeRequirements(snapshot, signature);
  const searchHints = buildScopeSearchHints({
    shortcomings,
    weakSlots,
    snapshot,
    signature,
    stats,
    settings,
    scopeLocks,
  });

  return {
    challengeShape,
    failureShape,
    conceptSearchEligible,
    scopeLocks,
    scopeRequirements,
    inputs: {
      signature: signatureSummary,
      failingTypes,
      failingRequirements: failing,
      pool: {
        playerCount: toNumber(stats?.playerCount) ?? null,
        filteredPlayerCount: toNumber(stats?.filteredPlayerCount) ?? null,
        squadSize: toNumber(squadSize) ?? null,
      },
      solverSettings: settings,
      chemistry: stats?.chemistry ?? null,
      chemistryTargets: stats?.chemistryTargets ?? null,
      squadRating: squadRating ?? null,
      ratingTarget: ratingTarget ?? null,
      compositionSnapshot: snapshot,
      weakSlots,
    },
    shortcomings,
    reasoning,
    searchHints,
  };
};

const attachOrchestrationSummary = (
  result,
  orchestration,
  restartTimeBudgetMs,
  timedOut = false,
) => {
  if (!result || typeof result !== "object") return result;
  const stats = result?.stats ?? {};
  const debugEnabled = Boolean(stats?.debugEnabled);
  const existingDebugLog = Array.isArray(stats?.debugLog) ? stats.debugLog : [];
  const debugLog = debugEnabled
    ? existingDebugLog.concat([
        {
          stage: "orchestration",
          action: "summary",
          restartTimeBudgetMs,
          timedOut,
          baselineSeedCount: orchestration?.baselineSeeds?.length ?? 0,
          rescueSeedCount: orchestration?.rescueSeeds?.length ?? 0,
          winningSeed: orchestration?.winningSeed ?? null,
          perSeed: orchestration?.perSeed ?? [],
        },
      ])
    : existingDebugLog;
  return {
    ...result,
    stats: {
      ...stats,
      debugLog,
      orchestration,
    },
  };
};

const tryChemistryAnchorRewrite = (
  squad,
  pool,
  rules,
  squadSize,
  slots,
  targets,
  hardLockedIds,
  signature,
  debugPush,
  options = {},
) => {
  const slotList = Array.isArray(slots) ? slots : [];
  const n = Math.min(toNumber(squadSize) ?? 0, slotList.length, squad.length);
  if (n <= 0) return { changed: false };
  const baseChem = computeChemistryEval(squad, slotList, n);
  if (!baseChem || isChemistrySatisfied(baseChem, targets)) {
    return { changed: false };
  }
  const hardLocked = hardLockedIds instanceof Set ? hardLockedIds : new Set();
  const playerChem = new Array(n).fill(0);
  if (Array.isArray(baseChem.slotToPlayerIndex)) {
    for (let slotIndex = 0; slotIndex < Math.min(n, baseChem.slotToPlayerIndex.length); slotIndex += 1) {
      const playerIndex = baseChem.slotToPlayerIndex[slotIndex];
      if (playerIndex == null || playerIndex < 0 || playerIndex >= n) continue;
      playerChem[playerIndex] = baseChem.perSlotChem?.[slotIndex] ?? 0;
    }
  }
  const worstIndices = Array.from({ length: n }, (_, index) => index)
    .filter((index) => !hardLocked.has(squad[index]?.id))
    .sort((a, b) => playerChem[a] - playerChem[b]);
  if (!worstIndices.length) return { changed: false };
  const dominantLeague = getDominantCountEntry(squad.slice(0, n), "leagueId");
  const dominantNation = getDominantCountEntry(squad.slice(0, n), "nationId");
  const anchors = [];
  for (const groupId of signature?.requiredLeagueIds || []) {
    anchors.push({ axis: "league", groupId });
  }
  for (const groupId of signature?.requiredNationIds || []) {
    anchors.push({ axis: "nation", groupId });
  }
  if (dominantLeague.value != null) {
    anchors.push({ axis: "league", groupId: dominantLeague.value });
  }
  if (dominantNation.value != null) {
    anchors.push({ axis: "nation", groupId: dominantNation.value });
  }
  const seenAnchors = new Set();
  const uniqueAnchors = anchors.filter((entry) => {
    const key = `${entry.axis}:${entry.groupId}`;
    if (seenAnchors.has(key)) return false;
    seenAnchors.add(key);
    return true;
  });
  const rewriteSizes = Array.isArray(options?.rewriteSizes)
    ? options.rewriteSizes
    : [3, 4, 5];
  const currentShortfall = getChemistryShortfall(baseChem, targets);
  let best = null;
  for (const anchor of uniqueAnchors) {
    const attr = AXIS_TO_ATTR[anchor.axis] ?? null;
    if (!attr) continue;
    const candidates = (pool || [])
      .filter((player) => player && player.id != null)
      .filter((player) => String(player?.[attr] ?? "") === String(anchor.groupId))
      .sort((a, b) => a.rating - b.rating);
    if (!candidates.length) continue;
    for (const size of rewriteSizes) {
      const replaceIndices = worstIndices.slice(0, Math.min(worstIndices.length, size));
      if (!replaceIndices.length) continue;
      const nextSquad = squad.slice();
      const usedIds = new Set(
        nextSquad.map((player) => player?.id).filter((id) => id != null),
      );
      const usedDefs = new Set(
        nextSquad
          .map((player) => getDefinitionKey(player))
          .filter((value) => value != null)
          .map((value) => String(value)),
      );
      for (const index of replaceIndices) {
        usedIds.delete(nextSquad[index]?.id);
        const previousDef = getDefinitionKey(nextSquad[index]);
        if (previousDef != null) usedDefs.delete(String(previousDef));
      }
      let replaced = 0;
      for (const index of replaceIndices) {
        const replacement = candidates.find((candidate) => {
          if (!candidate || candidate.id == null) return false;
          if (usedIds.has(candidate.id)) return false;
          const defKey = getDefinitionKey(candidate);
          if (defKey != null && usedDefs.has(String(defKey))) return false;
          const trial = nextSquad.slice();
          trial[index] = candidate;
          return isSquadValid(rules, trial, n);
        });
        if (!replacement) break;
        nextSquad[index] = replacement;
        usedIds.add(replacement.id);
        const defKey = getDefinitionKey(replacement);
        if (defKey != null) usedDefs.add(String(defKey));
        replaced += 1;
      }
      if (replaced !== replaceIndices.length) continue;
      if (!isSquadValid(rules, nextSquad, n)) continue;
      const nextChem = computeChemistryEval(nextSquad, slotList, n);
      const nextShortfall = getChemistryShortfall(nextChem, targets);
      if (nextShortfall.score >= currentShortfall.score) continue;
      if (
        !best ||
        nextShortfall.score < best.shortfall.score ||
        (nextShortfall.score === best.shortfall.score &&
          (nextChem?.totalChem ?? 0) > (best.chem?.totalChem ?? 0))
      ) {
        best = {
          squad: nextSquad,
          chem: nextChem,
          shortfall: nextShortfall,
          axis: anchor.axis,
          groupId: anchor.groupId,
          replaced,
        };
      }
    }
  }
  if (!best) return { changed: false };
  squad.splice(0, squad.length, ...best.squad);
  debugPush?.({
    stage: "chemistry",
    action: "anchor_rewrite",
    axis: best.axis,
    groupId: best.groupId,
    replaced: best.replaced,
    totalChem: best.chem?.totalChem ?? null,
    minChem: best.chem?.minChem ?? null,
    shortfall: best.shortfall?.score ?? null,
  });
  return {
    changed: true,
    chemistry: best.chem,
  };
};

const runPipeline = (inputContext, seed = null, phaseConfig = null) => {
  const context = {
    ...(inputContext || {}),
    optimize: {
      ...((inputContext && inputContext.optimize) || {}),
      ...((phaseConfig && phaseConfig.optimize) || {}),
    },
    seed,
    phaseConfig,
  };
  const contextSeed = seed && typeof seed === "object" ? seed : null;
  const players = context?.players || [];
  const requirementFlags =
    context?.requirementFlags ||
    getRequirementFlags(context?.requirementsNormalized || []);
  const fallbackSquadSize = (() => {
    const fromContext = toNumber(context?.requiredPlayers);
    if (fromContext != null && fromContext > 0) return fromContext;
    const list = Array.isArray(context?.requirementsNormalized)
      ? context.requirementsNormalized
      : [];
    for (const rule of list) {
      if (!rule) continue;
      if (normalizeString(rule.type) !== "players_in_squad") continue;
      const direct = toNumber(rule.count);
      if (direct != null && direct > 0) return direct;
      const derived = toNumber(rule.derivedCount);
      if (derived != null && derived > 0) return derived;
      const numeric = extractValues(rule.value)
        .map(toNumber)
        .filter((v) => v != null && v > 0);
      if (numeric.length) return numeric[0];
    }
    return DEFAULT_SQUAD_SIZE;
  })();
  const startedAt = Date.now();
  const timingsMs = {};
  const debugEnabled = Boolean(context?.debug);
  const debugLog = [];
  const debugPush = debugEnabled
    ? (entry) => {
        debugLog.push({
          at: Date.now(),
          ...entry,
        });
      }
    : null;
  const solverDeadlineAt = toNumber(context?.optimize?.solverDeadlineAt) ?? null;
  const isSolverDeadlineExpired = () =>
    solverDeadlineAt != null && Date.now() >= solverDeadlineAt;
  const normalizePlayersStart = Date.now();
  const normalizedPool = normalizePlayers(players);
  const normalizedPlayers =
    contextSeed && typeof contextSeed.poolFilter === "function"
      ? normalizedPool.filter((player) => contextSeed.poolFilter(player))
      : normalizedPool;
  timingsMs.normalizePlayers = Date.now() - normalizePlayersStart;

  const compileConstraintsStart = Date.now();
  const compiledConstraints = compileConstraintSet(
    context?.requirementsNormalized || [],
    { fallbackSquadSize },
  );
  timingsMs.compileConstraints = Date.now() - compileConstraintsStart;

  const normalizeRulesStart = Date.now();
  const rules = normalizeRules(
    context?.requirementsNormalized || [],
    requirementFlags,
    debugPush,
    compiledConstraints,
  );
  timingsMs.normalizeRules = Date.now() - normalizeRulesStart;
  const squadSize = getSquadSize(rules, fallbackSquadSize);
  const signature =
    context?.signature || buildChallengeSignature(rules, squadSize);
  const ratingRequirement = getTeamRatingTarget(rules);
  const chemistryTargets = getChemistryRequirementTargets(rules, squadSize);
  const chemistryRequired =
    chemistryTargets?.total != null || chemistryTargets?.minEach != null;
  const noRatingConservation = getNoRatingConservationProfile(
    rules,
    squadSize,
    signature,
  );
  const lowRatingConservation = getLowRatingConservationProfile(
    rules,
    squadSize,
    signature,
  );
  const conservationPivot = getNoRatingConservationPivot(noRatingConservation);
  const solvedValuePivot =
    context?.optimize?.preservePivot ??
    (noRatingConservation?.enabled
      ? conservationPivot
      : lowRatingConservation?.enabled
        ? toNumber(lowRatingConservation.pivot)
        : null);
  const informBounds = getInformRequirementBounds(rules, squadSize);
  const specialBounds = getSpecialRequirementBounds(rules, squadSize);
  const appliedFilters = [];
  const ignoredRequirements = [];

  const ratingTargetValue = toNumber(ratingRequirement?.target);
  const shouldUseRatingFillHint = Boolean(
    ratingTargetValue != null &&
      ((!chemistryRequired && ratingTargetValue >= 80) ||
        (chemistryRequired && ratingTargetValue >= 78)),
  );
  const ratingFillHint = shouldUseRatingFillHint
    ? {
        // Keep the initial fill closer to the needed rating so chemistry-heavy
        // composition puzzles do not lock into a cheap low-rating shell.
        pivot: Math.max(
          chemistryRequired ? 76 : 80,
          Math.floor(ratingTargetValue ?? 0) - 1,
        ),
      }
    : null;

  const uniqueMaxByAttr = new Map();
  const preferUniqueFill = context?.optimize?.preferUniqueFill === true;
  if (preferUniqueFill) {
    const nationBounds = getUniqueCountRequirementBounds(
      rules,
      "nation_count",
      squadSize,
    );
    const leagueBounds = getUniqueCountRequirementBounds(
      rules,
      "league_count",
      squadSize,
    );
    const clubBounds = getUniqueCountRequirementBounds(
      rules,
      "club_count",
      squadSize,
    );
    if (Number.isFinite(nationBounds.max) && nationBounds.max < Infinity) {
      uniqueMaxByAttr.set("nationId", nationBounds.max);
    }
    if (Number.isFinite(leagueBounds.max) && leagueBounds.max < Infinity) {
      uniqueMaxByAttr.set("leagueId", leagueBounds.max);
    }
    if (Number.isFinite(clubBounds.max) && clubBounds.max < Infinity) {
      uniqueMaxByAttr.set("teamId", clubBounds.max);
    }
  }

  const buildSquadStart = Date.now();
  let pool = normalizedPlayers.slice();
  let squad = [];
  const lockedIds = new Set();
  const preservedSeedIds = new Set();

  // Build player-by-id lookup from normalized pool for slot resolution and special fallback.
  const playerById = new Map(
    normalizedPlayers
      .filter((p) => p?.id != null)
      .map((p) => [String(p.id), p]),
  );

  const preserveOccupiedSlots = toBooleanSetting(
    context?.filters?.preserveOccupiedSlots,
    false,
  );

  // Pre-seed squad from occupied field slots only when the page layer is going
  // to preserve occupied items, or when EA marks a slot as locked/non-editable.
  const slotDiag = [];
  for (const slot of context?.squadSlots || []) {
    const item = slot?.item ?? null;
    const hasItem = item && typeof item === "object";
    const concept = hasItem
      ? typeof item.isConcept === "function"
        ? item.isConcept()
        : Boolean(item?.concept)
      : false;
    const id = hasItem ? (item?.id ?? null) : null;
    const idKey = id != null ? String(id) : null;
    const isLocked = slot?.isLocked ?? null;
    const isEditable = slot?.isEditable ?? null;
    const isBrick = slot?.isBrick ?? null;
    const isValid = slot?.isValid ?? null;
    slotDiag.push({
      slotIndex: slot?.slotIndex ?? null,
      isLocked,
      isEditable,
      isBrick,
      isValid,
      hasItem: Boolean(hasItem && !concept && idKey),
      itemId: idKey,
      concept,
    });
    // Keep occupied valid slots only for preserve-mode. Always keep explicit
    // lock/brick/non-editable flags because those are real slot constraints.
    const keep =
      (preserveOccupiedSlots && isValid === true) ||
      isBrick === true ||
      isLocked === true ||
      isEditable === false;
    if (!keep) continue;
    if (!hasItem || concept) continue;
    if (!idKey || idKey === "0") continue;
    const player = playerById.get(idKey);
    if (!player) continue;
    squad.push(player);
    lockedIds.add(player.id);
    preservedSeedIds.add(player.id);
  }
  debugPush?.({ stage: "preseed", slotDiag, preseeded: squad.length });

  // Resolve slot items to normalized players so we can count how many slot
  // items already satisfy each prefill predicate (e.g. TOTW already in a slot).
  // The page layer preserves valid slot items during apply, so the solver
  // should reduce its own prefill quotas to avoid wasteful duplicates.
  const slotPlayers = [];
  for (const slot of context?.squadSlots || []) {
    const item = slot?.item ?? null;
    if (!item || typeof item !== "object") continue;
    const concept =
      typeof item.isConcept === "function"
        ? item.isConcept()
        : Boolean(item?.concept);
    if (concept) continue;
    const id = item?.id ?? null;
    if (id == null) continue;
    const idKey = String(id);
    if (!idKey || idKey === "0") continue;
    const player = playerById.get(idKey);
    if (player) slotPlayers.push(player);
  }

  const rulesByType = new Map();
  for (const rule of rules) {
    if (!rule?.type) continue;
    if (!rulesByType.has(rule.type)) {
      rulesByType.set(rule.type, []);
    }
    rulesByType.get(rule.type).push(rule);
  }

  const prefillPreferencePredicates = buildPrefillPreferencePredicates(
    rules,
    squad,
    squadSize,
  );

  // Enforce "Players from the same X: Max N" during prefill/fill so we don't build an invalid squad
  // and only discover it at final evaluation.
  const sameMaxByAttr = new Map();
  for (const rule of rules) {
    if (!rule) continue;
    if (
      rule.type !== "same_nation_count" &&
      rule.type !== "same_league_count" &&
      rule.type !== "same_club_count"
    ) {
      continue;
    }
    const required = getRuleCount(rule, squadSize);
    if (required == null || required <= 0) continue;
    if (rule.op !== "max" && rule.op !== "exact") continue;
    const attr =
      rule.type === "same_nation_count"
        ? "nationId"
        : rule.type === "same_league_count"
          ? "leagueId"
          : "teamId";
    const prev = sameMaxByAttr.get(attr);
    sameMaxByAttr.set(attr, prev == null ? required : Math.min(prev, required));
  }

  // Build predicate caps for "max" and "exact" rules so fill/prefill can enforce upper bounds.
  const predicateCaps = [];
  for (const rule of rules) {
    if (!rule) continue;
    if (rule.op !== "max" && rule.op !== "exact") continue;
    const required = getRuleCount(rule, squadSize);
    if (required == null || required < 0) continue;
    const predicate = rule.predicate || buildPredicate(rule);
    if (!predicate) continue;
    predicateCaps.push({
      type: rule.type,
      op: rule.op,
      max: required,
      required,
      predicate,
    });
  }

  const hardFilteredRules = new Set();

  // Apply quality/level "gate" rules (ex: "Player Quality: Max. Silver") even when EA encodes them
  // without a count/target. These are "all players must satisfy" constraints, not quota counts.
  for (const rule of rules) {
    if (!rule) continue;
    if (rule.type !== "player_quality" && rule.type !== "player_level")
      continue;
    const required = getRuleCount(rule, squadSize);
    if (required != null) continue; // Quota-style quality/level rules are handled elsewhere.
    const gatePredicate = rule.gatePredicate || buildQualityGatePredicate(rule);
    if (!gatePredicate) continue;

    pool = pool.filter(gatePredicate);
    appliedFilters.push({
      type: rule.type,
      method: "quality_gate",
      op: rule.op,
      values: rule.values,
      filled: true,
    });
    debugPush?.({
      stage: "filter",
      action: "apply",
      method: "quality_gate",
      type: rule.type,
      op: rule.op,
      values: rule.values,
      poolSize: pool.length,
      hard: true,
    });
    hardFilteredRules.add(rule);
  }

  // Apply hard "all players must match" filters before any prefill so we never prefill illegal cards.
  for (const rule of rules) {
    if (!rule) continue;
    const required = getRuleCount(rule, squadSize);
    if (required == null || required <= 0) continue;
    if (required < squadSize) continue;
    if (rule.op !== "min" && rule.op !== "exact") continue;

    if (
      rule.type === "same_nation_count" ||
      rule.type === "same_league_count" ||
      rule.type === "same_club_count"
    ) {
      const attr =
        rule.type === "same_nation_count"
          ? "nationId"
          : rule.type === "same_league_count"
            ? "leagueId"
            : "teamId";
      const group = selectGroupForSameCount(pool, attr, required, {
        prefillBias: contextSeed?.prefillBias ?? null,
        signature,
        squadSize,
        rules,
        currentSquad: squad,
      });
      if (group == null) {
        ignoredRequirements.push(rule.raw);
        debugPush?.({
          stage: "filter",
          action: "skip",
          reason: "group_not_found",
          type: rule.type,
          required,
          key: rule.raw?.key ?? null,
          label: rule.raw?.label ?? null,
        });
        continue;
      }
      const groupPredicate = (player) => player?.[attr] === group;
      pool = pool.filter(groupPredicate);
      appliedFilters.push({
        type: rule.type,
        method: "filter",
        required,
        group,
      });
      debugPush?.({
        stage: "filter",
        action: "apply",
        method: "filter",
        type: rule.type,
        required,
        group,
        poolSize: pool.length,
        hard: true,
      });
      hardFilteredRules.add(rule);
      continue;
    }

    const predicate = rule.predicate || buildPredicate(rule);
    if (!predicate) continue;
    pool = pool.filter(predicate);
    appliedFilters.push({ type: rule.type, method: "filter", required });
    debugPush?.({
      stage: "filter",
      action: "apply",
      method: "filter",
      type: rule.type,
      required,
      poolSize: pool.length,
      hard: true,
    });
    hardFilteredRules.add(rule);
  }

  if (Array.isArray(contextSeed?.prefillPlayerIds)) {
    const prefillIds = new Set(contextSeed.prefillPlayerIds.map(String));
    const selected = pool
      .filter((player) => player?.id != null && prefillIds.has(String(player.id)))
      .sort((a, b) => {
        const aIndex = contextSeed.prefillPlayerIds.indexOf(String(a.id));
        const bIndex = contextSeed.prefillPlayerIds.indexOf(String(b.id));
        return aIndex - bIndex;
      });
    let filled = 0;
    for (const player of selected) {
      if (squad.length >= squadSize) break;
      if (!player || player.id == null || lockedIds.has(player.id)) continue;
      squad.push(player);
      lockedIds.add(player.id);
      filled += 1;
    }
    appliedFilters.push({
      type: "seed_prefill_players",
      method: "prefill",
      required: Math.min(contextSeed.prefillPlayerIds.length, squadSize),
      filled,
    });
    debugPush?.({
      stage: "seed",
      action: "prefill_players",
      requested: contextSeed.prefillPlayerIds.length,
      filled,
      squadSize: squad.length,
    });
  }

  if (Array.isArray(contextSeed?.prefillGroups)) {
    for (const group of contextSeed.prefillGroups) {
      const attr = group?.attr ?? null;
      const value = group?.value ?? null;
      const required = Math.min(squadSize, toNumber(group?.count) ?? 0);
      if (!attr || value == null || required <= 0) continue;
      const groupPredicate = (player) =>
        String(player?.[attr] ?? "") === String(value);
      const filled = prefillPlayers(
        squad,
        pool,
        groupPredicate,
        required,
        lockedIds,
        {
          uniqueMaxByAttr,
          sameMaxByAttr,
          predicateCaps,
          squadSizeCap: squadSize,
          ratingHint: ratingFillHint,
          preferencePredicates: prefillPreferencePredicates,
          seed: contextSeed,
        },
      );
      appliedFilters.push({
        type: "seed_prefill_group",
        method: "prefill",
        attr,
        value,
        required,
        filled,
      });
      debugPush?.({
        stage: "seed",
        action: "prefill_group",
        attr,
        value,
        required,
        filled,
        squadSize: squad.length,
      });
    }
  }

  for (const type of FILTER_PRIORITY) {
    const rulesForType = rulesByType.get(type) || [];
    for (const rule of rulesForType) {
      if (hardFilteredRules.has(rule)) continue;
      const required = getRuleCount(rule, squadSize);
      if (required == null || required <= 0) {
        ignoredRequirements.push(rule.raw);
        debugPush?.({
          stage: "filter",
          action: "skip",
          reason: "required_missing",
          type,
          key: rule.raw?.key ?? null,
          label: rule.raw?.label ?? null,
        });
        continue;
      }

      if (
        type === "same_nation_count" ||
        type === "same_league_count" ||
        type === "same_club_count"
      ) {
        // Max-only rules are enforced via `sameMaxByAttr` in prefill/fill.
        if (rule.op === "max") continue;
        const attr =
          type === "same_nation_count"
            ? "nationId"
            : type === "same_league_count"
              ? "leagueId"
              : "teamId";
        const group = selectGroupForSameCount(pool, attr, required, {
          prefillBias: contextSeed?.prefillBias ?? null,
          signature,
          squadSize,
          rules,
          currentSquad: squad,
        });
        if (group == null) {
          ignoredRequirements.push(rule.raw);
          debugPush?.({
            stage: "filter",
            action: "skip",
            reason: "group_not_found",
            type,
            required,
            key: rule.raw?.key ?? null,
            label: rule.raw?.label ?? null,
          });
          continue;
        }
        const groupPredicate = (player) => player?.[attr] === group;
        const filled = prefillPlayers(
          squad,
          pool,
          groupPredicate,
          required,
          lockedIds,
          {
            uniqueMaxByAttr,
            sameMaxByAttr,
            predicateCaps,
            squadSizeCap: squadSize,
            ratingHint: ratingFillHint,
            preferencePredicates: prefillPreferencePredicates,
            seed: contextSeed,
          },
        );
        appliedFilters.push({
          type,
          method: "prefill",
          required,
          group,
          filled,
        });
        debugPush?.({
          stage: "filter",
          action: "apply",
          method: "prefill",
          type,
          required,
          group,
          filled,
          squadSize: squad.length,
        });
        continue;
      }

      const predicate = rule.predicate || buildPredicate(rule);
      if (!predicate) {
        ignoredRequirements.push(rule.raw);
        debugPush?.({
          stage: "filter",
          action: "skip",
          reason: "predicate_missing",
          type,
          key: rule.raw?.key ?? null,
          label: rule.raw?.label ?? null,
        });
        continue;
      }

      // "max" rules are enforced via predicate caps in prefill/fill.
      if (rule.op === "max") continue;

      // Reduce required count by how many slot items already satisfy this
      // predicate. The page preserves valid slot items during apply, so the
      // solver should not add duplicates the user has already placed.
      const slotSatisfied = slotPlayers.reduce(
        (count, player) => (predicate(player) ? count + 1 : count),
        0,
      );
      const effectiveRequired = Math.max(0, required - slotSatisfied);

      const filled = prefillPlayers(
        squad,
        pool,
        predicate,
        effectiveRequired,
        lockedIds,
        {
          uniqueMaxByAttr,
          sameMaxByAttr,
          predicateCaps,
          squadSizeCap: squadSize,
          ratingHint: ratingFillHint,
          preferencePredicates: prefillPreferencePredicates,
          seed: contextSeed,
        },
      );
      appliedFilters.push({
        type,
        method: "prefill",
        required: effectiveRequired,
        filled,
        slotSatisfied,
      });
      debugPush?.({
        stage: "filter",
        action: "apply",
        method: "prefill",
        type,
        required: effectiveRequired,
        originalRequired: required,
        slotSatisfied,
        filled,
        squadSize: squad.length,
      });
    }
  }

  const specialRule = rules.find((rule) => rule.type === "player_inform");
  const excludeSpecial = toBooleanSetting(
    context?.filters?.excludeSpecial,
    false,
  );
  const useTotwPlayers = toBooleanSetting(
    context?.filters?.useTotwPlayers,
    true,
  );
  const explicitTotwOrTotsRequirement =
    hasExplicitTotwOrTotsRequirement(rules);
  const preferLowerExcessInformsDuringSolve = !explicitTotwOrTotsRequirement;
  const allowsNonSpecialPreference =
    excludeSpecial &&
    (!specialRule ||
      specialRule.op === "max" ||
      toNumber(specialRule.count) === 0);
  const allowsNonTotwOrTotsPreference =
    useTotwPlayers &&
    !explicitTotwOrTotsRequirement &&
    Boolean(ratingRequirement) &&
    !chemistryRequired;

  const minMax = applyMinMaxFilters(
    pool,
    rules.filter(
      (rule) =>
        rule.type === "player_min_ovr" || rule.type === "player_max_ovr",
    ),
  );
  pool = minMax.filtered;
  debugPush?.({
    stage: "filter",
    action: "apply",
    method: "min_max",
    min: minMax.min ?? null,
    max: minMax.max ?? null,
    poolSize: pool.length,
  });

  if (allowsNonSpecialPreference) {
    const preferResult = preferNonSpecialPlayers(
      pool,
      squad,
      squadSize,
      lockedIds,
      {
        ratingTarget: ratingRequirement?.target ?? null,
        rules,
      },
    );
    if (preferResult.applied) {
      pool = preferResult.pool;
      debugPush?.({
        stage: "filter",
        action: "apply",
        method: "prefer_non_special",
        poolSize: pool.length,
      });
    }
  }

  if (allowsNonTotwOrTotsPreference) {
    const preferResult = preferNonTotwOrTotsPlayers(
      pool,
      squad,
      squadSize,
      lockedIds,
      {
        ratingTarget: ratingRequirement?.target ?? null,
        rules,
      },
    );
    if (preferResult.applied) {
      pool = preferResult.pool;
      debugPush?.({
        stage: "filter",
        action: "apply",
        method: "prefer_non_totw_or_tots",
        poolSize: pool.length,
      });
    }
  }

  if (isPureRatingOnlySbc(rules, chemistryRequired)) {
    squad = buildPureRatingOnlySquad(squad, pool, squadSize, lockedIds, {
      ratingTarget: ratingRequirement?.target ?? null,
      pivot: ratingFillHint?.pivot ?? null,
      avoidSpecials: true,
      avoidTotwOrTots: !explicitTotwOrTotsRequirement,
      debugPush,
    });
    rebuildLockedIdsFromSquad(squad, lockedIds);
    debugPush?.({
      stage: "fill",
      action: "exact_pure_rating",
      squadSize: squad.length,
      lockedCount: lockedIds.size,
    });
  } else {
    // Soft-discourage specials: at equal rating, non-specials come first in pool ordering.
    // This passively makes fill/swap prefer non-specials without blocking specials.
    pool.sort((a, b) => {
      if (isConceptPlayer(a) && isConceptPlayer(b)) {
        const conceptPriceDiff = compareConceptPricePriority(a, b);
        if (conceptPriceDiff !== 0) return conceptPriceDiff;
      }
      const seedBiasDiff =
        getSeedPoolBiasScore(a, contextSeed) -
        getSeedPoolBiasScore(b, contextSeed);
      if (seedBiasDiff !== 0) return seedBiasDiff;
      const ra = toNumber(a?.rating) ?? 0;
      const rb = toNumber(b?.rating) ?? 0;
      if (ra !== rb) return ra - rb;
      const specialDiff = (a?.isSpecial ? 1 : 0) - (b?.isSpecial ? 1 : 0);
      if (specialDiff !== 0) return specialDiff;
      return getStoragePreferenceScore(b) - getStoragePreferenceScore(a);
    });

    const fillPreferencePredicates = buildPrefillPreferencePredicates(
      rules,
      squad,
      squadSize,
    );

    squad = fillSquad(squad, pool, squadSize, lockedIds, {
      uniqueMaxByAttr,
      sameMaxByAttr,
      predicateCaps,
      ratingHint: ratingFillHint,
      preferencePredicates: fillPreferencePredicates,
      seed: contextSeed,
    });
    rebuildLockedIdsFromSquad(squad, lockedIds);
    debugPush?.({
      stage: "fill",
      squadSize: squad.length,
      lockedCount: lockedIds.size,
    });
  }

  const dedupeReplaced = enforceUniqueDefinitions(
    squad,
    pool,
    rules,
    squadSize,
    debugPush,
    { lockedIds: preservedSeedIds },
  );
  if (dedupeReplaced > 0) {
    debugPush?.({
      stage: "dedupe",
      action: "summary",
      replaced: dedupeReplaced,
    });
  }

  // Prefill uses `lockedIds` to avoid selecting the same item twice.
  // Once we have a full squad, clear transient fill locks. Optionally keep
  // preseeded occupied slot players locked for the full solve lifecycle.
  lockedIds.clear();
  if (preservedSeedIds.size) {
    for (const id of preservedSeedIds) lockedIds.add(id);
    debugPush?.({
      stage: "preseed",
      action: "lock_reapply",
      preserveOccupiedSlots,
      lockedCount: lockedIds.size,
    });
  }

  // Enforce unique-count constraints (e.g. "Clubs in Squad: Max. 5") before rating improvement.
  // Rating improvement requires intermediate squads to be valid, so we must satisfy these early.
  const uniqueCountConfig = [
    { type: "nation_count", attr: "nationId" },
    { type: "league_count", attr: "leagueId" },
    { type: "club_count", attr: "teamId" },
  ];
  const uniqueBoundsByType = new Map(
    uniqueCountConfig.map(({ type }) => [
      type,
      getUniqueCountRequirementBounds(rules, type, squadSize),
    ]),
  );
  const boundedUniqueTypes = uniqueCountConfig
    .filter(({ type }) => {
      const bounds = uniqueBoundsByType.get(type);
      return bounds && Number.isFinite(bounds.max) && bounds.max < Infinity;
    })
    .sort(
      (a, b) =>
        (uniqueBoundsByType.get(a.type)?.max ?? Infinity) -
        (uniqueBoundsByType.get(b.type)?.max ?? Infinity),
    );
  if (boundedUniqueTypes.length) {
    const ignoredUniqueTypes = boundedUniqueTypes.map(({ type }) => type);
    for (const { type, attr } of boundedUniqueTypes) {
      const maxUnique = uniqueBoundsByType.get(type)?.max ?? null;
      const before = countByAttr(squad, attr).size;
      const ok = reduceUniqueAttrCount(
        squad,
        pool,
        rules,
        squadSize,
        attr,
        maxUnique,
        lockedIds,
        debugPush,
        {
          ignoredTypes: ignoredUniqueTypes,
          allowedAttrs: boundedUniqueTypes
            .filter((entry) => entry.attr !== attr)
            .map((entry) => entry.attr),
          maxIterations: context?.optimize?.uniqueMaxIterations ?? 160,
        },
      );
      const after = countByAttr(squad, attr).size;
      debugPush?.({
        stage: "unique",
        action: "summary",
        type,
        attr,
        maxUnique: maxUnique ?? null,
        before,
        after,
        ok,
      });
    }
  }

  timingsMs.buildSquad = Date.now() - buildSquadStart;

  if (ratingRequirement) {
    const SIMPLE_RATING_TYPES = new Set([
      "players_in_squad",
      "team_rating",
      "player_inform",
      "player_tots",
      "player_totw_or_tots",
      "player_quality",
      "player_level",
      "player_rarity",
      "player_rarity_group",
      "player_min_ovr",
      "player_max_ovr",
      "player_exact_ovr",
      "player_tradability",
    ]);
    const isSimpleRatingSbc =
      !chemistryRequired &&
      (rules || []).every((rule) => rule && SIMPLE_RATING_TYPES.has(rule.type));

    const ratingImproveStart = Date.now();
    const smartImproveEnabled = context?.optimize?.smartImproveRating !== false;
    if (smartImproveEnabled) {
      improveRatingSmart(
        squad,
        pool,
        rules,
        squadSize,
        ratingRequirement.target,
        lockedIds,
        debugPush,
        {
          pivot: context?.optimize?.preservePivot ?? conservationPivot,
          maxIterations: context?.optimize?.ratingMaxIterations ?? 80,
          capOffset: context?.optimize?.ratingCapOffset ?? 2,
          requiredInforms: informBounds?.min ?? 0,
          requiredSpecials: specialBounds?.min ?? 0,
          avoidInforms: context?.optimize?.avoidInforms !== false,
          avoidTotwOrTots:
            useTotwPlayers && !explicitTotwOrTotsRequirement
              ? context?.optimize?.avoidTotwOrTots !== false
              : false,
          preferLowerExcessInforms: preferLowerExcessInformsDuringSolve,
          // For simple "upgrade" SBCs (rating + inform), keep the candidate windows tight to avoid
          // burning time scanning thousands of unnecessary swaps.
          window: isSimpleRatingSbc ? 10 : undefined,
          maxCandidates: isSimpleRatingSbc ? 160 : undefined,
          pairCandidates: isSimpleRatingSbc ? 55 : undefined,
          pairShortfallThreshold: isSimpleRatingSbc ? 0.9 : undefined,
        },
      );
    } else {
      improveRating(squad, pool, ratingRequirement.target, lockedIds);
    }
    timingsMs.ratingImprove = Date.now() - ratingImproveStart;
    debugPush?.({
      stage: "rating",
      target: ratingRequirement.target,
      squadRating: getSquadRating(squad),
    });

    const preserveEnabled = context?.optimize?.preserveHighCards !== false;
    if (preserveEnabled) {
      const preserveStart = Date.now();
      const preserveMaxIterations =
        context?.optimize?.preserveMaxIterations ?? 30;
      const preserve = optimizeSquadForPreservation(
        squad,
        normalizedPlayers,
        rules,
        squadSize,
        ratingRequirement.target,
        lockedIds,
        debugPush,
        {
          pivot: context?.optimize?.preservePivot ?? conservationPivot,
          maxIterations: isSimpleRatingSbc
            ? Math.max(toNumber(preserveMaxIterations) ?? 30, 30)
            : preserveMaxIterations,
          requiredInforms: informBounds?.min ?? 0,
          requiredSpecials: specialBounds?.min ?? 0,
          preferLowerExcessInforms: true,
          window: isSimpleRatingSbc ? 8 : undefined,
          maxCandidates: isSimpleRatingSbc ? 220 : undefined,
          pairCandidates: isSimpleRatingSbc ? 70 : undefined,
          pairOutlierThreshold: isSimpleRatingSbc ? 4 : undefined,
        },
      );
      timingsMs.preserve = Date.now() - preserveStart;
      if (preserve?.changed) {
        squad = preserve.squad;
      }
    }
  }

  const slotsForChemistry = chemistryRequired
    ? normalizeSlotsForChemistry(
        context?.squadSlots,
        toNumber(context?.requiredPlayers) ?? squadSize,
      )
    : [];

  const hardLockedIds = new Set(lockedIds);

  let chemistry = null;
  if (chemistryRequired) {
    const chemistryStart = Date.now();
    if (slotsForChemistry.length < squadSize) {
      debugPush?.({
        stage: "chemistry",
        action: "skip",
        reason: "slots_unavailable",
        slotCount: slotsForChemistry.length,
        squadSize,
      });
    } else {
      chemistry = computeChemistryEval(squad, slotsForChemistry, squadSize);
      if (!isChemistrySatisfied(chemistry, chemistryTargets)) {
        const baseChemMaxIterations = Math.max(
          10,
          toNumber(context?.optimize?.chemMaxIterations) ?? 60,
        );
        const baseChemMaxCandidates = Math.max(
          40,
          toNumber(context?.optimize?.chemMaxCandidates) ?? 160,
        );
        const baseChemEscapeDepth = Math.max(
          1,
          toNumber(context?.optimize?.chemEscapeDepth) ?? 3,
        );
        const baseChemEscapeBeamWidth = Math.max(
          8,
          toNumber(context?.optimize?.chemEscapeBeamWidth) ?? 14,
        );
        const baseChemEscapeCandidateLimit = Math.max(
          20,
          toNumber(context?.optimize?.chemEscapeCandidateLimit) ?? 70,
        );
        const baseChemEscapePenaltySlack = Math.max(
          0,
          toNumber(context?.optimize?.chemEscapePenaltySlack) ?? 30,
        );
        const baseChemOptions = {
          maxIterations: baseChemMaxIterations,
          maxCandidates: baseChemMaxCandidates,
          chemistryEscapeDepth: baseChemEscapeDepth,
          chemistryEscapeBeamWidth: baseChemEscapeBeamWidth,
          chemistryEscapeCandidateLimit: baseChemEscapeCandidateLimit,
          chemistryEscapePenaltySlack: baseChemEscapePenaltySlack,
          ratingTarget: ratingRequirement?.target ?? null,
          pivot: context?.optimize?.preservePivot ?? conservationPivot,
          seed: contextSeed,
          requiredInforms: informBounds?.min ?? 0,
          requiredSpecials: specialBounds?.min ?? 0,
          avoidInforms: context?.optimize?.avoidInforms !== false,
          avoidTotwOrTots:
            useTotwPlayers && !explicitTotwOrTotsRequirement
              ? context?.optimize?.avoidTotwOrTots !== false
              : false,
          preferLowerExcessInforms: preferLowerExcessInformsDuringSolve,
          timeBudgetMs: context?.optimize?.chemTimeBudgetMs ?? null,
        };

        improveChemistrySmart(
          squad,
          pool,
          rules,
          squadSize,
          slotsForChemistry,
          chemistryTargets,
          hardLockedIds,
          debugPush,
          baseChemOptions,
        );
        chemistry = computeChemistryEval(squad, slotsForChemistry, squadSize);

        if (!isChemistrySatisfied(chemistry, chemistryTargets)) {
          const nonChemistryFailures = [];
          for (const rule of rules) {
            if (!rule) continue;
            if (
              rule.type === "chemistry_points" ||
              rule.type === "all_players_chemistry_points"
            ) {
              continue;
            }
            const failing = evaluateRule(rule, squad, squadSize, {
              checkChemistry: chemistryRequired,
              chemistry,
            });
            if (failing) nonChemistryFailures.push(failing);
          }
          if (
            signature?.isCompositionPuzzle &&
            nonChemistryFailures.length === 0
          ) {
            const rewrite = tryChemistryAnchorRewrite(
              squad,
              pool,
              rules,
              squadSize,
              slotsForChemistry,
              chemistryTargets,
              hardLockedIds,
              signature,
              debugPush,
            );
            if (rewrite?.changed) {
              chemistry =
                rewrite?.chemistry ??
                computeChemistryEval(squad, slotsForChemistry, squadSize);
            }
          }

          if (!isChemistrySatisfied(chemistry, chemistryTargets)) {
          const shortfall = getChemistryShortfall(chemistry, chemistryTargets);
          const extendedShortfallThreshold = Math.max(
            1,
            toNumber(context?.optimize?.chemExtendedShortfallThreshold) ?? 2,
          );
          if (
            shortfall.score > 0 &&
            shortfall.score <= extendedShortfallThreshold
          ) {
            debugPush?.({
              stage: "chemistry",
              action: "retry_extended",
              shortfall: shortfall.score,
              totalShort: shortfall.totalShort,
              minShort: shortfall.minShort,
              totalChem: chemistry?.totalChem ?? null,
              minChem: chemistry?.minChem ?? null,
            });

            improveChemistrySmart(
              squad,
              pool,
              rules,
              squadSize,
              slotsForChemistry,
              chemistryTargets,
              hardLockedIds,
              debugPush,
              {
                ...baseChemOptions,
                maxIterations: Math.max(
                  baseChemMaxIterations,
                  toNumber(context?.optimize?.chemExtendedMaxIterations) ??
                    120,
                ),
                maxCandidates: Math.max(
                  baseChemMaxCandidates,
                  toNumber(context?.optimize?.chemExtendedMaxCandidates) ??
                    280,
                ),
                chemistryEscapeDepth: Math.max(
                  baseChemEscapeDepth,
                  toNumber(context?.optimize?.chemExtendedEscapeDepth) ?? 5,
                ),
                chemistryEscapeBeamWidth: Math.max(
                  baseChemEscapeBeamWidth,
                  toNumber(context?.optimize?.chemExtendedEscapeBeamWidth) ??
                    24,
                ),
                chemistryEscapeCandidateLimit: Math.max(
                  baseChemEscapeCandidateLimit,
                  toNumber(
                    context?.optimize?.chemExtendedEscapeCandidateLimit,
                  ) ?? 150,
                ),
                chemistryEscapePenaltySlack: Math.max(
                  baseChemEscapePenaltySlack,
                  toNumber(context?.optimize?.chemExtendedEscapePenaltySlack) ??
                    50,
                ),
                positionCoveragePerSlot: Math.max(
                  8,
                  toNumber(context?.optimize?.chemExtendedPositionCoverage) ??
                    14,
                ),
                adaptiveNearTarget:
                  context?.optimize?.chemAdaptiveNearTarget !== false,
                nearTargetShortfallThreshold: Math.max(
                  1,
                  toNumber(context?.optimize?.chemNearTargetShortfall) ?? 2,
                ),
                timeBudgetMs: Math.max(
                  toNumber(baseChemOptions.timeBudgetMs) ?? 0,
                  toNumber(context?.optimize?.chemExtendedTimeBudgetMs) ?? 3000,
                ),
              },
            );
            chemistry = computeChemistryEval(squad, slotsForChemistry, squadSize);
          }
        }
        }
      }
    }
    timingsMs.chemistry = Date.now() - chemistryStart;
  }

  const buildFailingRequirements = (workingSquad, currentChemistry) => {
    const evalCtx = {
      checkChemistry: chemistryRequired,
      chemistry: currentChemistry,
    };
    const failing = [];
    for (const rule of rules) {
      const failedRule = evaluateRule(rule, workingSquad, squadSize, evalCtx);
      if (failedRule) failing.push(failedRule);
    }
    if (workingSquad.length < squadSize &&
        !failing.some(rule => normalizeRequirementType(rule) === "players_in_squad")) {
      failing.push({ type: "players_in_squad", op: "exact", count: squadSize,
        label: `Number of players: ${squadSize}` });
    }
    for (const id of preservedSeedIds) {
      if (!workingSquad.some(player => player.id === id)) {
        failing.push({ type: "locked_player", value: id,
          label: `Preserved player ${id} is missing from the squad` });
      }
    }
    return failing;
  };

  let finalDedupeReplaced = 0;
  if (hasDuplicateDefinitions(squad, squadSize)) {
    finalDedupeReplaced = enforceUniqueDefinitions(
      squad,
      pool,
      rules,
      squadSize,
      debugPush,
      {
        lockedIds: preservedSeedIds,
        chemistryRequired,
        slotsForChemistry,
        chemistryTargets,
        currentChemistry: chemistry,
      },
    );
    if (finalDedupeReplaced > 0) {
      if (chemistryRequired) {
        chemistry = computeChemistryEval(squad, slotsForChemistry, squadSize);
      }
      debugPush?.({
        stage: "dedupe",
        action: "final_summary",
        replaced: finalDedupeReplaced,
        remainingDefinitionIds: getDuplicateDefinitionKeys(squad, squadSize),
      });
    }
  }

  let failingRequirements = buildFailingRequirements(squad, chemistry);
  let solved = failingRequirements.length === 0;
  let refinement = {
    ran: false,
    changed: false,
    before: null,
    after: null,
    singleSwaps: 0,
    pairEscapes: 0,
    reshapeTriggered: false,
    reshapeReason: null,
    reshapeChanged: false,
    reshapeCandidatesEvaluated: 0,
    elapsedMs: 0,
  };
  let conservation = {
    ran: false,
    changed: false,
    before: null,
    after: null,
    mode: null,
    outIds: [],
    inIds: [],
    evaluations: 0,
    elapsedMs: 0,
  };

  if (solved && context?.optimize?.refineSolvedSquad !== false) {
    const refineStart = Date.now();
    const conceptCountBeforeRefine = getConceptUsageMetrics(
      squad.slice(0, squadSize),
    ).conceptCount;
    const conceptCleanupBudgetMs =
      conceptCountBeforeRefine > 0
        ? Math.min(
            1500,
            Math.max(
              650,
              conceptCountBeforeRefine * 120 + Math.min(pool.length, 220) * 6,
            ),
          )
        : 0;
    const defaultRefineBudgetMs =
      signature?.isCompositionPuzzle || chemistryRequired ? 250 : 120;
    const refineTimeBudgetMs =
      toNumber(context?.optimize?.refineTimeBudgetMs) ??
      Math.max(defaultRefineBudgetMs, conceptCleanupBudgetMs);
    const refineLocalTimeBudgetMs =
      conceptCleanupBudgetMs > 0
        ? Math.max(
            Math.floor(refineTimeBudgetMs * 0.75),
            Math.min(refineTimeBudgetMs, conceptCleanupBudgetMs),
          )
        : undefined;
    const refineResult = refineSolvedSquad(
      squad,
      normalizedPlayers,
      rules,
      squadSize,
      lockedIds,
      debugPush,
      {
        ratingTarget: ratingRequirement?.target ?? null,
        pivot: solvedValuePivot,
        seed: contextSeed,
        requiredInforms: informBounds?.min ?? 0,
        requiredSpecials: specialBounds?.min ?? 0,
        chemistryRequired,
        slotsForChemistry,
        chemistryTargets,
        initialChemistry: chemistry,
        signature,
        timeBudgetMs: refineTimeBudgetMs,
        localTimeBudgetMs: refineLocalTimeBudgetMs,
        maxSingleIterations:
          conceptCountBeforeRefine > 0
            ? Math.max(
                toNumber(context?.optimize?.refineMaxSingleIterations) ?? 6,
                conceptCountBeforeRefine + 6,
              )
            : context?.optimize?.refineMaxSingleIterations ?? 6,
        pairSearchEnabled:
          context?.optimize?.refinePairSearchEnabled !== false,
        pairCandidateLimit:
          context?.optimize?.refinePairCandidateLimit ?? 16,
        window: context?.optimize?.refineWindow ?? 6,
        balancedReshapeEnabled:
          context?.optimize?.refineBalancedReshape === true ||
          lowRatingConservation.enabled,
        maxCandidates:
          context?.optimize?.refineMaxCandidates ??
          (signature?.isCompositionPuzzle ? 60 : 60),
        maxEvaluations:
          context?.optimize?.refineMaxEvaluations ??
          (lowRatingConservation.enabled
            ? 420
            : signature?.isCompositionPuzzle
              ? 220
              : 220),
      },
    );
    timingsMs.refine = Date.now() - refineStart;
    refinement = {
      ran: Boolean(refineResult?.ran),
      changed: Boolean(refineResult?.changed),
      before: refineResult?.before ?? null,
      after: refineResult?.after ?? null,
      singleSwaps: refineResult?.singleSwaps ?? 0,
      pairEscapes: refineResult?.pairEscapes ?? 0,
      reshapeTriggered: Boolean(refineResult?.reshapeTriggered),
      reshapeReason: refineResult?.reshapeReason ?? null,
      reshapeChanged: Boolean(refineResult?.reshapeChanged),
      reshapeCandidatesEvaluated:
        refineResult?.reshapeCandidatesEvaluated ?? 0,
      elapsedMs: refineResult?.elapsedMs ?? timingsMs.refine,
    };
    if (refineResult?.changed) {
      squad = refineResult.squad;
      chemistry = chemistryRequired
        ? refineResult?.chemistry ??
          computeChemistryEval(squad, slotsForChemistry, squadSize)
        : null;
      failingRequirements = buildFailingRequirements(squad, chemistry);
      solved = failingRequirements.length === 0;
    }
  }

  if (
    solved &&
    context?.optimize?.conserveSolvedSquad !== false &&
    (noRatingConservation.enabled || lowRatingConservation.enabled)
  ) {
    const conservationProfile = lowRatingConservation.enabled
      ? lowRatingConservation
      : noRatingConservation;
    const conservationStart = Date.now();
    const conservationTimeBudgetMs =
      toNumber(context?.optimize?.conservationTimeBudgetMs) ??
      (lowRatingConservation.enabled ? 1200 : 500);
    const conservationResult = optimizeSolvedConservationSquad(
      squad,
      normalizedPlayers,
      rules,
      squadSize,
      lockedIds,
      debugPush,
      {
        profile: conservationProfile,
        ratingTarget: ratingRequirement?.target ?? null,
        pivot: solvedValuePivot,
        requiredInforms: informBounds?.min ?? 0,
        requiredSpecials: specialBounds?.min ?? 0,
        chemistryRequired,
        slotsForChemistry,
        chemistryTargets,
        initialChemistry: chemistry,
        signature,
        timeBudgetMs: conservationTimeBudgetMs,
        maxEvaluations:
          context?.optimize?.conservationMaxEvaluations ??
          (lowRatingConservation.enabled ? 2200 : 700),
        maxGroups: context?.optimize?.conservationMaxGroups ?? 32,
        maxReplacementCandidates:
          context?.optimize?.conservationMaxReplacementCandidates ?? 46,
      },
    );
    timingsMs.conservation = Date.now() - conservationStart;
    conservation = {
      ran: Boolean(conservationResult?.ran),
      changed: Boolean(conservationResult?.changed),
      before: conservationResult?.before ?? null,
      after: conservationResult?.after ?? null,
      mode: conservationResult?.mode ?? null,
      outIds: conservationResult?.outIds ?? [],
      inIds: conservationResult?.inIds ?? [],
      evaluations: conservationResult?.evaluations ?? 0,
      elapsedMs: conservationResult?.elapsedMs ?? timingsMs.conservation,
    };
    if (conservationResult?.changed) {
      squad = conservationResult.squad;
      chemistry = chemistryRequired
        ? conservationResult?.chemistry ??
          computeChemistryEval(squad, slotsForChemistry, squadSize)
        : null;
      failingRequirements = buildFailingRequirements(squad, chemistry);
      solved = failingRequirements.length === 0;
    }
  }

  // Chemistry can be extremely sensitive to which clubs are in the squad.
  // If our local chemistry swap pass gets stuck, do a small "club set" search by swapping one club
  // in/out and re-running the solver on a restricted player pool. This helps escape local minima.
  if (
    !solved &&
    chemistryRequired &&
    chemistryTargets?.total != null &&
    isOnlyChemistryFailing(failingRequirements) &&
    context?.optimize?.chemClubSearch !== false &&
    !isSolverDeadlineExpired()
  ) {
    const clubBounds = getUniqueCountRequirementBounds(
      rules,
      "club_count",
      squadSize,
    );
    const finiteClubMax =
      Number.isFinite(clubBounds.max) && clubBounds.max < Infinity
        ? clubBounds.max
        : null;
    const baseClubs = new Set(
      squad.map((player) => player?.teamId).filter((v) => v != null),
    );
    const baseClubCount = baseClubs.size;
    const openSearchMaxClubs = Math.max(
      2,
      toNumber(context?.optimize?.chemClubSearchOpenMaxClubs) ?? 8,
    );
    const openSearchMaxExtraClubs = Math.max(
      0,
      toNumber(context?.optimize?.chemClubSearchMaxExtraClubs) ?? 1,
    );
    const openClubCap = Math.min(
      Math.max(baseClubCount, openSearchMaxClubs),
      baseClubCount + openSearchMaxExtraClubs,
    );
    const clubSetCap = finiteClubMax ?? openClubCap;
    const clubSearchMax = Math.max(
      2,
      toNumber(context?.optimize?.chemClubSearchMaxClubs) ?? 8,
    );
    const canSearch =
      baseClubCount >= 1 &&
      clubSetCap >= 2 &&
      clubSetCap <= clubSearchMax &&
      Array.isArray(slotsForChemistry) &&
      slotsForChemistry.length >= squadSize;

    if (canSearch) {
      const requiredPositions = extractRequiredPositionSet(
        slotsForChemistry,
        squadSize,
      );
      const requiredNationIds = new Set(
        rules
          .filter((rule) => rule?.type === "nation_id" && rule.op === "min")
          .flatMap((rule) => getRuleValues(rule))
          .map(toNumber)
          .filter((v) => v != null),
      );
      const requiredClubIds = new Set(
        rules
          .filter((rule) => rule?.type === "club_id" && rule.op === "min")
          .flatMap((rule) => getRuleValues(rule))
          .map(toNumber)
          .filter((v) => v != null),
      );

      const clubStats = buildClubStats(
        normalizedPlayers,
        requiredPositions,
        requiredNationIds,
      );
      const candidateClubs = getClubCandidateList(clubStats, {
        maxCandidates: context?.optimize?.chemClubSearchClubCandidates ?? 70,
        includeClubIds: Array.from(requiredClubIds),
      });

      const chemTarget = toNumber(chemistryTargets.total) ?? null;
      const getChemShortfall = (result) => {
        if (chemTarget == null) return Infinity;
        const totalChem = toNumber(result?.stats?.chemistry?.totalChem) ?? 0;
        return Math.max(0, chemTarget - totalChem);
      };

      const baseShortfall = getChemShortfall({
        stats: { chemistry: { totalChem: chemistry?.totalChem ?? 0 } },
      });
      if (baseClubs.size && baseClubs.size <= clubSetCap) {
        const maxSteps = Math.max(
          1,
          toNumber(context?.optimize?.chemClubSearchSteps) ?? 8,
        );
        let currentClubs = new Set(baseClubs);
        let currentShortfall = baseShortfall;

        let bestFound = null;

        const runRestrictedSolve = (clubSet, debug) => {
          if (isSolverDeadlineExpired()) return null;
          const allowed = clubSet instanceof Set ? clubSet : new Set();
          const restrictedPlayers = (normalizedPlayers || []).filter(
            (player) => {
              const clubId = player?.teamId ?? null;
              if (clubId == null) return false;
              return allowed.has(clubId);
            },
          );
          if (restrictedPlayers.length < squadSize) return null;

          return runPipeline(
            {
              ...context,
              players: restrictedPlayers,
              debug: Boolean(debug),
              optimize: {
                ...(context?.optimize || {}),
                chemClubSearch: false,
                solverDeadlineAt,
              },
            },
            contextSeed,
            context?.phaseConfig ?? null,
          );
        };

        const debugWanted = Boolean(context?.debug);

        for (let step = 0; step < maxSteps; step += 1) {
          if (isSolverDeadlineExpired()) break;
          if (currentShortfall <= 0) break;

          let bestNeighbor = null;

          const outClubs = Array.from(currentClubs);
          const allowAdd = currentClubs.size < clubSetCap;

          const nextClubSets = [];
          const nextClubSetKeys = new Set();
          const pushNextClubSet = (set) => {
            if (!(set instanceof Set)) return;
            const key = Array.from(set).sort((a, b) => a - b).join(",");
            if (!key || nextClubSetKeys.has(key)) return;
            nextClubSetKeys.add(key);
            nextClubSets.push(set);
          };

          // Replacement neighbors.
          for (const outClub of outClubs) {
            for (const inClub of candidateClubs) {
              if (currentClubs.has(inClub)) continue;
              const next = new Set(currentClubs);
              next.delete(outClub);
              next.add(inClub);
              if (next.size > clubSetCap) continue;
              pushNextClubSet(next);
            }
          }

          // Addition neighbors if we haven't hit the max unique clubs.
          if (allowAdd) {
            for (const inClub of candidateClubs) {
              if (currentClubs.has(inClub)) continue;
              const next = new Set(currentClubs);
              next.add(inClub);
              if (next.size > clubSetCap) continue;
              pushNextClubSet(next);
            }
          }

          // Evaluate neighbors. Keep only those that fail chemistry only.
          for (const nextClubs of nextClubSets) {
            if (isSolverDeadlineExpired()) break;
            const res = runRestrictedSolve(nextClubs, false);
            if (!res) continue;
            const failing = Array.isArray(res.failingRequirements)
              ? res.failingRequirements
              : [];
            if (failing.length && !isOnlyChemistryFailing(failing)) continue;

            if (res?.stats?.solved) {
              bestFound = debugWanted
                ? runRestrictedSolve(nextClubs, true)
                : res;
              break;
            }

            const shortfall = getChemShortfall(res);
            if (shortfall >= currentShortfall) continue;
            if (!bestNeighbor || shortfall < bestNeighbor.shortfall) {
              bestNeighbor = { clubs: nextClubs, shortfall };
            }
          }

          if (bestFound?.stats?.solved) break;
          if (!bestNeighbor) break;

          currentClubs = bestNeighbor.clubs;
          currentShortfall = bestNeighbor.shortfall;
        }

        if (bestFound?.stats?.solved) {
          return bestFound;
        }
      }
    }
  }

  if (hasDuplicateDefinitions(squad, squadSize)) {
    const finalCleanupReplaced = enforceUniqueDefinitions(
      squad,
      pool,
      rules,
      squadSize,
      debugPush,
      {
        lockedIds: preservedSeedIds,
        chemistryRequired,
        slotsForChemistry,
        chemistryTargets,
        currentChemistry: chemistry,
      },
    );
    if (finalCleanupReplaced > 0) {
      if (chemistryRequired) {
        chemistry = computeChemistryEval(squad, slotsForChemistry, squadSize);
      }
      failingRequirements = buildFailingRequirements(squad, chemistry);
      solved =
        failingRequirements.length === 0 &&
        !hasDuplicateDefinitions(squad, squadSize);
      debugPush?.({
        stage: "dedupe",
        action: "post_optimize_summary",
        replaced: finalCleanupReplaced,
        remainingDefinitionIds: getDuplicateDefinitionKeys(squad, squadSize),
      });
    } else {
      solved = false;
    }
  }

  solved =
    failingRequirements.length === 0 &&
    !hasDuplicateDefinitions(squad, squadSize);

  const slotSolution =
    chemistryRequired && chemistry && slotsForChemistry.length >= squadSize
      ? (() => {
          const fieldSlotIndices = slotsForChemistry
            .slice(0, squadSize)
            .map((slot) => slot.slotIndex);
          const fieldSlotToPlayerId = (chemistry.slotToPlayerIndex || []).map(
            (index) => {
              const player = squad[index] ?? null;
              return player?.id ?? null;
            },
          );
          return {
            fieldSlotIndices,
            fieldSlotToPlayerId,
            totalChem: chemistry.totalChem,
            minChem: chemistry.minChem,
            perPlayerChem: chemistry.perSlotChem,
            onPosition: chemistry.onPosition,
          };
        })()
      : null;

  timingsMs.total = Date.now() - startedAt;
  const storageUsage = getStorageUsageMetrics(squad, squadSize);
  const conceptUsage = getConceptUsageMetrics(squad.slice(0, squadSize));
  const conceptPlayersUsed = squad
    .slice(0, squadSize)
    .filter(isConceptPlayer)
    .map((player) => ({
      id: player?.id ?? null,
      conceptId: player?.conceptId ?? null,
      definitionId: player?.definitionId ?? null,
      assetId: player?.assetId ?? null,
      name: player?.name ?? player?.commonName ?? null,
      rating: player?.rating ?? null,
      position:
        player?.preferredPositionName ??
        player?.preferredPositionId ??
        null,
      leagueId: player?.leagueId ?? null,
      nationId: player?.nationId ?? null,
      teamId: player?.teamId ?? null,
      rarityId: player?.rarityId ?? null,
      price: getPlayerMarketPrice(player),
      priceMissing:
        getPlayerMarketPrice(player) == null &&
        !player?.isExtinct &&
        !player?.priceMeta?.isExtinct,
      isExtinct: Boolean(player?.isExtinct || player?.priceMeta?.isExtinct),
    }));
  const solvedValue = solved
    ? getSolvedSquadValueMetrics(
        squad,
        pool,
        ratingRequirement?.target ?? null,
        {
          pivot: solvedValuePivot,
          requiredInforms: informBounds?.min ?? 0,
          requiredSpecials: specialBounds?.min ?? 0,
          signature,
        },
      )
    : null;
  const compositionSnapshot = buildCompositionSnapshot(squad, squadSize);
  const scopeAnalysisStats = {
    solved,
    playerCount: normalizedPlayers.length,
    filteredPlayerCount: pool.length,
    squadSize,
    squadRating: getSquadRating(squad),
    ratingTarget: ratingRequirement?.target ?? null,
    chemistryTargets: chemistryRequired ? chemistryTargets : null,
    chemistry: chemistryRequired
      ? {
          totalChem: chemistry?.totalChem ?? null,
          minChem: chemistry?.minChem ?? null,
          onPositionCount: chemistry?.onPositionCount ?? null,
      }
      : null,
  };
  const shouldBuildScopeAnalysis =
    context?.optimize?.scopeAnalysis !== false && solverDeadlineAt == null;
  const scopeAnalysis = shouldBuildScopeAnalysis
    ? buildScopeAnalysis({
        context,
        signature,
        failingRequirements,
        squad,
        squadSize,
        chemistry,
        slotsForChemistry,
        stats: scopeAnalysisStats,
        compositionSnapshot,
        rules,
      })
    : null;

  return {
    solved,
    submitReady: solved ? conceptUsage.conceptCount === 0 : false,
    requiresConcepts: conceptUsage.conceptCount > 0,
    conceptPlayersUsed,
    solutions: solved
      ? [
          slotSolution?.fieldSlotToPlayerId?.filter((id) => id != null)
            .length === squadSize
            ? slotSolution.fieldSlotToPlayerId
            : squad.map((player) => player.id),
        ]
      : [],
    solutionSlots: slotSolution ? [slotSolution] : [],
    failingRequirements,
    stats: {
      solverVersion: SOLVER_VERSION,
      playerCount: normalizedPlayers.length,
      filteredPlayerCount: pool.length,
      squadSize,
      solved,
      averageRating: roundTo(getSquadAverageRating(squad), 2),
      adjustedAverage: roundTo(getSquadAdjustedAverage(squad), 2),
      squadRating: getSquadRating(squad),
      ratingTarget: ratingRequirement?.target ?? null,
      noRatingConservation: noRatingConservation.enabled
        ? {
            pivot: noRatingConservation.pivot,
            softMaxRating: noRatingConservation.softMaxRating,
            wasteMaxRating: noRatingConservation.wasteMaxRating,
          }
        : null,
      lowRatingConservation: lowRatingConservation.enabled
        ? {
            pivot: lowRatingConservation.pivot,
            softMaxRating: lowRatingConservation.softMaxRating,
            wasteMaxRating: lowRatingConservation.wasteMaxRating,
            ratingTarget: lowRatingConservation.ratingTarget,
          }
        : null,
      storageUsage,
      conceptUsage,
      conceptCount: conceptUsage.conceptCount,
      submitReady: solved ? conceptUsage.conceptCount === 0 : false,
      requiresConcepts: conceptUsage.conceptCount > 0,
      conceptPlayersUsed,
      timingsMs,
      chemistryTargets: chemistryRequired ? chemistryTargets : null,
      chemistry: chemistryRequired
        ? {
            totalChem: chemistry?.totalChem ?? null,
            minChem: chemistry?.minChem ?? null,
            onPositionCount: chemistry?.onPositionCount ?? null,
          }
        : null,
      appliedFilters,
      debugEnabled,
      debugLog,
      refinement,
      conservation,
      solvedValue,
      debugSquad: debugEnabled
        ? squad.map((player) => ({
            id: player?.id ?? null,
            definitionId: player?.definitionId ?? null,
            rating: player?.rating ?? null,
            nationId: player?.nationId ?? null,
            leagueId: player?.leagueId ?? null,
            teamId: player?.teamId ?? null,
            rarityName: player?.rarityName ?? null,
            isStorage: Boolean(player?.isStorage),
            hasStorageDuplicate: Boolean(player?.hasStorageDuplicate),
            hasClubDuplicate: Boolean(player?.hasClubDuplicate),
            isConcept: isConceptPlayer(player),
            alternativePositionNames: player?.alternativePositionNames ?? null,
          }))
        : null,
      ignoredRequirementCount: ignoredRequirements.length,
      requirementFlags,
      constraintSummary: compiledConstraints.summary,
      scopeAnalysis,
    },
    _scopeSquad:
      shouldBuildScopeAnalysis || debugEnabled
        ? squad.slice(0, squadSize).map((player) => ({
            id: player?.id ?? null,
            rating: player?.rating ?? null,
            leagueId: player?.leagueId ?? null,
            nationId: player?.nationId ?? null,
            teamId: player?.teamId ?? null,
            rarityId: player?.rarityId ?? null,
            rarityName: player?.rarityName ?? null,
            quality: player?.quality ?? null,
            isSpecial: Boolean(player?.isSpecial),
            isTotwOrTots: Boolean(player?.isTotwOrTots),
            isConcept: isConceptPlayer(player),
            preferredPositionName: player?.preferredPositionName ?? null,
            preferredPositionId: player?.preferredPositionId ?? null,
            alternativePositionNames: player?.alternativePositionNames ?? null,
          }))
        : null,
    _scopeSlotsForChemistry:
      shouldBuildScopeAnalysis || debugEnabled ? slotsForChemistry : null,
    _scopeChemistryDetails:
      (shouldBuildScopeAnalysis || debugEnabled) && chemistry
        ? {
            totalChem: chemistry?.totalChem ?? null,
            minChem: chemistry?.minChem ?? null,
            onPositionCount: chemistry?.onPositionCount ?? null,
            perSlotChem: chemistry?.perSlotChem ?? null,
            onPosition: chemistry?.onPosition ?? null,
          }
        : null,
    seed: contextSeed,
    signature,
    phaseConfig: context?.phaseConfig ?? null,
    compositionSnapshot,
  };
};

export const solveSquad = (context) => {
  const baseContext = context && typeof context === "object" ? context : {};
  const players = Array.isArray(baseContext?.players) ? baseContext.players : [];

  const requirementFlags =
    baseContext?.requirementFlags ||
    getRequirementFlags(baseContext?.requirementsNormalized || []);
  const fallbackSquadSize = (() => {
    const fromContext = toNumber(baseContext?.requiredPlayers);
    if (fromContext != null && fromContext > 0) return fromContext;
    return DEFAULT_SQUAD_SIZE;
  })();
  const compiledConstraints = compileConstraintSet(
    baseContext?.requirementsNormalized || [],
    { fallbackSquadSize },
  );
  if (compiledConstraints.unsupportedRules.length) {
    throw new Error("Unsupported SBC requirements: " + compiledConstraints.unsupportedRules.map(rule => rule.keyName ?? rule.label ?? rule.key ?? "unknown").join(", "));
  }
  if (!players.length) {
    return runPipeline(baseContext, null, null);
  }
  const rules = normalizeRules(
    baseContext?.requirementsNormalized || [],
    requirementFlags,
    null,
    compiledConstraints,
  );
  const normalizedPlayers = normalizePlayers(players);
  const squadSize = getSquadSize(rules, fallbackSquadSize);
  const signature = buildChallengeSignature(rules, squadSize);
  const noRatingConservation = getNoRatingConservationProfile(
    rules,
    squadSize,
    signature,
  );
  const lowRatingConservation = getLowRatingConservationProfile(
    rules,
    squadSize,
    signature,
  );
  const highChemShape = classifyHighChemShape(
    signature,
    rules,
    squadSize,
    baseContext,
  );
  const baselinePhaseConfig = getBaselinePhaseConfig(
    baseContext?.optimize || {},
  );
  const fallbackPhaseConfig = getPhaseConfig(
    signature,
    baseContext?.optimize || {},
  );
  if (noRatingConservation.enabled || lowRatingConservation.enabled) {
    if (baseContext?.optimize?.refineSolvedSquad == null) {
      baselinePhaseConfig.optimize.refineSolvedSquad = true;
      fallbackPhaseConfig.optimize.refineSolvedSquad = true;
    }
    if (baseContext?.optimize?.refineTimeBudgetMs == null) {
      const minimumRefineBudgetMs = lowRatingConservation.enabled ? 700 : 250;
      baselinePhaseConfig.optimize.refineTimeBudgetMs = Math.max(
        toNumber(baselinePhaseConfig.optimize.refineTimeBudgetMs) ?? 0,
        minimumRefineBudgetMs,
      );
      fallbackPhaseConfig.optimize.refineTimeBudgetMs = Math.max(
        toNumber(fallbackPhaseConfig.optimize.refineTimeBudgetMs) ?? 0,
        minimumRefineBudgetMs,
      );
    }
    if (lowRatingConservation.enabled) {
      if (baseContext?.optimize?.refineBalancedReshape == null) {
        baselinePhaseConfig.optimize.refineBalancedReshape = true;
        fallbackPhaseConfig.optimize.refineBalancedReshape = true;
      }
      baselinePhaseConfig.optimize.refineMaxSingleIterations = Math.max(
        toNumber(baselinePhaseConfig.optimize.refineMaxSingleIterations) ?? 0,
        8,
      );
      fallbackPhaseConfig.optimize.refineMaxSingleIterations = Math.max(
        toNumber(fallbackPhaseConfig.optimize.refineMaxSingleIterations) ?? 0,
        8,
      );
      baselinePhaseConfig.optimize.refinePairCandidateLimit = Math.max(
        toNumber(baselinePhaseConfig.optimize.refinePairCandidateLimit) ?? 0,
        34,
      );
      fallbackPhaseConfig.optimize.refinePairCandidateLimit = Math.max(
        toNumber(fallbackPhaseConfig.optimize.refinePairCandidateLimit) ?? 0,
        34,
      );
      baselinePhaseConfig.optimize.refineMaxCandidates = Math.max(
        toNumber(baselinePhaseConfig.optimize.refineMaxCandidates) ?? 0,
        130,
      );
      fallbackPhaseConfig.optimize.refineMaxCandidates = Math.max(
        toNumber(fallbackPhaseConfig.optimize.refineMaxCandidates) ?? 0,
        130,
      );
    }
  }
  if (
    signature?.isCompositionPuzzle &&
    baseContext?.optimize?.chemClubSearch == null
  ) {
    baselinePhaseConfig.optimize.chemClubSearch = false;
    fallbackPhaseConfig.optimize.chemClubSearch = false;
  }
  const highChemLeagueNationSpread = Boolean(
    (toNumber(signature?.totalChemistryTarget) ?? 0) >= 31 &&
      (toNumber(signature?.leagueCountMin) ?? 0) >= 5 &&
      (toNumber(signature?.nationCountMin) ?? 0) >= 5,
  );
  const restartTimeBudgetMs = Math.max(
    1000,
    toNumber(baseContext?.optimize?.restartTimeBudgetMs) ??
      (highChemLeagueNationSpread ? 30000 : DEFAULT_RESTART_TIME_BUDGET_MS),
  );
  const fallbackTimeBudgetMs = Math.max(
    0,
    toNumber(baseContext?.optimize?.fallbackTimeBudgetMs) ??
      (signature?.isCompositionPuzzle ? 3000 : 1500),
  );

  const cacheKey = buildWinningSeedCacheKey(baseContext, signature);
  const cachedSeedKey = cacheKey ? WINNING_SEED_CACHE.get(cacheKey) ?? null : null;

  const failureMemory = [];
  const triedSeedKeys = new Set();
  const orchestration = {
    signature,
    phaseConfig: baselinePhaseConfig,
    fallbackPhaseConfig,
    baselineSeeds: [],
    rescueSeeds: [],
    winningSeed: null,
    perSeed: [],
    highChem: {
      shape: summarizeHighChemShape(highChemShape),
      seedPlan: [],
      rescueReason: null,
      attempts: [],
    },
  };
  const deadlineAt = Date.now() + restartTimeBudgetMs;
  let activeDeadlineAt = deadlineAt;
  let bestResult = null;
  let bestSolvedSeedKey = null;

  const cacheWinningSeed = () => {
    if (
      cacheKey &&
      bestSolvedSeedKey &&
      orchestration?.winningSeed?.type !== "baseline"
    ) {
      WINNING_SEED_CACHE.set(cacheKey, bestSolvedSeedKey);
    }
  };

  const shouldKeepSearchingSolved = (result) =>
    Boolean(
      result?.stats?.solved &&
        ((noRatingConservation.enabled &&
          !baseContext?.optimize?.disableNoRatingConservationRetries &&
          isNoRatingSolvedResultWasteful(result, noRatingConservation)) ||
          (lowRatingConservation.enabled &&
            !baseContext?.optimize?.disableLowRatingConservationRetries &&
            isLowRatingSolvedResultWasteful(result, lowRatingConservation))) &&
        Date.now() < activeDeadlineAt,
    );

  const withFinalScopeAnalysis = (result) => {
    if (!result || typeof result !== "object") return result;
    if (result?.stats?.scopeAnalysis) return result;
    const idToPlayer = new Map(
      normalizedPlayers
        .filter((player) => player?.id != null)
        .map((player) => [String(player.id), player]),
    );
    const solutionIds = Array.isArray(result?.solutions?.[0])
      ? result.solutions[0]
      : [];
    const squad = solutionIds
      .map((id) => idToPlayer.get(String(id)) ?? null)
      .filter(Boolean);
    const diagnosticSquad = squad.length
      ? squad
      : Array.isArray(result?._scopeSquad)
        ? result._scopeSquad
        : [];
    const finalSquadSize = toNumber(result?.stats?.squadSize) ?? squadSize;
    const slotsForChemistry = Array.isArray(result?._scopeSlotsForChemistry)
      ? result._scopeSlotsForChemistry
      : normalizeSlotsForChemistry(baseContext?.squadSlots, finalSquadSize);
    const slotSolution = Array.isArray(result?.solutionSlots)
      ? result.solutionSlots[0]
      : null;
    const chemistryDetails = result?._scopeChemistryDetails || null;
    const chemistry =
      result?.stats?.chemistry || slotSolution || chemistryDetails
        ? {
            ...(result?.stats?.chemistry || {}),
            perSlotChem: Array.isArray(slotSolution?.perPlayerChem)
              ? slotSolution.perPlayerChem
              : chemistryDetails?.perSlotChem ?? null,
            onPosition: Array.isArray(slotSolution?.onPosition)
              ? slotSolution.onPosition
              : chemistryDetails?.onPosition ?? null,
          }
        : null;
    const {
      _scopeSquad,
      _scopeSlotsForChemistry,
      _scopeChemistryDetails,
      ...cleanResult
    } = result;
    return {
      ...cleanResult,
      stats: {
        ...result.stats,
        scopeAnalysis: buildScopeAnalysis({
          context: baseContext,
          signature,
          failingRequirements: result?.failingRequirements || [],
          squad: diagnosticSquad,
          squadSize: finalSquadSize,
          chemistry,
          slotsForChemistry,
          stats: result?.stats || {},
          compositionSnapshot: result?.compositionSnapshot || null,
          rules,
        }),
      },
    };
  };

  const finishSolvedIfEfficient = (result) => {
    if (!result?.stats?.solved) return null;
    if (shouldKeepSearchingSolved(result)) return null;
    cacheWinningSeed();
    return attachOrchestrationSummary(
      withFinalScopeAnalysis(bestResult),
      orchestration,
      restartTimeBudgetMs,
    );
  };

  const runConservationCapsFor = (result, activePhaseConfig) => {
    if (!shouldKeepSearchingSolved(result)) return null;
    const capSeeds = noRatingConservation.enabled
      ? createNoRatingConservationCapSeeds(
          result,
          noRatingConservation,
          triedSeedKeys,
        )
      : createLowRatingConservationCapSeeds(
          result,
          lowRatingConservation,
          triedSeedKeys,
        );
    for (const capSeed of capSeeds) {
      if (Date.now() >= activeDeadlineAt) break;
      const capKey = buildSeedKey(capSeed);
      triedSeedKeys.add(capKey);
      const ratingCap = toNumber(capSeed?.ratingCap);
      const cappedPlayers =
        ratingCap == null
          ? players
          : players.filter((player) => (toNumber(player?.rating) ?? 0) <= ratingCap);
      if (cappedPlayers.length < squadSize) continue;
      const remainingBudgetRaw = Math.max(500, activeDeadlineAt - Date.now());
      const remainingBudget =
        capSeed?.family === "low_rating_conservation"
          ? Math.min(2500, remainingBudgetRaw)
          : remainingBudgetRaw;
      const capResult = solveSquad({
        ...baseContext,
        players: cappedPlayers,
        optimize: {
          ...(baseContext?.optimize || {}),
          disableNoRatingConservationRetries: true,
          disableLowRatingConservationRetries: true,
          restartTimeBudgetMs: remainingBudget,
          fallbackTimeBudgetMs: Math.min(
            remainingBudget,
            capSeed?.family === "low_rating_conservation"
              ? 800
              : Math.max(
                  0,
                  toNumber(baseContext?.optimize?.fallbackTimeBudgetMs) ?? 1500,
                ),
          ),
        },
      });
      const failureSummary = summarizeFailure(
        capResult,
        capSeed,
        signature,
        activePhaseConfig,
      );
      orchestration.perSeed.push({
        seed: {
          type: capSeed?.type ?? "no_rating_conservation_cap",
          axis: capSeed?.axis ?? null,
          groupId: capSeed?.groupId ?? null,
          tier: capSeed?.tier ?? 0,
          family: capSeed?.family ?? null,
          reason: capSeed?.reason ?? null,
        },
        solved: Boolean(capResult?.stats?.solved),
        failureSummary,
      });
      capResult.seed = capSeed;
      capResult.signature = signature;
      capResult.phaseConfig = activePhaseConfig ?? null;
      if (!bestResult || compareSolverResults(capResult, bestResult) < 0) {
        bestResult = capResult;
        if (capResult?.stats?.solved) {
          bestSolvedSeedKey = capKey;
          orchestration.winningSeed = {
            type: capSeed?.type ?? "no_rating_conservation_cap",
            axis: capSeed?.axis ?? null,
            groupId: capSeed?.groupId ?? null,
            tier: capSeed?.tier ?? 0,
            family: capSeed?.family ?? null,
            reason: capSeed?.reason ?? null,
          };
        }
      }
      const done = finishSolvedIfEfficient(capResult);
      if (done) return done;
    }
    return null;
  };

  const finishSolvedAfterConservation = (result, capDone) => {
    if (capDone) return capDone;
    if (!result?.stats?.solved) return null;
    if (shouldKeepSearchingSolved(result)) return null;
    cacheWinningSeed();
    return attachOrchestrationSummary(
      withFinalScopeAnalysis(bestResult),
      orchestration,
      restartTimeBudgetMs,
    );
  };

  const runSeed = (seed, activePhaseConfig) => {
    const key = buildSeedKey(seed);
    if (triedSeedKeys.has(key)) return null;
    triedSeedKeys.add(key);
    const phaseConfigWithDeadline = {
      ...(activePhaseConfig || {}),
      optimize: {
        ...((activePhaseConfig && activePhaseConfig.optimize) || {}),
        solverDeadlineAt: activeDeadlineAt,
      },
    };
    const result = runPipeline(
      {
        ...baseContext,
        requirementFlags,
        signature,
      },
      seed,
      phaseConfigWithDeadline,
    );
    const failureSummary = summarizeFailure(
      result,
      seed,
      signature,
      activePhaseConfig,
    );
    if (!result?.stats?.solved) {
      failureMemory.push(failureSummary);
    }
    orchestration.perSeed.push({
      seed: {
        type: seed?.type ?? "baseline",
        axis: seed?.axis ?? null,
        groupId: seed?.groupId ?? null,
        tier: seed?.tier ?? 0,
        family: seed?.family ?? null,
        reason: seed?.reason ?? null,
      },
      solved: Boolean(result?.stats?.solved),
      failureSummary,
    });
    if (highChemShape?.enabled && highChemShape?.isHighChem) {
      orchestration.highChem.attempts.push({
        seed: seed?.type ?? "baseline",
        family: seed?.family ?? null,
        reason: seed?.reason ?? null,
        solved: Boolean(result?.stats?.solved),
        chem: toNumber(result?.stats?.chemistry?.totalChem) ?? null,
        minChem: toNumber(result?.stats?.chemistry?.minChem) ?? null,
        chemShortfall: toNumber(failureSummary?.chemShortfall) ?? null,
        failingTypes: failureSummary?.failingTypes ?? [],
        rating: failureSummary?.rating ?? null,
      });
    }
    const seedSummary = {
      type: seed?.type ?? "baseline",
      axis: seed?.axis ?? null,
      groupId: seed?.groupId ?? null,
      tier: seed?.tier ?? 0,
      family: seed?.family ?? null,
      reason: seed?.reason ?? null,
    };
    if (!bestResult || compareSolverResults(result, bestResult) < 0) {
      bestResult = result;
      if (result?.stats?.solved) {
        bestSolvedSeedKey = key;
        orchestration.winningSeed = seedSummary;
      }
    }
    return result;
  };

  const baselineResult = runSeed(null, baselinePhaseConfig);
  const baselineDone = finishSolvedIfEfficient(baselineResult);
  if (baselineDone) return baselineDone;
  const baselineCapDone = runConservationCapsFor(
    baselineResult,
    fallbackPhaseConfig,
  );
  const baselineAfterConservation = finishSolvedAfterConservation(
    baselineResult,
    baselineCapDone,
  );
  if (baselineAfterConservation) return baselineAfterConservation;
  if (fallbackTimeBudgetMs > 0) {
    activeDeadlineAt = Math.max(deadlineAt, Date.now() + fallbackTimeBudgetMs);
  }
  if (Date.now() >= activeDeadlineAt) {
    return attachOrchestrationSummary(
      withFinalScopeAnalysis(bestResult),
      orchestration,
      restartTimeBudgetMs,
      Date.now() >= activeDeadlineAt,
    );
  }

  orchestration.phaseConfig = fallbackPhaseConfig;
  let seeds = generateBaselineSeeds(
    signature,
    normalizedPlayers,
    squadSize,
    baseContext,
    rules,
  ).filter(
    (seed) =>
      !(
        seed?.type === "baseline" &&
        seed?.axis == null &&
        seed?.groupId == null &&
        (seed?.tier ?? 0) === 0
      ),
  );
  if (cachedSeedKey) {
    seeds = seeds.sort((a, b) => {
      const aCached = buildSeedKey(a) === cachedSeedKey;
      const bCached = buildSeedKey(b) === cachedSeedKey;
      if (aCached === bCached) return 0;
      return aCached ? -1 : 1;
    });
  }
  orchestration.baselineSeeds = seeds.map((seed) => ({
    type: seed?.type ?? "baseline",
    axis: seed?.axis ?? null,
    groupId: seed?.groupId ?? null,
    tier: seed?.tier ?? 0,
    label: seed?.label ?? null,
    family: seed?.family ?? null,
    reason: seed?.reason ?? null,
  }));
  orchestration.highChem.seedPlan = orchestration.baselineSeeds
    .filter((seed) => seed.family != null)
    .map((seed) => ({
      type: seed.type,
      family: seed.family,
      reason: seed.reason,
      label: seed.label,
    }));

  for (const seed of seeds) {
    if (Date.now() >= activeDeadlineAt) {
      return attachOrchestrationSummary(
        withFinalScopeAnalysis(bestResult),
        orchestration,
        restartTimeBudgetMs,
        true,
      );
    }
    const result = runSeed(seed, fallbackPhaseConfig);
    const done = finishSolvedIfEfficient(result);
    if (done) return done;
    const capDone = runConservationCapsFor(result, fallbackPhaseConfig);
    const afterConservation = finishSolvedAfterConservation(result, capDone);
    if (afterConservation) return afterConservation;
  }

  const rescueSeeds = generateRescueSeeds(
    signature,
    failureMemory,
    normalizedPlayers,
    squadSize,
    baseContext,
    triedSeedKeys,
  );
  orchestration.highChem.rescueReason = getHighChemRescueReason(
    highChemShape,
    failureMemory,
  );
  orchestration.rescueSeeds = [
    ...(rescueSeeds?.tier1 || []),
    ...(rescueSeeds?.tier3 || []),
  ].map((seed) => ({
    type: seed?.type ?? "baseline",
    axis: seed?.axis ?? null,
    groupId: seed?.groupId ?? null,
    tier: seed?.tier ?? 0,
    label: seed?.label ?? null,
    family: seed?.family ?? null,
    reason: seed?.reason ?? null,
  }));

  for (const tierSeed of rescueSeeds?.tier1 || []) {
    if (Date.now() >= activeDeadlineAt) break;
    const result = runSeed(tierSeed, fallbackPhaseConfig);
    const done = finishSolvedIfEfficient(result);
    if (done) return done;
    const capDone = runConservationCapsFor(result, fallbackPhaseConfig);
    const afterConservation = finishSolvedAfterConservation(result, capDone);
    if (afterConservation) return afterConservation;
  }

  for (const tierSeed of rescueSeeds?.tier3 || []) {
    if (Date.now() >= activeDeadlineAt) break;
    const result = runSeed(tierSeed, fallbackPhaseConfig);
    const done = finishSolvedIfEfficient(result);
    if (done) return done;
    const capDone = runConservationCapsFor(result, fallbackPhaseConfig);
    const afterConservation = finishSolvedAfterConservation(result, capDone);
    if (afterConservation) return afterConservation;
  }

  cacheWinningSeed();
  return attachOrchestrationSummary(
    withFinalScopeAnalysis(bestResult),
    orchestration,
    restartTimeBudgetMs,
    Date.now() >= activeDeadlineAt,
  );
};

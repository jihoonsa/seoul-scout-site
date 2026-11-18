// Picking shop kinds from all 247 SEMAS kinds (store_meta.json): the rules behind "같이 볼 가게" (spec 5.3).
// Kind names exist only in Korean, so a search also matches the English group and trade names ("bakery" finds 빵/도넛).

export const MAX_EXTRA_KINDS = 3;
const RESULTS_SHOWN = 8;

// Up to 8 kinds (subtype indices) for a search: names starting with it, then names containing it, then kinds whose
// group or founder trade matches. Kinds in `exclude` never appear.
export function searchKinds(query, meta, exclude) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const tradeOf = tradeOfKind(meta);
  const found = [];
  meta.subtypes.forEach((name, kind) => {
    if (exclude.has(kind)) return;
    const rank = matchRank(needle, kind, meta, tradeOf);
    if (rank !== null) found.push({ kind, name, rank });
  });
  found.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko"));
  return found.slice(0, RESULTS_SHOWN).map((match) => match.kind);
}

// The kinds named in a shared link: known names only, no repeats, none of the main trade's own kinds, at most 3
export function kindsFromLink(names, meta, mainTrade) {
  const own = new Set(meta.trade_subtypes[mainTrade] ?? []);
  const kinds = [];
  for (const name of names) {
    const kind = meta.subtypes.indexOf(name);
    if (kind === -1 || own.has(kind) || kinds.includes(kind)) continue;
    kinds.push(kind);
    if (kinds.length === MAX_EXTRA_KINDS) break;
  }
  return kinds;
}

function matchRank(needle, kind, meta, tradeOf) {
  const name = meta.subtypes[kind].toLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.includes(needle)) return 1;
  const group = meta.groups[meta.subtype_groups[kind]];
  const trade = tradeOf.get(kind);
  const about = [group.ko, group.en, trade, meta.trade_names_en[trade]].filter(Boolean);
  return about.some((word) => word.toLowerCase().includes(needle)) ? 2 : null;
}

function tradeOfKind(meta) {
  const tradeOf = new Map();
  for (const [trade, kinds] of Object.entries(meta.trade_subtypes)) for (const kind of kinds) tradeOf.set(kind, trade);
  return tradeOf;
}

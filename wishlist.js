// "Find by wishlist": the founder ticks what matters to them, and we list the neighborhoods that meet all of it.
// Every condition is relative to Seoul: "many" means the top third of the 424 neighborhoods, "low" means below the
// Seoul median. Conditions about competition and sales use the chosen trade when there is one.

const TOP_THIRD = 2 / 3;
const WEEKEND_BUSIER = 1.05;                // weekend crowd at least 5% above the weekday crowd
const RENT_FAR_KM = 2;                      // same as app.js: beyond this the rent survey says little (D44)

export const CRITERIA = [
  { key: "busy", group: "customers" },
  { key: "young", group: "customers" },
  { key: "families", group: "customers" },
  { key: "seniors", group: "customers" },
  { key: "weekend", group: "customers" },
  { key: "cheapRent", group: "risk" },
  { key: "fewClosures", group: "risk" },
  { key: "fewRivals", group: "trade" },
  { key: "goodSales", group: "trade", needsTrade: true },
];

// Seoul reference values the conditions compare with, computed once
export function wishlistReferences(dongs) {
  const known = (values) => values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  const at = (values, share) => { const sorted = known(values); return sorted[Math.floor(share * (sorted.length - 1))]; };
  const familyShare = (dong) => (dong.info.wd_day_share_0_19 ?? 0) + (dong.info.wd_day_share_35_49 ?? 0);
  return {
    crowd: at(dongs.map((d) => d.kpi.lp_wd_day), TOP_THIRD),
    young: at(dongs.map((d) => d.info.wd_day_share_20_34), TOP_THIRD),
    families: at(dongs.map(familyShare), TOP_THIRD),
    seniors: at(dongs.map((d) => d.info.wd_day_share_65p), TOP_THIRD),
    rent: at(dongs.filter((d) => d.info.rent_area_km <= RENT_FAR_KM).map((d) => d.kpi.rent_small_shop), 0.5),
    closeAll: at(dongs.map((d) => d.kpi.close_rate_total), 0.5),
    shopsPerVisitor: at(dongs.map((d) => d.kpi.stores_per_1k_wd_day), 0.5),
    familyShare,
  };
}

// Does a neighborhood meet one condition? tradeMedians: { sales, close } of the chosen trade
export function meets(key, dong, trade, refs, tradeMedians) {
  const values = trade ? dong.trades[trade] ?? {} : {};
  switch (key) {
    case "busy": return dong.kpi.lp_wd_day >= refs.crowd;
    case "young": return (dong.info.wd_day_share_20_34 ?? 0) >= refs.young;
    case "families": return refs.familyShare(dong) >= refs.families;
    case "seniors": return (dong.info.wd_day_share_65p ?? 0) >= refs.seniors;
    case "weekend": return (dong.info.weekend_weekday_ratio ?? 0) >= WEEKEND_BUSIER;
    case "cheapRent": return dong.info.rent_area_km <= RENT_FAR_KM && dong.kpi.rent_small_shop <= refs.rent;
    case "fewClosures":
      if (!trade) return dong.kpi.close_rate_total <= refs.closeAll;
      return values.close_rate !== null && values.close_rate !== undefined && values.close_rate <= tradeMedians.close;
    case "fewRivals":
      if (!trade) return dong.kpi.stores_per_1k_wd_day <= refs.shopsPerVisitor;
      return values.resid !== null && values.resid !== undefined && values.resid <= -1;
    case "goodSales":
      return Boolean(trade) && Boolean(values.sales_per_shop) && values.sales_per_shop >= tradeMedians.sales;
    default: return false;
  }
}

// Neighborhoods meeting every chosen condition, and those missing exactly one (shown when few meet all).
// With a trade the ones with the most room for it come first; without one, the busiest first.
export function findMatches(dongs, keys, trade, refs, tradeMedians) {
  const order = trade
    ? (a, b) => (a.dong.trades[trade]?.resid ?? 0) - (b.dong.trades[trade]?.resid ?? 0)
    : (a, b) => b.dong.kpi.lp_wd_day - a.dong.kpi.lp_wd_day;
  const scored = dongs.map((dong) => {
    const missing = keys.filter((key) => !meets(key, dong, trade, refs, tradeMedians));
    return { dong, missing };
  });
  return {
    matches: scored.filter((s) => s.missing.length === 0).sort(order),
    nearMisses: keys.length > 1 ? scored.filter((s) => s.missing.length === 1).sort(order) : [],
  };
}

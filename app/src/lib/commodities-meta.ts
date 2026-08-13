// Front-end grouping + flavor for the 23 agricultural markets (all "Agricultural" on-chain).
export type Group = "Grains" | "Oilseeds" | "Softs" | "Dairy" | "Materials" | "Industrial";

export const GROUPS: Group[] = ["Grains", "Oilseeds", "Softs", "Dairy", "Materials", "Industrial"];

const META: Record<string, { group: Group; glyph: string }> = {
  CORN: { group: "Grains", glyph: "🌽" },
  WHEAT: { group: "Grains", glyph: "🌾" },
  RICE: { group: "Grains", glyph: "🍚" },
  OAT: { group: "Grains", glyph: "🥣" },
  BARLEY: { group: "Grains", glyph: "🌾" },
  SOYBEANS: { group: "Oilseeds", glyph: "🫘" },
  CANOLA: { group: "Oilseeds", glyph: "🌼" },
  RAPESEED: { group: "Oilseeds", glyph: "🌿" },
  PALM_OIL: { group: "Oilseeds", glyph: "🌴" },
  SUNFLOWER_OIL: { group: "Oilseeds", glyph: "🌻" },
  COFFEE: { group: "Softs", glyph: "☕" },
  SUGAR: { group: "Softs", glyph: "🍬" },
  COTTON: { group: "Softs", glyph: "🌱" },
  COCOA: { group: "Softs", glyph: "🍫" },
  ORANGE_JUICE: { group: "Softs", glyph: "🍊" },
  RUBBER: { group: "Softs", glyph: "🛞" },
  TEA: { group: "Softs", glyph: "🍵" },
  MILK: { group: "Dairy", glyph: "🥛" },
  CHEESE: { group: "Dairy", glyph: "🧀" },
  BUTTER: { group: "Dairy", glyph: "🧈" },
  LUMBER: { group: "Materials", glyph: "🪵" },
  POTATOES: { group: "Materials", glyph: "🥔" },
  WOOL: { group: "Materials", glyph: "🐑" },
  STEEL: { group: "Industrial", glyph: "🏗️" },
  STEEL_REBAR: { group: "Industrial", glyph: "🧱" },
  HRC_STEEL: { group: "Industrial", glyph: "🗜️" },
  IRON_ORE: { group: "Industrial", glyph: "⛏️" },
  COPPER: { group: "Industrial", glyph: "🟤" },
  ALUMINUM: { group: "Industrial", glyph: "🥫" },
  ZINC: { group: "Industrial", glyph: "⚙️" },
  NICKEL: { group: "Industrial", glyph: "🪙" },
  LEAD: { group: "Industrial", glyph: "🔩" },
  TIN: { group: "Industrial", glyph: "🔧" },
  COBALT: { group: "Industrial", glyph: "🔵" },
  LITHIUM: { group: "Industrial", glyph: "🔋" },
  MOLYBDENUM: { group: "Industrial", glyph: "🧷" },
  MANGANESE: { group: "Industrial", glyph: "🧲" },
  TITANIUM: { group: "Industrial", glyph: "✈️" },
  MAGNESIUM: { group: "Industrial", glyph: "✨" },
  SILICON: { group: "Industrial", glyph: "💻" },
  ANTIMONY: { group: "Industrial", glyph: "🔥" },
  TUNGSTEN: { group: "Industrial", glyph: "💡" },
  VANADIUM: { group: "Industrial", glyph: "🛡️" },
  GRAPHITE: { group: "Industrial", glyph: "✏️" },
  URANIUM: { group: "Industrial", glyph: "☢️" },
  COAL: { group: "Industrial", glyph: "🪨" },
  COKING_COAL: { group: "Industrial", glyph: "⚫" },
  NEODYMIUM: { group: "Industrial", glyph: "🌀" },
  GERMANIUM: { group: "Industrial", glyph: "🔬" },
  GALLIUM: { group: "Industrial", glyph: "🧪" },
  PALLADIUM: { group: "Industrial", glyph: "⚪" },
};

export function marketMeta(symbol: string): { group: Group; glyph: string } {
  return META[symbol] ?? { group: "Softs", glyph: "•" };
}

export function prettyName(symbol: string): string {
  return symbol
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

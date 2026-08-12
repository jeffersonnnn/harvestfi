// Front-end grouping + flavor for the 23 agricultural markets (all "Agricultural" on-chain).
export type Group = "Grains" | "Oilseeds" | "Softs" | "Dairy" | "Materials";

export const GROUPS: Group[] = ["Grains", "Oilseeds", "Softs", "Dairy", "Materials"];

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

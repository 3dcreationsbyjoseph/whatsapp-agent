// Búsqueda tolerante de propiedades (sin dependencias: se puede probar en local
// sin BD). Normaliza tildes/mayúsculas, agrupa sinónimos multi-idioma de tipo y
// zona, trata dormitorios/baños como mínimos y el precio con tolerancia. Si no
// hay coincidencias exactas devuelve las más cercanas con sus diferencias.

export type PropertyRow = {
  id: string;
  reference: string | null;
  title: string;
  location: string;
  property_type: string;
  price_eur: number;
  bedrooms: number;
  bathrooms: number;
  built_area_m2: number | null;
  plot_area_m2: number | null;
  features: unknown;
};

export type SearchCriteria = {
  min_price_eur?: number | null;
  max_price_eur?: number | null;
  locations?: string[] | null;
  property_types?: string[] | null;
  min_bedrooms?: number | null;
  min_bathrooms?: number | null;
  needs_pool?: boolean | null;
  needs_sea_view?: boolean | null;
};

export type RankedProperty = {
  row: PropertyRow;
  differences: string[];
  penalty: number;
};

// Tolerancia de precio: un presupuesto de 1 M€ admite hasta 1,1 M€ como "exacto".
const PRICE_TOLERANCE = 0.1;

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Cada grupo = un tipo canónico. Frases de varias palabras primero (casa rural antes que casa).
const TYPE_GROUPS: Record<string, string[]> = {
  rural: ["casa rural", "finca", "cortijo", "masia", "country house", "farmhouse", "landhaus", "finca rustica", "rustica"],
  townhouse: [
    "adosado", "adosada", "casa adosada", "pareado", "pareada", "townhouse", "town house", "terraced",
    "semi detached", "semidetached", "reihenhaus", "doppelhaus", "maison mitoyenne", "rijtjeshuis",
    "bungalow", "quad", "duplex",
  ],
  penthouse: ["atico", "penthouse", "dachgeschoss", "penthaus", "attique"],
  apartment: [
    "apartamento", "apartment", "piso", "flat", "estudio", "studio", "wohnung", "appartement",
    "appartamento", "lagenhet", "leilighet", "lejlighed", "condo",
  ],
  plot: ["parcela", "solar", "terreno", "plot", "land", "grundstuck", "terrain", "kavel"],
  detached: [
    "villa", "chalet", "casa", "house", "detached", "independiente", "casa independiente", "vivienda",
    "haus", "einfamilienhaus", "maison", "huis", "vrijstaand", "hus", "home", "mansion",
  ],
};

export function canonicalType(raw: string): string {
  const n = normalize(raw);
  if (!n) return "";
  for (const [group, words] of Object.entries(TYPE_GROUPS)) {
    if (words.some((w) => n === w)) return group;
  }
  // Coincidencia por palabra contenida ("villa de lujo", "luxury villa").
  for (const [group, words] of Object.entries(TYPE_GROUPS)) {
    if (words.some((w) => ` ${n} `.includes(` ${w} `))) return group;
  }
  return n;
}

// Alias de zonas (castellano/valenciano/inglés).
const LOCATION_ALIASES: string[][] = [
  ["javea", "xabia", "xàbia"],
  ["denia", "dénia"],
  ["calpe", "calp"],
  ["benitachell", "benitatxell", "el poble nou de benitatxell", "cumbre del sol"],
  ["teulada", "teulada moraira"],
  ["altea", "altea hills"],
  ["benissa", "benisa"],
  ["alicante", "alacant"],
];

function locationKeys(raw: string): string[] {
  const n = normalize(raw);
  const group = LOCATION_ALIASES.find((g) => g.some((a) => normalize(a) === n || n.includes(normalize(a))));
  return group ? [n, ...group.map(normalize)] : [n];
}

function locationMatches(propertyLocation: string, wanted: string[]): boolean {
  const loc = normalize(propertyLocation);
  return wanted.some((w) => locationKeys(w).some((k) => k && (loc.includes(k) || k.includes(loc))));
}

function featureList(features: unknown): string[] {
  return Array.isArray(features) ? features.map((f) => normalize(String(f))) : [];
}

const POOL_WORDS = ["piscina", "pool", "schwimmbad", "piscine", "zwembad", "swimming"];
const SEA_WORDS = ["vistas al mar", "vista al mar", "sea view", "sea views", "meerblick", "vue mer", "zeezicht", "frente al mar", "primera linea", "beachfront", "mar", "sea"];

function hasAny(feats: string[], words: string[]): boolean {
  // Palabras cortas ("mar", "sea") solo como palabra completa: evita "marmol".
  return feats.some((f) =>
    words.some((w) => {
      const n = normalize(w);
      return n.length <= 4 ? ` ${f} `.includes(` ${n} `) : f.includes(n);
    }),
  );
}

export function evaluate(row: PropertyRow, c: SearchCriteria): RankedProperty {
  const differences: string[] = [];
  let penalty = 0;

  if (c.property_types && c.property_types.length > 0) {
    const wanted = new Set(c.property_types.map(canonicalType));
    if (!wanted.has(canonicalType(row.property_type))) {
      differences.push(`tipo: ${row.property_type}`);
      penalty += 3;
    }
  }

  if (c.locations && c.locations.length > 0 && !locationMatches(row.location, c.locations)) {
    differences.push(`zona: ${row.location}`);
    penalty += 3;
  }

  const price = Number(row.price_eur);
  if (c.max_price_eur && price > c.max_price_eur * (1 + PRICE_TOLERANCE)) {
    const over = (price - c.max_price_eur) / c.max_price_eur;
    differences.push(`precio ${Math.round(over * 100)}% por encima del máximo`);
    penalty += 2 + Math.min(4, over * 10);
  }
  if (c.min_price_eur && price < c.min_price_eur * (1 - PRICE_TOLERANCE)) {
    differences.push("precio por debajo del rango");
    penalty += 1;
  }

  if (c.min_bedrooms && row.bedrooms < c.min_bedrooms) {
    differences.push(`${row.bedrooms} dormitorios`);
    penalty += 1.5 * (c.min_bedrooms - row.bedrooms);
  }
  if (c.min_bathrooms && row.bathrooms < c.min_bathrooms) {
    differences.push(`${row.bathrooms} baños`);
    penalty += 0.75 * (c.min_bathrooms - row.bathrooms);
  }

  const feats = featureList(row.features);
  if (c.needs_pool && !hasAny(feats, POOL_WORDS)) {
    differences.push("sin piscina indicada");
    penalty += 1;
  }
  if (c.needs_sea_view && !hasAny(feats, SEA_WORDS)) {
    differences.push("sin vistas al mar indicadas");
    penalty += 1;
  }

  return { row, differences, penalty };
}

// Devuelve las exactas (sin diferencias) o, si no hay, las más cercanas.
export function rankProperties(
  rows: PropertyRow[],
  criteria: SearchCriteria,
  limit: number,
): { match: "exact" | "similar" | "none"; results: RankedProperty[] } {
  const evaluated = rows.map((r) => evaluate(r, criteria));
  const byScore = (a: RankedProperty, b: RankedProperty) =>
    a.penalty - b.penalty || Number(a.row.price_eur) - Number(b.row.price_eur);

  const exact = evaluated.filter((e) => e.differences.length === 0).sort(byScore);
  if (exact.length > 0) return { match: "exact", results: exact.slice(0, limit) };

  // Sin exactas: las más cercanas, descartando las que fallan en casi todo.
  const similar = evaluated.filter((e) => e.penalty <= 7).sort(byScore);
  if (similar.length > 0) return { match: "similar", results: similar.slice(0, limit) };
  return { match: "none", results: [] };
}

// Detección de idioma instantánea y sin IA (palabras frecuentes + alfabetos).
// Sirve para fijar en qué idioma debe responder el bot y para traducir sin una
// llamada extra al modelo. Si no está seguro devuelve null y se usa el último
// idioma conocido del cliente. Sin dependencias: se prueba en local.

type Lang = string;

// Palabras muy frecuentes y saludos/expresiones típicas de chat por idioma.
const WORDS: Record<Lang, string> = {
  es: "hola holaa holaaa buenas buenos dias tardes noches gracias quiero busco estoy tengo una un el la los las de del que y por para con en es mi me te su muy pero como cuando donde cuanto cuesta precio casa villa piso chalet dormitorios habitaciones baños piscina vistas mar visita gustaria podria favor vale si no también tambien hay algo ver",
  en: "hi hello hey thanks thank you please i i'm im am is are the a an and or of to in for with my me you your we looking want would like could can how much price house villa apartment bedrooms bathrooms pool sea view visit yes no also there what when where about",
  de: "hallo guten tag morgen abend danke bitte ich bin suche möchte moechte haben eine einen ein der die das und oder mit für fuer von zu im ist sind wie viel preis haus villa wohnung schlafzimmer bäder pool meerblick besichtigung ja nein auch gibt es mein meine sie wir",
  fr: "bonjour bonsoir salut merci svp je suis cherche voudrais aimerais une un le la les des et ou avec pour dans est sont comment combien prix maison villa appartement chambres salles piscine vue mer visite oui non aussi il y a mon ma vous nous",
  it: "ciao buongiorno buonasera grazie prego sono cerco vorrei una un il lo la gli le di del e o con per in è sono come quanto prezzo casa villa appartamento camere bagni piscina vista mare visita si no anche c'è mio mia lei noi",
  pt: "olá ola bom dia boa tarde noite obrigado obrigada estou procuro queria gostaria uma um o a os as de do da e ou com para em é são como quanto preço casa moradia apartamento quartos casas de banho piscina vista mar visita sim não nao também tambem",
  nl: "hoi hallo goedemorgen goedemiddag goedenavond dank bedankt alstublieft ik ben zoek wil graag een de het en of met voor van in is zijn hoe veel prijs huis villa appartement slaapkamers badkamers zwembad zeezicht bezichtiging ja nee ook er mijn u wij",
  sv: "hej hejsan god morgon tack jag är söker vill skulle gärna en ett och eller med för av i är hur mycket pris hus villa lägenhet sovrum badrum pool havsutsikt visning ja nej också det finns min ni vi",
  no: "hei hallo god morgen takk jeg er ser etter vil gjerne en et og eller med for av i er hvordan mye pris hus villa leilighet soverom bad basseng havutsikt visning ja nei også det finnes min dere vi",
  da: "hej goddag godmorgen tak jeg er søger vil gerne en et og eller med for af i er hvordan meget pris hus villa lejlighed soveværelser badeværelser pool havudsigt fremvisning ja nej også der er min jer vi",
  ca: "bon dia bona tarda gràcies gracies vull busco voldria una un el la els les de del i o amb per a és són com quant preu casa xalet pis habitacions banys piscina vistes mar visita sí no també",
};

const INDEX: Record<Lang, Set<string>> = Object.fromEntries(
  Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(/\s+/).filter(Boolean))]),
);

// Letras que inclinan la balanza.
const CHAR_HINTS: Array<[RegExp, Lang, number]> = [
  [/[ñ¿¡]/, "es", 3],
  [/ß/, "de", 3],
  [/[äöü]/, "de", 1],
  [/[ãõ]/, "pt", 3],
  [/ç/, "fr", 1],
  [/[ø]/, "no", 1],
  [/[æ]/, "da", 1],
  [/[å]/, "sv", 1],
  [/l·l/, "ca", 3],
];

// Alfabetos no latinos: el idioma es inequívoco (o casi).
const SCRIPTS: Array<[RegExp, Lang]> = [
  [/\p{Script=Cyrillic}/u, "ru"],
  [/\p{Script=Arabic}/u, "ar"],
  [/\p{Script=Hebrew}/u, "he"],
  [/\p{Script=Greek}/u, "el"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "ja"],
  [/\p{Script=Hangul}/u, "ko"],
  [/\p{Script=Han}/u, "zh"],
  [/\p{Script=Thai}/u, "th"],
  [/\p{Script=Devanagari}/u, "hi"],
];

export function detectLanguageLocal(text: string | null | undefined): Lang | null {
  const t = (text ?? "").toLowerCase().trim();
  if (!t) return null;

  for (const [re, lang] of SCRIPTS) {
    if (re.test(t)) {
      // Ucraniano: letras propias del cirílico ucraniano.
      if (lang === "ru" && /[іїєґ]/.test(t)) return "uk";
      return lang;
    }
  }

  const words = t
    .replace(/[^\p{L}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    // "holaaa" → "holaa" (alargamientos típicos de chat).
    .map((w) => w.replace(/(\p{L})\1{2,}/gu, "$1$1"));

  const scores: Record<Lang, number> = {};
  for (const lang of Object.keys(INDEX)) scores[lang] = 0;
  for (const w of words) {
    for (const [lang, set] of Object.entries(INDEX)) {
      if (set.has(w)) scores[lang] += 1;
    }
  }
  for (const [re, lang, weight] of CHAR_HINTS) if (re.test(t)) scores[lang] += weight;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] === 0) return null;
  // Empate (p. ej. "hallo" es alemán y neerlandés, "hej" sueco y danés): sin decidir.
  if (second && second[1] === best[1]) return null;
  return best[0];
}

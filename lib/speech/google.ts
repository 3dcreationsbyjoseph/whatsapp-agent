// Voz con Google Cloud: Speech-to-Text (notas de voz del cliente → texto) y
// Text-to-Speech (respuesta del bot → nota de voz). Llamadas REST con una API key
// (GOOGLE_CLOUD_API_KEY), sin dependencias nuevas. Solo para el plan Max.

const STT_URL = "https://speech.googleapis.com/v1p1beta1";
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

export function speechEnabled(): boolean {
  return !!process.env.GOOGLE_CLOUD_API_KEY;
}

function apiKey(): string {
  const key = process.env.GOOGLE_CLOUD_API_KEY;
  if (!key) throw new Error("Falta GOOGLE_CLOUD_API_KEY");
  return key;
}

// Código corto (es, de...) → código regional que entienden STT/TTS.
const LOCALES: Record<string, string> = {
  es: "es-ES", en: "en-GB", de: "de-DE", fr: "fr-FR", it: "it-IT", pt: "pt-PT", nl: "nl-NL",
  sv: "sv-SE", no: "nb-NO", nb: "nb-NO", da: "da-DK", fi: "fi-FI", ca: "ca-ES", ru: "ru-RU",
  uk: "uk-UA", pl: "pl-PL", cs: "cs-CZ", ro: "ro-RO", el: "el-GR", tr: "tr-TR", ar: "ar-XA",
  he: "he-IL", hi: "hi-IN", zh: "cmn-CN", ja: "ja-JP", ko: "ko-KR", th: "th-TH", hu: "hu-HU",
};

export function toLocale(code: string | null | undefined): string {
  const base = (code ?? "es").toLowerCase().split("-")[0];
  return LOCALES[base] ?? "en-GB";
}

function sttLocale(code: string | null | undefined): string {
  const l = toLocale(code);
  // STT usa otros códigos para árabe y chino.
  return l === "ar-XA" ? "ar-SA" : l === "cmn-CN" ? "cmn-Hans-CN" : l;
}

// Frecuencia original de la nota de voz (cabecera "OpusHead" del OGG). Google
// exige una de estas para OGG_OPUS; WhatsApp suele grabar a 16 kHz.
function opusSampleRate(audio: Uint8Array): number {
  const allowed = [8000, 12000, 16000, 24000, 48000];
  const sig = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]; // "OpusHead"
  for (let i = 0; i < Math.min(audio.length - 16, 4096); i++) {
    if (sig.every((b, k) => audio[i + k] === b)) {
      const rate = audio[i + 12] | (audio[i + 13] << 8) | (audio[i + 14] << 16) | (audio[i + 15] << 24);
      return allowed.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), 16000);
    }
  }
  return 16000;
}

type SttResponse = {
  results?: Array<{ alternatives?: Array<{ transcript?: string }>; languageCode?: string }>;
  error?: { message?: string };
  name?: string;
  done?: boolean;
  response?: { results?: SttResponse["results"] };
};

// Transcribe una nota de voz OGG/Opus. languageHint: idioma conocido del cliente;
// se añaden alternativas para que reconozca también otros idiomas habituales.
export async function transcribeVoiceNote(
  audio: Uint8Array,
  languageHint?: string | null,
): Promise<{ text: string; language: string | null } | null> {
  const primary = sttLocale(languageHint);
  const alternatives = ["es-ES", "en-GB", "de-DE", "fr-FR"].filter((l) => l !== primary).slice(0, 3);
  const body = {
    config: {
      encoding: "OGG_OPUS",
      sampleRateHertz: opusSampleRate(audio),
      languageCode: primary,
      alternativeLanguageCodes: alternatives,
      enableAutomaticPunctuation: true,
      model: "latest_long",
    },
    audio: { content: Buffer.from(audio).toString("base64") },
  };

  const post = async (path: string) =>
    (await (
      await fetch(`${STT_URL}/${path}?key=${apiKey()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
    ).json()) as SttResponse;

  let data = await post("speech:recognize");
  // Notas de más de 1 minuto: reconocimiento asíncrono y espera del resultado.
  if (data.error && /too long|longrunning|duration/i.test(data.error.message ?? "")) {
    const op = await post("speech:longrunningrecognize");
    if (!op.name) throw new Error(op.error?.message ?? "No se pudo iniciar la transcripción larga");
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = (await (await fetch(`${STT_URL}/operations/${op.name}?key=${apiKey()}`)).json()) as SttResponse;
      if (st.done) {
        data = { results: st.response?.results ?? [] };
        break;
      }
    }
  }
  if (data.error) throw new Error(data.error.message ?? "Error de Speech-to-Text");

  const results = data.results ?? [];
  const text = results
    .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!text) return null;
  const lang = results.find((r) => r.languageCode)?.languageCode ?? null;
  return { text, language: lang ? lang.toLowerCase().split("-")[0] : null };
}

// Limpia el texto para leerlo en voz alta: sin asteriscos, emojis ni enlaces.
export function textForSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`#>]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 4500); // límite de la API: 5000 bytes
}

// Genera una nota de voz OGG/Opus (formato de las notas de voz de WhatsApp).
export async function synthesizeVoiceNote(text: string, language: string | null | undefined): Promise<Uint8Array> {
  const res = await fetch(`${TTS_URL}?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: toLocale(language), ssmlGender: "FEMALE" },
      audioConfig: { audioEncoding: "OGG_OPUS", speakingRate: 1.0 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as { audioContent?: string; error?: { message?: string } };
  if (!res.ok || !data.audioContent) throw new Error(data.error?.message ?? `Text-to-Speech HTTP ${res.status}`);
  return new Uint8Array(Buffer.from(data.audioContent, "base64"));
}

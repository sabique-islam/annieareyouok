/**
 * UCDI-Hash-64 v1
 *
 * Offline feature hashing for inspection narratives. Tokens are expanded
 * through a small automotive synonym lexicon, then signed-hashed into 64
 * dimensions and L2-normalised. Cosine similarity is computed by pgvector.
 *
 * This is a lab embedder so the project runs without an external API.
 * A production model can replace embed() without changing the vector column.
 */

const LEXICON = [
  { triggers: ["rust", "corrosion", "bubbling", "oxidation"], add: ["rust", "corrosion"] },
  { triggers: ["carpet", "damp", "musty", "footwell", "cabin"], add: ["damp", "cabin"] },
  { triggers: ["transmission", "gearbox", "slip", "slipping", "slipped", "hesitation", "hesitated"], add: ["transmission", "slip"] },
  { triggers: ["cold", "morning"], add: ["cold"] },
  { triggers: ["respray", "repaint", "crash", "collision", "fender", "thickness"], add: ["respray", "accident"] },
  { triggers: ["suspension", "clunk", "bushing", "bushings"], add: ["suspension", "clunk"] },
  { triggers: ["tread", "tyre", "tyres", "tire", "tires"], add: ["tread"] },
  { triggers: ["service", "serviced", "maintained"], add: ["maintained"] },
  { triggers: ["leak", "leaking", "weeping", "seepage", "seep"], add: ["leak"] },
  { triggers: ["exhaust", "manifold"], add: ["exhaust"] },
  { triggers: ["misfire", "hunts", "hunting"], add: ["misfire"] },
];

const STOP = new Set([
  "the", "a", "an", "of", "and", "on", "in", "to", "with", "for", "was", "were",
  "is", "are", "after", "from", "over", "until", "this", "that", "it", "its",
  "at", "by", "be", "been", "or", "as", "into", "than", "then", "once", "no",
  "not", "but", "they", "their", "there", "during", "through", "between",
]);

export const EMBEDDING_MODEL = "ucdi-hash-64-v1";
export const EMBEDDING_DIMS = 64;

function fnv(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function expand(tokens) {
  const out = [...tokens];
  const seen = new Set(tokens);
  for (const token of tokens) {
    for (const group of LEXICON) {
      if (group.triggers.includes(token)) {
        for (const extra of group.add) {
          if (!seen.has(extra)) {
            seen.add(extra);
            out.push(extra);
          }
        }
      }
    }
  }
  return out;
}

export function embed(text) {
  const tokens = expand(tokenize(text));
  const vector = new Array(EMBEDDING_DIMS).fill(0);
  for (const token of tokens) {
    vector[fnv(token) % EMBEDDING_DIMS] += 1;
    vector[fnv(`${token}#`) % EMBEDDING_DIMS] -= 1;
    vector[fnv(`#${token}`) % EMBEDDING_DIMS] += 0.5;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function toSqlVector(values) {
  return `[${values.map((value) => Number(value).toFixed(6)).join(",")}]`;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

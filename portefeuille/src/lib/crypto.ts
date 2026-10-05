// Chiffrement des données embarquées dans le fichier HTML : AES-GCM 256 bits,
// clé dérivée du mot de passe par PBKDF2-SHA256. Rien ne quitte le navigateur.

export interface Envelope {
  v: 1;
  /** Sel PBKDF2 (absent quand la clé est une clé brute, ex. fichier d'ajouts). */
  salt?: string;
  iter?: number;
  iv: string;
  gz: boolean;
  data: string;
}

const ITERATIONS = 250_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

const canGzip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

export interface SessionKey {
  key: CryptoKey;
  salt: Uint8Array;
  iter: number;
}

export async function deriveKey(password: string, salt: Uint8Array = randomBytes(16), iter = ITERATIONS): Promise<SessionKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt, iter };
}

export async function rawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromB64(b64), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value: unknown, key: CryptoKey, kdf?: { salt: Uint8Array; iter: number }): Promise<Envelope> {
  let bytes = enc.encode(JSON.stringify(value));
  const gz = canGzip();
  if (gz) bytes = await pipe(bytes, new CompressionStream("gzip"));
  const iv = randomBytes(12);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return { v: 1, ...(kdf ? { salt: toB64(kdf.salt), iter: kdf.iter } : {}), iv: toB64(iv), gz, data: toB64(cipher) };
}

/** Déchiffre ; rejette si la clé (le mot de passe) est mauvaise. */
export async function open<T>(env: Envelope, key: CryptoKey): Promise<T> {
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, key, fromB64(env.data)));
  if (env.gz) {
    if (!canGzip()) throw new Error("Ce navigateur est trop ancien pour lire ce fichier (mettez-le à jour).");
    bytes = await pipe(bytes, new DecompressionStream("gzip"));
  }
  return JSON.parse(dec.decode(bytes)) as T;
}

export async function unlock<T>(env: Envelope, password: string): Promise<{ value: T; session: SessionKey }> {
  const session = await deriveKey(password, fromB64(env.salt!), env.iter ?? ITERATIONS);
  const value = await open<T>(env, session.key);
  return { value, session };
}

/** Empreinte courte et salée (anti-doublon sans révéler le nom). */
export async function fingerprint(salt: string, text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(salt + "|" + text)));
  return Array.from(d.subarray(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}

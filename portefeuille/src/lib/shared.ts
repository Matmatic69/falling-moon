// Dossier partagé (ex. un dossier OneDrive synchronisé) : le fichier de l'équipe et les demandes y vivent.
// Accès par l'API File System Access (Chrome, Edge) : rien ne passe par un serveur, chaque demande est un
// petit fichier chiffré (pas de conflit de synchronisation quand deux personnes écrivent en même temps).
import type { Decision, Demande } from "../core/types";
import { open, rawKey, seal, type Envelope } from "./crypto";
import { idbGet, idbSet } from "./idb";

interface PermHandle {
  queryPermission(o: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}
type Dir = FileSystemDirectoryHandle & PermHandle;
declare global {
  interface Window {
    showDirectoryPicker?: (o?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

const KEY = "pf-dossier-partage";
const SUB = "Demandes";

export const sharedSupported = () => typeof window.showDirectoryPicker === "function";

/** Dossier déjà choisi dans ce navigateur (la permission peut devoir être redemandée). */
export async function savedFolder(): Promise<Dir | null> {
  return ((await idbGet<Dir>(KEY)) as Dir | undefined) ?? null;
}

export async function chooseFolder(): Promise<Dir> {
  if (!window.showDirectoryPicker) throw new Error("Ce navigateur ne sait pas écrire dans un dossier : ouvrez le fichier avec Chrome ou Edge.");
  const dir = (await window.showDirectoryPicker({ mode: "readwrite", id: "portefeuille" })) as Dir;
  await idbSet(KEY, dir);
  return dir;
}

/** Vérifie (et demande si besoin, sur un clic) l'accès en écriture au dossier. */
export async function ready(dir: Dir, ask: boolean): Promise<boolean> {
  if ((await dir.queryPermission({ mode: "readwrite" })) === "granted") return true;
  if (!ask) return false;
  return (await dir.requestPermission({ mode: "readwrite" })) === "granted";
}

async function sub(dir: Dir) {
  return dir.getDirectoryHandle(SUB, { create: true });
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

interface Box {
  app: "portefeuille-demande";
  v: 1;
  env: Envelope;
}

export async function writeDemande(dir: Dir, teamKey: string, d: Demande): Promise<void> {
  const box: Box = { app: "portefeuille-demande", v: 1, env: await seal(d, await rawKey(teamKey)) };
  await writeText(await sub(dir), `demande-${d.id}.json`, JSON.stringify(box));
}

export async function writeDecision(dir: Dir, teamKey: string, dec: Decision): Promise<void> {
  const box: Box = { app: "portefeuille-demande", v: 1, env: await seal(dec, await rawKey(teamKey)) };
  await writeText(await sub(dir), `decision-${dec.id}.json`, JSON.stringify(box));
}

/** Toutes les demandes et décisions lisibles avec la clé de l'équipe (les fichiers illisibles sont ignorés). */
export async function readAll(dir: Dir, teamKey: string): Promise<{ demandes: Demande[]; decisions: Map<string, Decision> }> {
  const key = await rawKey(teamKey);
  const demandes: Demande[] = [];
  const decisions = new Map<string, Decision>();
  const d = await sub(dir);
  for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
    if (h.kind !== "file" || !name.endsWith(".json")) continue;
    try {
      const box = JSON.parse(await (await (h as FileSystemFileHandle).getFile()).text()) as Box;
      if (box.app !== "portefeuille-demande") continue;
      if (name.startsWith("demande-")) demandes.push(await open<Demande>(box.env, key));
      else if (name.startsWith("decision-")) {
        const dec = await open<Decision>(box.env, key);
        decisions.set(dec.id, dec);
      }
    } catch {
      /* fichier d'un autre portefeuille, ou en cours de synchronisation */
    }
  }
  demandes.sort((a, b) => b.le.localeCompare(a.le));
  return { demandes, decisions };
}

/** Publie le fichier de l'équipe dans le dossier partagé (remplace la version précédente). */
export async function publishFile(dir: Dir, name: string, html: string): Promise<void> {
  await writeText(dir, name, html);
}

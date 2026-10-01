import { fingerprintKeys } from "../core/match";
import { randomId } from "../core/state";
import type { Ajout, Client, Empreinte, Payload, PortfolioState } from "../core/types";
import { deriveKey, fingerprint, open, rawKey, seal, toB64, randomBytes, type Envelope } from "../lib/crypto";
import { buildHtml, download, slug, today, type FileMeta } from "../lib/file";
import type { Session, useStore } from "./store";

type Store = ReturnType<typeof useStore>;

/** Ce que contient le fichier ouvert, recomposé depuis l'état courant. */
function currentPayload(state: PortfolioState, session: Session): Payload {
  return {
    role: session.role,
    me: session.role === "commercial" ? session.me : undefined,
    detail: session.detail,
    state,
    empreintes: session.empreintes,
    ...(session.returnKey ? { returnKey: session.returnKey } : {}),
    ...(session.fpSalt ? { fpSalt: session.fpSalt } : {}),
  } as Payload;
}

/** Télécharge le fichier HTML à jour (mêmes données chiffrées, même mot de passe). */
export async function saveSnapshot(store: Store): Promise<boolean> {
  const { state, session } = store;
  if (!session.key) return false;
  const env = await seal(currentPayload(state, session), session.key.key, { salt: session.key.salt, iter: session.key.iter });
  const me = state.team.find((m) => m.id === session.me);
  const meta: FileMeta = {
    app: "portefeuille",
    v: 1,
    role: session.role,
    pour: session.role === "commercial" ? me?.nom : undefined,
    fileId: state.fileId,
    savedAt: new Date().toISOString(),
    env,
  };
  const name = session.role === "responsable" ? `Portefeuille-clients-${today()}.html` : `Portefeuille-${slug(me?.nom ?? "commercial")}-${today()}.html`;
  download(name, buildHtml(meta, session.role === "responsable" ? "Portefeuille clients" : `Portefeuille — ${me?.nom ?? ""}`));
  store.markBackedUp();
  return true;
}

/** Première sauvegarde d'un portefeuille tout juste créé à partir d'un export. */
export async function snapshotFor(state: PortfolioState, password: string): Promise<{ html: string; session: Session }> {
  const sk = await deriveKey(password);
  const payload: Payload = { role: "responsable", state };
  const env = await seal(payload, sk.key, { salt: sk.salt, iter: sk.iter });
  const meta: FileMeta = { app: "portefeuille", v: 1, role: "responsable", fileId: state.fileId, savedAt: state.savedAt, env };
  const me = state.team.find((m) => m.responsable)?.id ?? state.team[0].id;
  return { html: buildHtml(meta, "Portefeuille clients"), session: { role: "responsable", me, key: sk } };
}

const STRIP: (keyof Client)[] = ["adresse", "tel", "portable", "contact", "mail", "siren", "motCle", "technicien", "autresAdresses", "secteurGeo"];

/**
 * Fichier d'un commercial : son portefeuille complet ; pour les clients des autres,
 * seulement nom + ville (« nom ») ou rien de lisible (« masque », contrôle anti-doublon par empreintes).
 */
export async function makeCommercialFile(store: Store, memberId: string, password: string, detail: "nom" | "masque"): Promise<void> {
  const { state, owner, d } = store;
  const member = state.team.find((m) => m.id === memberId)!;
  let returnKey = state.returnKeys[memberId];
  if (!returnKey) {
    returnKey = toB64(randomBytes(32));
    const rk = returnKey;
    store.update(null, (s) => ({ ...s, returnKeys: { ...s.returnKeys, [memberId]: rk } }));
  }
  const fpSalt = randomId(8);
  const empreintes: Empreinte[] = [];
  const clients: Client[] = [];
  for (const c of state.clients) {
    if (state.merges[c.id]) continue;
    const o = owner(c.id);
    if (o === memberId) {
      clients.push(c);
      continue;
    }
    if (detail === "masque") {
      const h = await Promise.all(fingerprintKeys(c).map((k) => fingerprint(fpSalt, k)));
      empreintes.push({ h, owner: o ?? "" });
      const seg = d.byId.get(c.id)?.segment ?? c.segment;
      clients.push({ id: c.id, numero: "", type: c.type, nom: "", adresse: "", cp: c.cp, ville: c.ville, code: "", contrat: c.contrat, segment: seg, segmentSource: "manuel", payeur: c.payeur, lat: c.lat, lng: c.lng, geo: c.geo });
    } else {
      const lite = { ...c };
      STRIP.forEach((k) => delete lite[k]);
      clients.push(lite);
    }
  }
  const segmentOverrides = Object.fromEntries(d.active.filter((c) => c.segmentSource === "manuel").map((c) => [c.id, c.segment]));
  const sub: PortfolioState = {
    ...state,
    fileId: `${state.fileId}-${memberId}`,
    clients,
    merges: {},
    pins: {},
    ignores: [],
    segmentOverrides,
    journal: [],
    returnKeys: {},
    ajouts: state.ajouts.filter((a) => a.par === memberId),
    owners: Object.fromEntries(clients.map((c) => [c.id, owner(c.id) ?? ""]).filter(([, o]) => o)),
  };
  const payload = { role: "commercial", me: memberId, detail, state: sub, empreintes: detail === "masque" ? empreintes : undefined, returnKey, fpSalt } as Payload;
  const sk = await deriveKey(password);
  const env = await seal(payload, sk.key, { salt: sk.salt, iter: sk.iter });
  const meta: FileMeta = { app: "portefeuille", v: 1, role: "commercial", pour: member.nom, fileId: sub.fileId, savedAt: new Date().toISOString(), env };
  download(`Portefeuille-${slug(member.nom)}-${today()}.html`, buildHtml(meta, `Portefeuille — ${member.nom}`));
  store.update(`Fichier commercial créé pour ${member.nom} (${detail === "nom" ? "noms des clients des autres visibles" : "clients des autres masqués"})`, (s) => s);
}

interface AjoutsFile {
  app: "portefeuille-ajouts";
  v: 1;
  /** Fichier du responsable d'origine. */
  master: string;
  par: string;
  le: string;
  env: Envelope;
}

/** Le commercial exporte ses ajouts en attente, chiffrés pour le responsable. */
export async function exportAjouts(store: Store): Promise<number> {
  const { state, session } = store;
  if (!session.returnKey) throw new Error("Ce fichier ne permet pas d'envoyer des ajouts.");
  const list = state.ajouts.filter((a) => a.statut === "en-attente" && a.par === session.me);
  const env = await seal(list, await rawKey(session.returnKey));
  const me = state.team.find((m) => m.id === session.me);
  const file: AjoutsFile = { app: "portefeuille-ajouts", v: 1, master: state.fileId.replace(/-[^-]+$/, ""), par: session.me, le: new Date().toISOString(), env };
  download(`Ajouts-${slug(me?.nom ?? session.me)}-${today()}.json`, JSON.stringify(file), "application/json");
  return list.length;
}

/** Le responsable lit un fichier d'ajouts reçu d'un commercial. */
export async function readAjoutsFile(store: Store, file: File): Promise<{ par: string; list: Ajout[] }> {
  let parsed: AjoutsFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas un fichier d'ajouts.");
  }
  if (parsed.app !== "portefeuille-ajouts") throw new Error("Ce fichier n'est pas un fichier d'ajouts.");
  const key = store.state.returnKeys[parsed.par];
  if (!key) throw new Error("Aucun fichier n'a été créé pour ce commercial depuis ce portefeuille.");
  try {
    const list = await open<Ajout[]>(parsed.env, await rawKey(key));
    return { par: parsed.par, list: list.filter((a) => a.par === parsed.par) };
  } catch {
    throw new Error("Impossible de lire ces ajouts : ils viennent d'un fichier créé par un autre portefeuille.");
  }
}

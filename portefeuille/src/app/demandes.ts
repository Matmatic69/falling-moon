import { randomId } from "../core/state";
import type { Demande } from "../core/types";
import { readAll, ready, savedFolder, writeDemande } from "../lib/shared";
import type { useStore } from "./store";

type Store = ReturnType<typeof useStore>;

export const teamKeyOf = (store: Store) => store.session.teamKey ?? store.state.teamKey;

/** Dépose une demande dans le dossier partagé (à appeler sur un clic : le navigateur peut redemander l'accès). */
export async function deposer(store: Store, d: Omit<Demande, "id" | "le" | "par">): Promise<void> {
  const key = teamKeyOf(store);
  if (!key) throw new Error("Ce fichier n'est pas encore partagé.");
  const dir = await savedFolder();
  if (!dir || !(await ready(dir, true))) throw new Error("Connecte d'abord le dossier partagé OneDrive (onglet « Demandes »).");
  await writeDemande(dir, key, { ...d, id: randomId(10), le: new Date().toISOString(), par: store.session.me });
}

export async function lireDemandes(store: Store, ask: boolean) {
  const key = teamKeyOf(store);
  const dir = await savedFolder();
  if (!key || !dir || !(await ready(dir, ask))) return null;
  return readAll(dir, key);
}

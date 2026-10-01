import { computeRoles, type AddressRole } from "./roles";
import type { Account, Client, SegmentId } from "./types";

/** Clients visibles : les doublons fusionnés disparaissent derrière la fiche conservée. */
export function activeClients(clients: Client[], merges: Record<string, string>): Client[] {
  return clients.filter((c) => !merges[c.id]);
}

export function resolveMerge(id: string, merges: Record<string, string>): string {
  let cur = id;
  for (let i = 0; i < 10 && merges[cur]; i++) cur = merges[cur];
  return cur;
}

/** Poids d'une fiche : 1 si c'est un lieu d'intervention, plus un bonus par contrat d'entretien. */
export function weightFn(roles: Map<string, AddressRole>, poidsContrat: number): (c: Client) => number {
  return (c) => (roles.get(c.id) === "site" ? 1 : 0) + (c.contrat ? poidsContrat : 0);
}

/**
 * Regroupe les fiches en comptes : un payeur et tous ses sites.
 * Un site dont le payeur n'est pas dans le fichier forme son propre compte.
 * Seuls les lieux d'intervention comptent comme sites (pas les adresses de facturation).
 */
export function buildAccounts(
  clients: Client[],
  merges: Record<string, string>,
  poidsContrat: number,
  zone?: string[],
  rolesIn?: Map<string, AddressRole>,
): Map<string, Account> {
  const active = activeClients(clients, merges);
  const roles = rolesIn ?? computeRoles(active, merges, zone);
  const weight = weightFn(roles, poidsContrat);
  const ids = new Set(active.map((c) => c.id));
  const accounts = new Map<string, Account>();
  const segCount = new Map<string, Map<SegmentId, number>>();

  for (const c of active) {
    const payeur = c.payeur ? resolveMerge(c.payeur, merges) : "";
    const key = payeur && ids.has(payeur) ? payeur : c.id;
    let a = accounts.get(key);
    if (!a) {
      a = { id: key, nom: "", clientIds: [], siteIds: [], sites: 0, contrats: 0, score: 0, segment: "autre", ville: "", cp: "", codes: [] };
      accounts.set(key, a);
    }
    a.clientIds.push(c.id);
    if (roles.get(c.id) === "site") {
      a.siteIds.push(c.id);
      a.sites++;
    }
    if (c.contrat) a.contrats++;
    a.score += weight(c);
    if (!a.codes.includes(c.code)) a.codes.push(c.code);
    const sc = segCount.get(key) ?? new Map<SegmentId, number>();
    sc.set(c.segment, (sc.get(c.segment) ?? 0) + 1);
    segCount.set(key, sc);
  }

  const byId = new Map(active.map((c) => [c.id, c]));
  accounts.forEach((a) => {
    const head = byId.get(a.id)!;
    a.nom = head.nom;
    a.ville = head.ville;
    a.cp = head.cp;
    const sc = segCount.get(a.id)!;
    // Typologie du compte : celle du payeur si elle est connue, sinon la plus fréquente.
    let best: SegmentId = head.segment;
    if (best === "autre") {
      let n = 0;
      sc.forEach((v, k) => {
        if (k !== "autre" && v > n) {
          n = v;
          best = k;
        }
      });
    }
    a.segment = best;
    let lat = 0, lng = 0, n = 0;
    for (const id of a.siteIds.length ? a.siteIds : a.clientIds) {
      const c = byId.get(id)!;
      if (c.lat !== undefined && c.lng !== undefined) {
        lat += c.lat;
        lng += c.lng;
        n++;
      }
    }
    if (n) {
      a.lat = lat / n;
      a.lng = lng / n;
    }
    // Un client sans site connu pèse quand même : c'est un compte à suivre.
    a.score = Math.max(1, Math.round(a.score * 10) / 10);
  });
  return accounts;
}

/** Compte de rattachement de chaque fiche. */
export function accountOf(accounts: Map<string, Account>): Map<string, string> {
  const m = new Map<string, string>();
  accounts.forEach((a) => a.clientIds.forEach((id) => m.set(id, a.id)));
  return m;
}

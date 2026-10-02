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

/**
 * Regroupe les fiches en comptes : un payeur et tous ses sites.
 * Un site dont le payeur n'est pas dans le fichier forme son propre compte.
 * Seuls les lieux d'intervention comptent comme sites (pas les adresses de facturation).
 */
export function buildAccounts(
  clients: Client[],
  merges: Record<string, string>,
  zone?: string[],
  rolesIn?: Map<string, AddressRole>,
  siteUnique?: string[],
): Map<string, Account> {
  const active = activeClients(clients, merges);
  const roles = rolesIn ?? computeRoles(active, merges, zone, siteUnique);
  const ids = new Set(active.map((c) => c.id));
  const accounts = new Map<string, Account>();
  const segCount = new Map<string, Map<SegmentId, number>>();

  for (const c of active) {
    const payeur = c.payeur ? resolveMerge(c.payeur, merges) : "";
    const key = payeur && ids.has(payeur) ? payeur : c.id;
    let a = accounts.get(key);
    if (!a) {
      a = { id: key, nom: "", clientIds: [], siteIds: [], sites: 0, score: 0, segment: "autre", ville: "", cp: "", codes: [] };
      accounts.set(key, a);
    }
    a.clientIds.push(c.id);
    if (roles.get(c.id) === "site") {
      a.siteIds.push(c.id);
      a.sites++;
    }
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
    // Taille : ses sites d'intervention ; un client sans site connu compte quand même pour un.
    a.score = Math.max(1, a.sites);
  });
  return accounts;
}

/** Compte de rattachement de chaque fiche. */
export function accountOf(accounts: Map<string, Account>): Map<string, string> {
  const m = new Map<string, string>();
  accounts.forEach((a) => a.clientIds.forEach((id) => m.set(id, a.id)));
  return m;
}

/** Propriétaire principal d'un compte : celui qui en tient le plus de fiches, le payeur départage ; "" = à répartir. */
export function mainOwner(a: Account, owner: (id: string) => string | undefined): string {
  const n = new Map<string, number>();
  a.clientIds.forEach((id) => {
    const o = owner(id) ?? "";
    n.set(o, (n.get(o) ?? 0) + 1);
  });
  const head = owner(a.id) ?? "";
  return [...n].sort((x, y) => y[1] - x[1] || Number(y[0] === head) - Number(x[0] === head))[0]?.[0] ?? "";
}

/** Valeur la plus fréquente parmi les sites d'un compte (département, ville…), à défaut celle du payeur. */
export function mainOf(a: Account, byId: Map<string, Client>, key: (c: Client) => string): string {
  const n = new Map<string, number>();
  for (const id of a.siteIds) {
    const k = key(byId.get(id)!);
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
}

import { activeClients, buildAccounts } from "./accounts";
import { computeRoles, type AddressRole } from "./roles";
import { norm } from "./normalize";
import { SEGMENTS } from "./segments";
import type { Account, Client, Member, PortfolioState, SegmentId } from "./types";

/** Pourquoi un compte revient à quelqu'un — affiché dans l'interface. */
export type Reason = "code" | "manuel" | "compte" | "grand-compte" | "equilibre" | "territoire" | "pool";

export const REASON_LABEL: Record<Reason, string> = {
  code: "Code ERP du commercial",
  manuel: "Choix du responsable",
  compte: "Rejoint le compte déjà tenu",
  "grand-compte": "Grand compte réservé au responsable",
  equilibre: "Partage équilibré par typologie",
  territoire: "Partage par secteur géographique",
  pool: "À répartir",
};

export interface MemberStats {
  id: string;
  /** Comptes dont la personne tient au moins une fiche. */
  comptes: number;
  /** Ses comptes, par typologie du compte. */
  parSegment: Record<SegmentId, number>;
}

export interface Proposal {
  owners: Record<string, string>;
  reasons: Record<string, Reason>;
  stats: MemberStats[];
  /** Écart entre commerciaux qui se partagent le pool, en nombre de comptes (à part égale). */
  ecartComptes: number;
  /** Le même écart, en % du nombre moyen de comptes. */
  ecart: number;
}

/** Propriétaire « d'office » : choix manuel épinglé, sinon code ERP. */
export function fixedOwner(c: Client, state: Pick<PortfolioState, "pins" | "owners" | "team">): { owner: string; reason: Reason } | null {
  // Épinglé sans propriétaire = gardé volontairement dans le pool (owner "").
  if (state.pins[c.id]) return { owner: state.owners[c.id] ?? "", reason: "manuel" };
  const m = state.team.find((t) => t.codes.includes(c.code));
  return m ? { owner: m.id, reason: "code" } : null;
}

const LYON: [number, number] = [45.758, 4.835];

/**
 * Proposition de répartition :
 *  1. le responsable garde ses codes (18) et les choix manuels sont respectés ;
 *  2. un compte (payeur + sites) n'est jamais coupé : ses fiches libres rejoignent
 *     la personne qui en tient déjà une partie ;
 *  3. les plus gros comptes du pool (le plus de sites) sont réservés au responsable ;
 *  4. le reste est partagé entre les commerciaux en nombre de comptes : autant de
 *     comptes de chaque typologie pour chacun (ou des secteurs géographiques
 *     d'autant de comptes).
 */
export function propose(state: PortfolioState, accounts?: Map<string, Account>): Proposal {
  const { team, settings } = state;
  const active = activeClients(state.clients, state.merges);
  const roles = computeRoles(active, state.merges, settings.zone, state.siteUnique);
  const accts = accounts ?? buildAccounts(state.clients, state.merges, settings.zone, roles);
  const clients = new Map(active.map((c) => [c.id, c]));
  const isSite = (c: Client) => (roles.get(c.id) === "site" ? 1 : 0);
  const owners: Record<string, string> = {};
  const reasons: Record<string, Reason> = {};
  const responsable = team.find((m) => m.responsable);
  const receivers = team.filter((m) => m.recoit && m.part > 0);

  const pool: Account[] = [];
  accts.forEach((a) => {
    const fixedScore = new Map<string, number>();
    const free: Client[] = [];
    for (const id of a.clientIds) {
      const c = clients.get(id)!;
      const f = fixedOwner(c, state);
      if (f && !f.owner) {
        reasons[a.id] ??= "manuel";
        continue;
      }
      if (f) {
        owners[id] = f.owner;
        fixedScore.set(f.owner, (fixedScore.get(f.owner) ?? 0) + 1);
        if (!reasons[a.id] || f.reason === "manuel") reasons[a.id] = f.reason;
      } else free.push(c);
    }
    if (!free.length) return;
    if (fixedScore.size && settings.rattacherComptes) {
      const best = [...fixedScore].sort((x, y) => y[1] - x[1])[0][0];
      free.forEach((c) => (owners[c.id] = best));
      reasons[a.id] = reasons[a.id] === "manuel" ? "manuel" : "compte";
      return;
    }
    if (fixedScore.size) {
      // Compte coupé volontairement : les fiches libres restent à répartir, on ne partage que la partie libre.
      const siteIds = free.filter((c) => roles.get(c.id) === "site").map((c) => c.id);
      const part: Account = { ...a, clientIds: free.map((c) => c.id), siteIds, sites: siteIds.length, score: Math.max(1, free.reduce((s, c) => s + isSite(c), 0)) };
      pool.push(part);
      return;
    }
    pool.push(a);
  });

  pool.sort((x, y) => y.score - x.score || x.nom.localeCompare(y.nom));
  let rest = pool;
  if (responsable && settings.grandsComptes > 0) {
    const reserved = rest.slice(0, settings.grandsComptes);
    reserved.forEach((a) => {
      a.clientIds.forEach((id) => (owners[id] = responsable.id));
      reasons[a.id] = "grand-compte";
    });
    rest = rest.slice(settings.grandsComptes);
  }

  if (receivers.length) {
    if (settings.mode === "territoire") splitByTerritory(rest, receivers, owners, reasons);
    else splitBySegment(rest, receivers, owners, reasons, accts, clients, settings.proximite, roles);
  } else rest.forEach((a) => (reasons[a.id] = "pool"));

  const stats = memberStats(team, owners, accts);
  return { owners, reasons, stats, ...ecartOf(stats, receivers) };
}

/** Écart de nombre de comptes entre commerciaux, ramené à une part égale. */
export function ecartOf(stats: MemberStats[], receivers: Member[]): { ecartComptes: number; ecart: number } {
  const parts = receivers.map((r) => ({ r, s: stats.find((s) => s.id === r.id) })).filter((x) => x.s);
  if (parts.length < 2) return { ecartComptes: 0, ecart: 0 };
  const mean = parts.reduce((s, x) => s + x.r.part, 0) / parts.length;
  const norms = parts.map((x) => (x.s!.comptes / x.r.part) * mean);
  const avg = norms.reduce((s, v) => s + v, 0) / norms.length;
  const ecartComptes = Math.round(Math.max(...norms) - Math.min(...norms));
  return { ecartComptes, ecart: avg ? ecartComptes / avg : 0 };
}

function splitBySegment(
  pool: Account[],
  receivers: Member[],
  owners: Record<string, string>,
  reasons: Record<string, Reason>,
  accts: Map<string, Account>,
  clients: Map<string, Client>,
  proximite: boolean,
  roles: Map<string, AddressRole>,
) {
  // Tout se compte en comptes : par typologie, au total, plus la taille (sites) pour alterner les gros.
  const segLoad = new Map<string, Map<SegmentId, number>>(receivers.map((m) => [m.id, new Map()]));
  const total = new Map<string, number>(receivers.map((m) => [m.id, 0]));
  const size = new Map<string, number>(receivers.map((m) => [m.id, 0]));
  const presence = new Map<string, Map<string, number>>(receivers.map((m) => [m.id, new Map()]));
  // Proximité : uniquement les lieux d'intervention (une adresse de siège ne dit rien du terrain).
  const place = (c: Client) => (roles.get(c.id) !== "site" ? "" : c.cp ? c.cp : norm(c.ville));
  const addPresence = (m: string, c: Client) => {
    const k = place(c);
    if (k) presence.get(m)!.set(k, (presence.get(m)!.get(k) ?? 0) + 1);
  };
  const add = (m: string, a: Account) => {
    segLoad.get(m)!.set(a.segment, (segLoad.get(m)!.get(a.segment) ?? 0) + 1);
    total.set(m, total.get(m)! + 1);
    size.set(m, size.get(m)! + a.score);
  };

  // Charge de départ : les comptes que chaque commercial tient déjà (choix manuels).
  accts.forEach((a) => {
    const held = new Set<string>();
    a.clientIds.forEach((id) => {
      const o = owners[id];
      if (!o || !segLoad.has(o)) return;
      held.add(o);
      addPresence(o, clients.get(id)!);
    });
    held.forEach((o) => add(o, a));
  });

  const bySeg = new Map<SegmentId, Account[]>();
  pool.forEach((a) => bySeg.set(a.segment, [...(bySeg.get(a.segment) ?? []), a]));
  const order = [...bySeg].sort((x, y) => y[1].length - x[1].length);
  const eps = 1e-9;

  for (const [seg, list] of order) {
    list.forEach((a, i) => {
      // 1. Celui qui a le moins de comptes de cette typologie (à part égale).
      const load = (m: Member) => (segLoad.get(m.id)!.get(seg) ?? 0) / m.part;
      const min = Math.min(...receivers.map(load));
      let candidates = receivers.filter((m) => load(m) - min < eps);
      // 2. Dernier compte impair de la typologie : il va à celui qui a le moins de comptes au total.
      if (list.length - i < candidates.length) {
        const tot = (m: Member) => total.get(m.id)! / m.part;
        const tmin = Math.min(...candidates.map(tot));
        candidates = candidates.filter((m) => tot(m) - tmin < eps);
      }
      // 3. Proximité : celui qui est déjà présent dans les mêmes villes.
      if (proximite && candidates.length > 1) {
        const places = new Set(a.clientIds.map((id) => place(clients.get(id)!)).filter(Boolean));
        const affinity = (m: Member) => [...places].reduce((s, p) => s + (presence.get(m.id)!.get(p) ?? 0), 0);
        const best = Math.max(...candidates.map(affinity));
        if (best > 0) candidates = candidates.filter((m) => affinity(m) === best);
      }
      // 4. Sinon celui qui a les plus petits comptes : les gros sont alternés.
      const chosen = candidates.sort((x, y) => size.get(x.id)! / x.part - size.get(y.id)! / y.part || total.get(x.id)! / x.part - total.get(y.id)! / y.part)[0];
      a.clientIds.forEach((id) => {
        owners[id] = chosen.id;
        addPresence(chosen.id, clients.get(id)!);
      });
      add(chosen.id, a);
      reasons[a.id] = "equilibre";
    });
  }
}

/** Secteurs en « parts de camembert » autour de Lyon, d'autant de comptes chacun, orientés pour équilibrer aussi les typologies. */
function splitByTerritory(pool: Account[], receivers: Member[], owners: Record<string, string>, reasons: Record<string, Reason>) {
  if (!pool.length) return;
  const angle = (a: Account) =>
    a.lat === undefined || a.lng === undefined
      ? 0
      : (Math.atan2(a.lat - LYON[0], (a.lng - LYON[1]) * Math.cos((LYON[0] * Math.PI) / 180)) + 2 * Math.PI) % (2 * Math.PI);
  const sorted = [...pool].sort((x, y) => angle(x) - angle(y));
  const totalScore = sorted.length;
  const partSum = receivers.reduce((s, m) => s + m.part, 0);
  const segTotals = new Map<SegmentId, number>();
  sorted.forEach((a) => segTotals.set(a.segment, (segTotals.get(a.segment) ?? 0) + 1));

  let best: { cost: number; assign: number[] } | null = null;
  for (let shift = 0; shift < sorted.length; shift += Math.max(1, Math.floor(sorted.length / 72))) {
    const assign: number[] = new Array(sorted.length);
    let k = 0;
    let acc = 0;
    let bound = (totalScore * receivers[0].part) / partSum;
    for (let i = 0; i < sorted.length; i++) {
      const idx = (i + shift) % sorted.length;
      if (k < receivers.length - 1 && acc + 0.5 > bound) {
        k++;
        bound += (totalScore * receivers[k].part) / partSum;
      }
      assign[idx] = k;
      acc += 1;
    }
    let cost = 0;
    receivers.forEach((m, r) => {
      const share = m.part / partSum;
      const got = new Map<SegmentId, number>();
      let tot = 0;
      sorted.forEach((a, i) => {
        if (assign[i] !== r) return;
        got.set(a.segment, (got.get(a.segment) ?? 0) + 1);
        tot += 1;
      });
      cost += 3 * Math.abs(tot - totalScore * share);
      segTotals.forEach((t, seg) => (cost += Math.abs((got.get(seg) ?? 0) - t * share)));
    });
    if (!best || cost < best.cost) best = { cost, assign };
  }
  sorted.forEach((a, i) => {
    const m = receivers[best!.assign[i]];
    a.clientIds.forEach((id) => (owners[id] = m.id));
    reasons[a.id] = "territoire";
  });
}

/** Comptes de chacun : un compte compte pour chaque personne qui en tient au moins une fiche. */
export function memberStats(team: Member[], owners: Record<string, string>, accts: Map<string, Account>): MemberStats[] {
  const empty = () => Object.fromEntries(SEGMENTS.map((s) => [s.id, 0])) as MemberStats["parSegment"];
  const stats = new Map(team.map((m) => [m.id, { id: m.id, comptes: 0, parSegment: empty() }]));
  accts.forEach((a) => {
    const held = new Set(a.clientIds.map((id) => owners[id]).filter(Boolean));
    held.forEach((o) => {
      const s = stats.get(o);
      if (!s) return;
      s.comptes++;
      s.parSegment[a.segment]++;
    });
  });
  return [...stats.values()];
}

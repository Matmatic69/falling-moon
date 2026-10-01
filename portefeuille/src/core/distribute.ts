import { accountOf, activeClients, buildAccounts } from "./accounts";
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
  comptes: number;
  clients: number;
  contrats: number;
  score: number;
  parSegment: Record<SegmentId, { clients: number; score: number }>;
}

export interface Proposal {
  owners: Record<string, string>;
  reasons: Record<string, Reason>;
  stats: MemberStats[];
  /** Écart max entre commerciaux qui se partagent le pool (en % du score moyen). */
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
 *  3. les plus gros comptes du pool sont réservés au responsable ;
 *  4. le reste est partagé entre les commerciaux, équilibré typologie par
 *     typologie (ou par secteurs géographiques), du plus gros au plus petit.
 */
export function propose(state: PortfolioState, accounts?: Map<string, Account>): Proposal {
  const { team, settings } = state;
  const accts = accounts ?? buildAccounts(state.clients, state.merges, settings.poidsContrat);
  const clients = new Map(activeClients(state.clients, state.merges).map((c) => [c.id, c]));
  const weight = (c: Client) => 1 + (c.contrat ? settings.poidsContrat : 0);
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
        fixedScore.set(f.owner, (fixedScore.get(f.owner) ?? 0) + weight(c));
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
      const part: Account = { ...a, clientIds: free.map((c) => c.id), sites: free.length, score: free.reduce((s, c) => s + weight(c), 0) };
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
    else splitBySegment(rest, receivers, owners, reasons, accts, clients, settings.proximite, weight);
  } else rest.forEach((a) => (reasons[a.id] = "pool"));

  const stats = memberStats(team, owners, clients, accts, weight);
  const recv = stats.filter((s) => receivers.some((r) => r.id === s.id));
  const norms = recv.map((s) => s.score / receivers.find((r) => r.id === s.id)!.part);
  const mean = norms.reduce((s, v) => s + v, 0) / (norms.length || 1);
  const ecart = norms.length > 1 && mean ? (Math.max(...norms) - Math.min(...norms)) / mean : 0;
  return { owners, reasons, stats, ecart };
}

function splitBySegment(
  pool: Account[],
  receivers: Member[],
  owners: Record<string, string>,
  reasons: Record<string, Reason>,
  accts: Map<string, Account>,
  clients: Map<string, Client>,
  proximite: boolean,
  weight: (c: Client) => number,
) {
  const segLoad = new Map<string, Map<SegmentId, number>>(receivers.map((m) => [m.id, new Map()]));
  const total = new Map<string, number>(receivers.map((m) => [m.id, 0]));
  const presence = new Map<string, Map<string, number>>(receivers.map((m) => [m.id, new Map()]));
  const place = (c: Client) => (c.cp ? c.cp : norm(c.ville));

  // Charge de départ : ce que chaque commercial tient déjà (codes ERP, choix manuels).
  accts.forEach((a) =>
    a.clientIds.forEach((id) => {
      const o = owners[id];
      if (!o || !segLoad.has(o)) return;
      const c = clients.get(id)!;
      const w = weight(c);
      segLoad.get(o)!.set(c.segment, (segLoad.get(o)!.get(c.segment) ?? 0) + w);
      total.set(o, total.get(o)! + w);
      presence.get(o)!.set(place(c), (presence.get(o)!.get(place(c)) ?? 0) + 1);
    }),
  );

  const partSum = receivers.reduce((s, m) => s + m.part, 0);
  const bySeg = new Map<SegmentId, Account[]>();
  pool.forEach((a) => bySeg.set(a.segment, [...(bySeg.get(a.segment) ?? []), a]));
  const order = [...bySeg].sort((x, y) => y[1].reduce((s, a) => s + a.score, 0) - x[1].reduce((s, a) => s + a.score, 0));

  for (const [seg, list] of order) {
    const segTotal = list.reduce((s, a) => s + a.score, 0);
    const slack = Math.max(1, (0.05 * segTotal) / partSum);
    for (const a of list) {
      const load = (m: Member) => (segLoad.get(m.id)!.get(seg) ?? 0) / m.part;
      const min = Math.min(...receivers.map(load));
      let candidates = receivers.filter((m) => load(m) - min <= (proximite ? slack / m.part : 0));
      if (proximite && candidates.length > 1) {
        const places = new Set(a.clientIds.map((id) => place(clients.get(id)!)));
        const affinity = (m: Member) => [...places].reduce((s, p) => s + (presence.get(m.id)!.get(p) ?? 0), 0);
        const best = Math.max(...candidates.map(affinity));
        if (best > 0) candidates = candidates.filter((m) => affinity(m) === best);
      }
      const chosen = candidates.sort((x, y) => load(x) - load(y) || total.get(x.id)! / x.part - total.get(y.id)! / y.part)[0];
      a.clientIds.forEach((id) => {
        owners[id] = chosen.id;
        const c = clients.get(id)!;
        presence.get(chosen.id)!.set(place(c), (presence.get(chosen.id)!.get(place(c)) ?? 0) + 1);
      });
      segLoad.get(chosen.id)!.set(seg, (segLoad.get(chosen.id)!.get(seg) ?? 0) + a.score);
      total.set(chosen.id, total.get(chosen.id)! + a.score);
      reasons[a.id] = "equilibre";
    }
  }
}

/** Secteurs en « parts de camembert » autour de Lyon, de score égal, orientés pour équilibrer aussi les typologies. */
function splitByTerritory(pool: Account[], receivers: Member[], owners: Record<string, string>, reasons: Record<string, Reason>) {
  if (!pool.length) return;
  const angle = (a: Account) =>
    a.lat === undefined || a.lng === undefined
      ? 0
      : (Math.atan2(a.lat - LYON[0], (a.lng - LYON[1]) * Math.cos((LYON[0] * Math.PI) / 180)) + 2 * Math.PI) % (2 * Math.PI);
  const sorted = [...pool].sort((x, y) => angle(x) - angle(y));
  const totalScore = sorted.reduce((s, a) => s + a.score, 0);
  const partSum = receivers.reduce((s, m) => s + m.part, 0);
  const segTotals = new Map<SegmentId, number>();
  sorted.forEach((a) => segTotals.set(a.segment, (segTotals.get(a.segment) ?? 0) + a.score));

  let best: { cost: number; assign: number[] } | null = null;
  for (let shift = 0; shift < sorted.length; shift += Math.max(1, Math.floor(sorted.length / 72))) {
    const assign: number[] = new Array(sorted.length);
    let k = 0;
    let acc = 0;
    let bound = (totalScore * receivers[0].part) / partSum;
    for (let i = 0; i < sorted.length; i++) {
      const idx = (i + shift) % sorted.length;
      const s = sorted[idx].score;
      if (k < receivers.length - 1 && acc + s / 2 > bound) {
        k++;
        bound += (totalScore * receivers[k].part) / partSum;
      }
      assign[idx] = k;
      acc += s;
    }
    let cost = 0;
    receivers.forEach((m, r) => {
      const share = m.part / partSum;
      const got = new Map<SegmentId, number>();
      let tot = 0;
      sorted.forEach((a, i) => {
        if (assign[i] !== r) return;
        got.set(a.segment, (got.get(a.segment) ?? 0) + a.score);
        tot += a.score;
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

export function memberStats(
  team: Member[],
  owners: Record<string, string>,
  clients: Map<string, Client>,
  accts: Map<string, Account>,
  weight: (c: Client) => number,
): MemberStats[] {
  const empty = () => Object.fromEntries(SEGMENTS.map((s) => [s.id, { clients: 0, score: 0 }])) as MemberStats["parSegment"];
  const stats = new Map(team.map((m) => [m.id, { id: m.id, comptes: 0, clients: 0, contrats: 0, score: 0, parSegment: empty() }]));
  const acctOf = accountOf(accts);
  const counted = new Set<string>();
  clients.forEach((c) => {
    const o = owners[c.id];
    const s = o ? stats.get(o) : undefined;
    if (!s) return;
    const w = weight(c);
    s.clients++;
    s.score += w;
    if (c.contrat) s.contrats++;
    s.parSegment[c.segment].clients++;
    s.parSegment[c.segment].score += w;
    const k = `${o}|${acctOf.get(c.id)}`;
    if (!counted.has(k)) {
      counted.add(k);
      s.comptes++;
    }
  });
  return [...stats.values()].map((s) => ({ ...s, score: Math.round(s.score * 10) / 10 }));
}

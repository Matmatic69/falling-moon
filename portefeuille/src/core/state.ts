import { activeClients } from "./accounts";
import { fixedOwner, propose } from "./distribute";
import type { Client, Member, PortfolioState, Settings } from "./types";

export interface TeamSetup {
  responsable: { nom: string; code: string };
  commerciaux: string[];
  /** Code ERP d'un commercial parti, dont les clients sont à répartir. */
  parti?: { code: string; nom: string };
}

export const DEFAULT_SETTINGS: Settings = {
  poidsContrat: 2,
  rattacherComptes: true,
  grandsComptes: 10,
  mode: "type",
  proximite: true,
  libellesCodes: {},
};

export function slugId(nom: string, taken: Set<string>): string {
  const base =
    nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "membre";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

export function buildTeam(setup: TeamSetup): { team: Member[]; libellesCodes: Record<string, string> } {
  const taken = new Set<string>();
  const team: Member[] = [
    { id: slugId(setup.responsable.nom, taken), nom: setup.responsable.nom, codes: setup.responsable.code ? [setup.responsable.code] : [], responsable: true, recoit: false, part: 1 },
    ...setup.commerciaux.filter((n) => n.trim()).map((n) => ({ id: slugId(n, taken), nom: n.trim(), codes: [], recoit: true, part: 1 })),
  ];
  const libellesCodes: Record<string, string> = {};
  if (setup.responsable.code) libellesCodes[setup.responsable.code] = setup.responsable.nom;
  if (setup.parti?.code) libellesCodes[setup.parti.code] = `${setup.parti.nom || "Ancien commercial"} (parti)`;
  return { team, libellesCodes };
}

export function randomId(bytes = 12): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
}

export function createState(clients: Client[], source: string, setup: TeamSetup): PortfolioState {
  const now = new Date().toISOString();
  const { team, libellesCodes } = buildTeam(setup);
  const state: PortfolioState = {
    v: 1,
    fileId: randomId(),
    savedAt: now,
    importedAt: now,
    source,
    team,
    settings: { ...DEFAULT_SETTINGS, libellesCodes },
    clients,
    owners: {},
    pins: {},
    merges: {},
    ignores: [],
    segmentOverrides: {},
    ajouts: [],
    journal: [{ at: now, par: team[0].id, msg: `Import de « ${source} » : ${clients.length} clients` }],
    returnKeys: {},
  };
  applyCodeOwners(state);
  return state;
}

/** Les clients dont le code ERP appartient à quelqu'un (ex. celui du responsable) lui sont attribués. */
export function applyCodeOwners(state: PortfolioState): void {
  for (const c of activeClients(state.clients, state.merges)) {
    const f = fixedOwner(c, state);
    if (f && f.reason === "code" && !state.pins[c.id]) state.owners[c.id] = f.owner;
  }
}

/** Applique la proposition automatique sur tout ce qui n'a pas été décidé à la main. */
export function applyProposal(state: PortfolioState): PortfolioState {
  const p = propose(state);
  const owners: Record<string, string> = {};
  for (const c of activeClients(state.clients, state.merges)) {
    if (state.pins[c.id]) {
      if (state.owners[c.id]) owners[c.id] = state.owners[c.id];
    } else if (p.owners[c.id]) owners[c.id] = p.owners[c.id];
  }
  return { ...state, owners };
}

export function ownerOf(state: PortfolioState, id: string): string | undefined {
  return state.owners[state.merges[id] ?? id];
}

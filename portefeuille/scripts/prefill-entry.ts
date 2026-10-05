import fs from "node:fs";
import * as XLSX from "xlsx";
import { findDuplicates, pickPrimary } from "../src/core/dedupe";
import { parseRows } from "../src/core/parse";
import { classifyAll } from "../src/core/segments";
import { applyProposal, createState, type TeamSetup } from "../src/core/state";
import type { Payload, SegmentId } from "../src/core/types";

/** Corrections propres à un client (fichier local, jamais dans le dépôt). Clés : numéros de payeur. */
export interface Patch {
  siteUnique?: string[];
  segments?: Record<string, SegmentId>;
  /** Comptes à épingler chez un membre (prénom → numéros de payeur). */
  epingler?: Record<string, string[]>;
  /** Groupes réservés au responsable (mots-clés) et comptes qui en portent le nom sans en faire partie. */
  groupes?: string[];
  groupesExclus?: string[];
  /** Sociétés à démarcher : prénom du commercial qui s'en occupe. */
  prospects?: { nom: string; ville: string; cp?: string; segment: SegmentId; owner: string; note?: string }[];
  /** Fichier partagé : consultation sans mot de passe pour l'équipe, gestion sous mot de passe. */
  partage?: boolean;
  /** Enseignes dont les adresses d'un même compte sont regroupées (ex. « LCL »). */
  regrouper?: string[];
}
import { deriveKey, randomBytes, seal, toB64 } from "../src/lib/crypto";

/** Prépare les données chiffrées d'un fichier responsable à partir d'un export ERP (usage local uniquement). */
export async function prefill(file: string, password: string, setup: TeamSetup, appliquer = false, patch: Patch = {}) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const { clients, report } = parseRows(rows);
  let state = createState(clients, file.split(/[\\/]/).pop() ?? "export", setup);
  const known = new Set(state.clients.map((c) => c.id));
  if (patch.regrouper) state.settings = { ...state.settings, regrouper: patch.regrouper };
  if (patch.siteUnique) state.siteUnique = patch.siteUnique.filter((id) => known.has(id));
  if (patch.groupes) state.settings = { ...state.settings, groupes: patch.groupes, groupesExclus: (patch.groupesExclus ?? []).filter((id) => known.has(id)) };
  if (patch.prospects)
    state.prospects = patch.prospects.flatMap((p, i) => {
      const m = state.team.find((t) => t.nom === p.owner);
      return m ? [{ ...p, owner: m.id, id: `P-${i + 1}`, le: state.importedAt }] : [];
    });
  if (patch.segments) state.segmentOverrides = Object.fromEntries(Object.entries(patch.segments).filter(([id]) => known.has(id)));
  if (patch.epingler) {
    for (const [nom, ids] of Object.entries(patch.epingler)) {
      const m = state.team.find((t) => t.nom === nom);
      if (!m) continue;
      const set = new Set(ids);
      for (const c of state.clients) {
        if (set.has(c.id) || (c.payeur && set.has(c.payeur))) {
          state.owners[c.id] = m.id;
          state.pins[c.id] = true;
        }
      }
    }
  }
  if (appliquer) {
    // Fusionne les doublons quasi certains (même nom, même adresse), puis applique la proposition.
    const byId = new Map(state.clients.map((c) => [c.id, c]));
    const sites = new Map<string, number>();
    state.clients.forEach((c) => c.payeur && sites.set(c.payeur, (sites.get(c.payeur) ?? 0) + 1));
    const sure = findDuplicates(state.clients, {}, []).filter((g) => g.confiance >= 0.95);
    const merges: Record<string, string> = {};
    for (const g of sure) {
      const p = pickPrimary(g.ids, byId, sites);
      g.ids.filter((id) => id !== p).forEach((id) => (merges[id] = p));
    }
    const raw = state.clients;
    state = { ...applyProposal({ ...state, merges, clients: classifyAll(raw, state.segmentOverrides, merges) }), clients: raw };
    const now = new Date().toISOString();
    state.journal = [
      { at: now, par: state.team[0].id, msg: "Proposition automatique appliquée" },
      { at: now, par: state.team[0].id, msg: `${sure.length} groupes de doublons certains fusionnés (même nom, même adresse)` },
      ...state.journal,
    ];
    console.log(`  ${sure.length} groupes de doublons fusionnés, proposition appliquée`);
  }
  if (patch.partage) {
    state.settings = { ...state.settings, partage: true };
    state.teamKey = toB64(randomBytes(32));
  }
  const sk = await deriveKey(password);
  const payload: Payload = { role: "responsable", state };
  const env = await seal(payload, sk.key, { salt: sk.salt, iter: sk.iter });
  console.log(`  ${report.lignes} lignes → ${report.clients} clients${patch.partage ? " · fichier partagé" : ""}`);
  // Même découpage que l'application (files.ts → teamLayer) : partie équipe sans réglages ni historique.
  const team = patch.partage ? { k: state.teamKey!, state: { ...state, teamKey: undefined, journal: [], returnKeys: {}, ajouts: [], ignores: [] } } : undefined;
  return { app: "portefeuille", v: 1, role: "responsable", fileId: state.fileId, savedAt: state.savedAt, env, ...(team ? { team } : {}) };
}

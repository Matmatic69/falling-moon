import fs from "node:fs";
import * as XLSX from "xlsx";
import { findDuplicates, pickPrimary } from "../src/core/dedupe";
import { parseRows } from "../src/core/parse";
import { applyProposal, createState, type TeamSetup } from "../src/core/state";
import type { Payload } from "../src/core/types";
import { deriveKey, seal } from "../src/lib/crypto";

/** Prépare les données chiffrées d'un fichier responsable à partir d'un export ERP (usage local uniquement). */
export async function prefill(file: string, password: string, setup: TeamSetup, appliquer = false) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const { clients, report } = parseRows(rows);
  let state = createState(clients, file.split(/[\\/]/).pop() ?? "export", setup);
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
    state = applyProposal({ ...state, merges });
    const now = new Date().toISOString();
    state.journal = [
      { at: now, par: state.team[0].id, msg: "Proposition automatique appliquée" },
      { at: now, par: state.team[0].id, msg: `${sure.length} groupes de doublons certains fusionnés (même nom, même adresse)` },
      ...state.journal,
    ];
    console.log(`  ${sure.length} groupes de doublons fusionnés, proposition appliquée`);
  }
  const sk = await deriveKey(password);
  const payload: Payload = { role: "responsable", state };
  const env = await seal(payload, sk.key, { salt: sk.salt, iter: sk.iter });
  console.log(`  ${report.lignes} lignes → ${report.clients} clients`);
  return { app: "portefeuille", v: 1, role: "responsable", fileId: state.fileId, savedAt: state.savedAt, env };
}

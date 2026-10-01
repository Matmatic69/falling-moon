import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseRows } from "../src/core/parse";
import { createState, type TeamSetup } from "../src/core/state";
import type { Payload } from "../src/core/types";
import { deriveKey, seal } from "../src/lib/crypto";

/** Prépare les données chiffrées d'un fichier responsable à partir d'un export ERP (usage local uniquement). */
export async function prefill(file: string, password: string, setup: TeamSetup) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const { clients, report } = parseRows(rows);
  const state = createState(clients, file.split(/[\\/]/).pop() ?? "export", setup);
  const sk = await deriveKey(password);
  const payload: Payload = { role: "responsable", state };
  const env = await seal(payload, sk.key, { salt: sk.salt, iter: sk.iter });
  console.log(`  ${report.lignes} lignes → ${report.clients} clients`);
  return { app: "portefeuille", v: 1, role: "responsable", fileId: state.fileId, savedAt: state.savedAt, env };
}

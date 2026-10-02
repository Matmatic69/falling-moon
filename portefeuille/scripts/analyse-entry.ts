import fs from "node:fs";
import * as XLSX from "xlsx";
import { buildAccounts } from "../src/core/accounts";
import { findDuplicates } from "../src/core/dedupe";
import { parseRows } from "../src/core/parse";
import { SEGMENTS } from "../src/core/segments";
import type { Client } from "../src/core/types";

export async function run(file: string, out?: string) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const { clients, report } = parseRows(rows);
  console.log("RAPPORT", report);

  const count = <K extends string>(list: Client[], key: (c: Client) => K) => {
    const m = new Map<K, number>();
    list.forEach((c) => m.set(key(c), (m.get(key(c)) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  console.log("\nSEGMENTS");
  for (const s of SEGMENTS) {
    const l = clients.filter((c) => c.segment === s.id);
    const src = count(l, (c) => c.segmentSource).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`${s.label.padEnd(36)} ${String(l.length).padStart(5)}  [${src}]`);
  }
  console.log("\nGEO", count(clients, (c) => c.geo ?? "aucune"));
  console.log("CODES", count(clients, (c) => c.code).map(([k, v]) => `${k}:${v}`).join(" "));

  const dups = findDuplicates(clients, {}, []);
  console.log("\nDOUBLONS PROBABLES", dups.length, "groupes,", dups.reduce((s, g) => s + g.ids.length, 0), "fiches");
  const byConf = new Map<string, number>();
  dups.forEach((g) => byConf.set(g.raisons[0], (byConf.get(g.raisons[0]) ?? 0) + 1));
  console.log([...byConf]);
  const byId = new Map(clients.map((c) => [c.id, c]));
  for (const g of dups.slice(0, 12)) console.log(g.confiance, g.raisons.join(" / "), "→", g.ids.map((id) => `${id}:${byId.get(id)!.nom}|${byId.get(id)!.cp}|${byId.get(id)!.code}`).join("  ;  "));

  const accounts = buildAccounts(clients, {});
  console.log("\nCOMPTES", accounts.size);
  if (out) fs.writeFileSync(out, JSON.stringify({ clients, dups }));
}

export async function runDistribution(file: string) {
  const { createState } = await import("../src/core/state");
  const { propose, REASON_LABEL } = await import("../src/core/distribute");
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const { clients } = parseRows(rows);
  const st = createState(clients, "Export.xlsx", { responsable: { nom: "Responsable", code: "18" }, commerciaux: ["Commercial A", "Commercial B"], parti: { code: "17", nom: "" } });
  for (const gc of [10]) for (const mode of ["type", "territoire"] as const) for (const prox of mode === "type" ? [true, false] : [true]) {
    st.settings.grandsComptes = gc;
    st.settings.mode = mode;
    st.settings.proximite = prox;
    const p = propose(st);
    const reasons = new Map<string, number>();
    Object.values(p.reasons).forEach((r) => reasons.set(r, (reasons.get(r) ?? 0) + 1));
    console.log(`\n== grandsComptes=${gc} mode=${mode} proximité=${prox} écart=${p.ecartComptes} comptes (${(p.ecart * 100).toFixed(1)}%)`, [...reasons].map(([k, v]) => `${k}:${v}`).join(" "));
    for (const s of p.stats) {
      console.log(`${s.id.padEnd(7)} comptes ${String(s.comptes).padStart(4)}  | ` +
        SEGMENTS.filter((g) => g.id !== "autre").map((g) => `${g.court.slice(0, 5)}:${s.parSegment[g.id]}`).join(" "));
    }
  }
  const accts = buildAccounts(clients, {});
  st.settings.grandsComptes = 10; st.settings.mode = "type";
  const p = propose(st, accts);
  console.log("\nGrands comptes réservés:");
  [...accts.values()].filter((a) => p.reasons[a.id] === "grand-compte").forEach((a) => console.log(` ${a.nom} (${a.sites} sites, codes ${a.codes})`));
  console.log("\nComptes rattachés au responsable via son code :", [...accts.values()].filter((a) => p.reasons[a.id] === "compte" && p.owners[a.clientIds[0]] === st.team[0].id).length);
  void REASON_LABEL;
}

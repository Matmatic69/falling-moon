import * as XLSX from "xlsx";
import { parseRows, type ParseReport } from "../core/parse";
import { SEGMENT_BY_ID } from "../core/segments";
import type { Client, Member } from "../core/types";

/** Lit un export ERP (.xls, .xlsx ou .csv) entièrement dans le navigateur. */
export async function readExport(file: File): Promise<{ clients: Client[]; report: ParseReport }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellStyles: false, cellHTML: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
  return parseRows(rows);
}

const row = (c: Client, owner: string, codeLabel: (code: string) => string) => ({
  Propriétaire: owner,
  Numéro: c.numero,
  Client: c.nom,
  Typologie: SEGMENT_BY_ID[c.segment].label,
  Adresse: c.adresse,
  CP: c.cp,
  Ville: c.ville,
  "Sous contrat": c.contrat ? "Oui" : "",
  "Payeur (n°)": c.payeur ?? "",
  Payeur: c.payeurNom ?? "",
  Téléphone: c.tel ?? "",
  Portable: c.portable ?? "",
  Contact: c.contact ?? "",
  "E-mail": c.mail ?? "",
  SIREN: c.siren ?? "",
  "Code ERP d'origine": codeLabel(c.code),
  "Ajouté dans l'outil": c.ajout ? `${c.ajout.le.slice(0, 10)}` : "",
});

const HEADER = [
  "Propriétaire", "Numéro", "Client", "Typologie", "Adresse", "CP", "Ville", "Sous contrat", "Payeur (n°)", "Payeur",
  "Téléphone", "Portable", "Contact", "E-mail", "SIREN", "Code ERP d'origine", "Ajouté dans l'outil",
];

/** Classeur : un onglet par personne + « À répartir ». */
export function exportWorkbook(
  clients: Client[],
  team: Member[],
  ownerOf: (c: Client) => string | undefined,
  codeLabel: (code: string) => string,
  only?: string,
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const groups: [string, Client[]][] = team
    .filter((m) => !only || m.id === only)
    .map((m) => [m.nom, clients.filter((c) => ownerOf(c) === m.id)]);
  if (!only) groups.push(["À répartir", clients.filter((c) => !ownerOf(c))]);
  for (const [name, list] of groups) {
    const ws = XLSX.utils.json_to_sheet(
      list.map((c) => row(c, name, codeLabel)),
      { header: HEADER },
    );
    ws["!cols"] = [14, 9, 34, 26, 34, 7, 20, 9, 9, 26, 13, 13, 18, 28, 15, 16, 12].map((w) => ({ wch: w }));
    ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

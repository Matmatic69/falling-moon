import { locate } from "./geo";
import { norm } from "./normalize";
import { classify, defaultSegment } from "./segments";
import type { Client } from "./types";

type Field =
  | "numero" | "type" | "nom" | "rue1" | "rue2" | "rue3" | "cp" | "ville" | "motCle" | "telSociete" | "contact" | "tel"
  | "portable" | "payeur" | "payeurNom" | "famille" | "sousFamille" | "mail" | "code" | "siren" | "secteurGeo"
  | "technicien" | "contrat";

// En-têtes reconnus (normalisés) → champ. Couvre l'export ERP et des fichiers plus génériques.
const HEADERS: Record<string, Field> = {
  NUMERO: "numero", "NUMERO CLIENT": "numero", "CODE CLIENT": "numero", "N CLIENT": "numero",
  TYPE: "type",
  "RAISON SOCIALE": "nom", NOM: "nom", "NOM CLIENT": "nom", CLIENT: "nom",
  "RUE 1": "rue1", ADRESSE: "rue1", "ADRESSE 1": "rue1", "RUE 2": "rue2", "ADRESSE 2": "rue2", "RUE 3": "rue3",
  CP: "cp", "CODE POSTAL": "cp", VILLE: "ville", COMMUNE: "ville",
  "MOT CLE": "motCle",
  "TEL SOCIETE": "telSociete", TELEPHONE: "telSociete", CONTACT: "contact", TEL: "tel", PORTABLE: "portable",
  PAYEUR: "payeur", "RAISON SOCIALE PAYEUR": "payeurNom",
  FAMILLE: "famille", "SOUS FAMILLE": "sousFamille",
  "MAIL CONTACT": "mail", MAIL: "mail", EMAIL: "mail", "E MAIL": "mail",
  COMMERCIAL: "code", REPRESENTANT: "code", VENDEUR: "code",
  "CODE SIREN": "siren", SIREN: "siren", SIRET: "siren",
  "SECTEUR GEOGRAPHIQUE": "secteurGeo", TECHNICIEN: "technicien", "SOUS CONTRATS": "contrat", "SOUS CONTRAT": "contrat",
};

export interface ParseReport {
  lignes: number;
  clients: number;
  lignesFusionnees: number;
  lignesIdentiques: number;
  numerosMultiAdresses: number;
  colonnesReconnues: string[];
  colonnesManquantes: string[];
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Transforme les lignes brutes d'un export (1re ligne = en-têtes) en fiches clients dédoublonnées par numéro. */
export function parseRows(rows: unknown[][]): { clients: Client[]; report: ParseReport } {
  const headerIdx = rows.findIndex((r) => r.some((c) => HEADERS[norm(String(c ?? ""))] === "nom"));
  if (headerIdx < 0) throw new Error("Colonne « Raison sociale » ou « Nom » introuvable dans le fichier.");
  const header = rows[headerIdx].map((h) => HEADERS[norm(String(h ?? ""))]);
  const reconnues = new Set(header.filter(Boolean) as Field[]);
  const essentielles: Field[] = ["numero", "nom", "cp", "ville", "code"];

  const byNumero = new Map<string, Client>();
  const seenRows = new Set<string>();
  let lignes = 0;
  let identiques = 0;
  let fusionnees = 0;
  const multi = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw || raw.every((c) => clean(c) === "")) continue;
    lignes++;
    const sig = raw.map(clean).join("\u0001");
    if (seenRows.has(sig)) {
      identiques++;
      continue;
    }
    seenRows.add(sig);

    const r: Partial<Record<Field, string>> = {};
    header.forEach((f, j) => {
      if (f && r[f] === undefined) r[f] = clean(raw[j]);
    });
    if (!r.nom) continue;
    const numero = r.numero || `L${i}`;
    const adresse = [r.rue1, r.rue2, r.rue3].filter(Boolean).join(", ");
    let cp = (r.cp || "").replace(/\D/g, "");
    if (cp.length === 4) cp = "0" + cp;

    const existing = byNumero.get(numero);
    if (existing) {
      fusionnees++;
      multi.add(numero);
      const autre = [adresse, cp, r.ville].filter(Boolean).join(" ");
      const principale = [existing.adresse, existing.cp, existing.ville].filter(Boolean).join(" ");
      if (autre && autre !== principale && !existing.autresAdresses?.includes(autre)) {
        existing.autresAdresses = [...(existing.autresAdresses ?? []), autre];
      }
      existing.tel ||= r.telSociete || r.tel || undefined;
      existing.mail ||= r.mail || undefined;
      existing.contact ||= r.contact || undefined;
      existing.siren ||= r.siren || undefined;
      existing.contrat ||= r.contrat === "1";
      continue;
    }

    const seg = classify({ nom: r.nom, type: r.type || "", famille: r.famille, sousFamille: r.sousFamille, motCle: r.motCle });
    const client: Client = {
      id: numero,
      numero,
      type: r.type || "",
      nom: r.nom,
      adresse,
      cp,
      ville: r.ville || "",
      tel: r.telSociete || r.tel || undefined,
      portable: r.portable || undefined,
      contact: r.contact || undefined,
      mail: r.mail || undefined,
      siren: r.siren || undefined,
      motCle: r.motCle || undefined,
      payeur: r.payeur && r.payeur !== numero ? r.payeur : undefined,
      payeurNom: r.payeurNom || undefined,
      famille: r.famille || undefined,
      sousFamille: r.sousFamille || undefined,
      code: /^\d$/.test(r.code || "") ? "0" + r.code : r.code || "",
      contrat: r.contrat === "1" || /^(oui|o|x|vrai|true)$/i.test(r.contrat || ""),
      technicien: r.technicien || undefined,
      secteurGeo: r.secteurGeo || undefined,
      segment: seg.segment,
      segmentSource: seg.source,
    };
    const pos = locate(numero, cp, client.ville);
    if (pos) Object.assign(client, pos);
    byNumero.set(numero, client);
  }

  const clients = [...byNumero.values()];
  inheritFromPayer(clients);
  return {
    clients,
    report: {
      lignes,
      clients: clients.length,
      lignesFusionnees: fusionnees,
      lignesIdentiques: identiques,
      numerosMultiAdresses: multi.size,
      colonnesReconnues: [...reconnues],
      colonnesManquantes: essentielles.filter((f) => !reconnues.has(f)),
    },
  };
}

/**
 * Un site sans typologie claire prend celle de son payeur (ex. les sites d'une
 * mairie, d'une banque ou d'un syndic), quand celle-ci est explicite.
 */
export function inheritFromPayer(clients: Client[]): void {
  const byId = new Map(clients.map((c) => [c.id, c]));
  for (const c of clients) {
    if (c.segmentSource !== "defaut" || !c.payeur) continue;
    const p = byId.get(c.payeur);
    if (p && p.segment !== "autre" && p.segment !== "particulier" && p.segmentSource !== "defaut") {
      c.segment = p.segment;
      c.segmentSource = "payeur";
    }
  }
  for (const c of clients) if (c.segmentSource === "defaut" && c.segment === "autre") c.segment = defaultSegment(c.famille);
}

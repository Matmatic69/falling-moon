import { deptCode } from "./geo";
import type { Client } from "./types";

/**
 * Rôle d'une adresse :
 *  - « site » : un lieu d'intervention (là où sont les portes, barrières, rideaux…) ;
 *  - « facturation » : l'adresse d'un payeur qui a des sites (siège, régie, syndic) ;
 *  - « hors-zone » : un client facturé hors de la zone de travail sans site connu dans l'export
 *    (son adresse est celle du siège, le lieu d'intervention n'est pas renseigné).
 */
export type AddressRole = "site" | "facturation" | "hors-zone";

/** Auvergne-Rhône-Alpes et les départements qui la bordent. */
export const ZONE_DEFAUT = [
  "01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74",
  "04", "05", "12", "18", "19", "21", "23", "30", "39", "46", "48", "58", "71", "84",
];

export const ROLE_LABEL: Record<AddressRole, string> = {
  site: "Site d'intervention",
  facturation: "Adresse de facturation",
  "hors-zone": "Facturation hors zone (site inconnu)",
};

export function computeRoles(active: Client[], merges: Record<string, string>, zone: string[] = ZONE_DEFAUT): Map<string, AddressRole> {
  const ids = new Set(active.map((c) => c.id));
  const payers = new Set<string>();
  for (const c of active) {
    if (!c.payeur) continue;
    let p = c.payeur;
    for (let i = 0; i < 10 && merges[p]; i++) p = merges[p];
    if (p !== c.id && ids.has(p)) payers.add(p);
  }
  const inZone = new Set(zone);
  const roles = new Map<string, AddressRole>();
  for (const c of active) {
    if (payers.has(c.id)) roles.set(c.id, "facturation");
    else if (c.type === "1" && c.cp && !inZone.has(deptCode(c.cp))) roles.set(c.id, "hors-zone");
    else roles.set(c.id, "site");
  }
  return roles;
}

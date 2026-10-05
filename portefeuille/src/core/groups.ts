import { norm } from "./normalize";
import type { Account, Client } from "./types";

/** Forme comparable d'un nom ou d'un mot-clé : majuscules sans accents, mots séparés par un espace. */
export const groupKey = (s: string) => norm(s).replace(/[^A-Z0-9]+/g, " ").trim();

/**
 * Comptes des groupes réservés au responsable (un grand groupe et ses filiales) : un compte en fait partie
 * si le nom de son payeur, ou le payeur indiqué sur l'une de ses fiches, contient le mot-clé en mot entier.
 * Renvoie compte → mot-clé (forme comparable). Les comptes exclus à la main n'en font jamais partie.
 */
export function groupMatches(accts: Iterable<Account>, byId: Map<string, Client>, groupes: string[] = [], exclus: string[] = []): Map<string, string> {
  const out = new Map<string, string>();
  const keys = [...new Set(groupes.map(groupKey).filter(Boolean))];
  if (!keys.length) return out;
  const skip = new Set(exclus);
  for (const a of accts) {
    if (skip.has(a.id)) continue;
    const texts = [a.nom, ...a.clientIds.map((id) => byId.get(id)?.payeurNom ?? "")].map((t) => ` ${groupKey(t)} `);
    const k = keys.find((k) => texts.some((t) => t.includes(` ${k} `)));
    if (k) out.set(a.id, k);
  }
  return out;
}

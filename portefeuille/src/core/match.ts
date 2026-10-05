import { digits, mailKey, nameKey, norm, phoneKey, similarity, streetKey } from "./normalize";
import type { Client } from "./types";

export interface Candidate {
  nom: string;
  cp?: string;
  ville?: string;
  adresse?: string;
  tel?: string;
  mail?: string;
  siren?: string;
}

export interface Match {
  client: Client;
  score: number;
  raison: string;
}

/**
 * Clients existants qui ressemblent à un client qu'on s'apprête à ajouter.
 * Sert à bloquer l'ajout d'un client qui appartient déjà à quelqu'un.
 */
export function findMatches(cand: Candidate, clients: Client[], limit = 6): Match[] {
  const nk = nameKey(cand.nom);
  const cp = digits(cand.cp);
  const ville = norm(cand.ville).replace(/\s*CEDEX.*$/, "");
  const street = streetKey(cand.adresse);
  const tel = phoneKey(cand.tel);
  const mail = mailKey(cand.mail);
  const siren = digits(cand.siren).slice(0, 9);
  const out: Match[] = [];

  for (const c of clients) {
    if (!c.nom) continue;
    let score = 0;
    let raison = "";
    const ck = nameKey(c.nom);
    if (siren.length === 9 && digits(c.siren).slice(0, 9) === siren) {
      score = 0.95;
      raison = "Même SIREN";
    }
    if (tel && (phoneKey(c.tel) === tel || phoneKey(c.portable) === tel) && score < 0.9) {
      score = 0.9;
      raison = "Même téléphone";
    }
    if (mail && mailKey(c.mail) === mail && score < 0.9) {
      score = 0.9;
      raison = "Même e-mail";
    }
    if (nk.length >= 3) {
      const sim = ck === nk ? 1 : similarity(ck, nk);
      const samePlace = (cp && c.cp === cp) || (ville && norm(c.ville).replace(/\s*CEDEX.*$/, "") === ville);
      const sameStreet = street && streetKey(c.adresse) === street;
      let s = 0;
      let r = "";
      if (sim >= 0.82 && samePlace) {
        s = 0.7 + 0.3 * sim;
        r = sim === 1 ? "Même nom, même ville" : "Nom très proche, même ville";
      } else if (sim >= 0.6 && sameStreet && samePlace) {
        s = 0.8;
        r = "Même adresse";
      } else if (sim === 1) {
        s = cp || ville ? 0.6 : 0.75;
        r = "Même nom";
      } else if (sim >= 0.75 && nk.length >= 5) {
        s = 0.35 + 0.3 * sim;
        r = "Nom proche";
      }
      if (s > score) {
        score = s;
        raison = r;
      }
    }
    if (score >= 0.55) out.push({ client: c, score, raison });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Empreintes d'un client masqué : de quoi reconnaître un doublon sans pouvoir lire le nom. */
export function fingerprintKeys(c: Candidate): string[] {
  const keys: string[] = [];
  const nk = nameKey(c.nom);
  const cp = digits(c.cp);
  const ville = norm(c.ville).replace(/\s*CEDEX.*$/, "");
  if (nk && cp) keys.push(`n|${nk}|${cp}`);
  if (nk && ville) keys.push(`v|${nk}|${ville}`);
  const siren = digits(c.siren).slice(0, 9);
  if (siren.length === 9) keys.push(`s|${siren}`);
  const tel = phoneKey(c.tel);
  if (tel) keys.push(`t|${tel}`);
  const mail = mailKey(c.mail);
  if (mail) keys.push(`m|${mail}`);
  return keys;
}

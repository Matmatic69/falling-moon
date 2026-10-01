import { digits, nameKey, norm, similarity } from "./normalize";
import type { Client } from "./types";

export interface SearchIndex {
  entries: { c: Client; name: string; all: string; tel: string }[];
}

export function buildIndex(clients: Client[]): SearchIndex {
  return {
    entries: clients.map((c) => ({
      c,
      name: norm(c.nom),
      all: norm([c.nom, c.numero, c.ville, c.cp, c.adresse, c.payeurNom, c.contact, c.mail, c.motCle, c.siren].filter(Boolean).join(" ")),
      tel: [c.tel, c.portable].map(digits).filter(Boolean).join(" "),
    })),
  };
}

export interface Hit {
  c: Client;
  score: number;
}

/** Recherche tolérante : tous les mots doivent apparaître ; à défaut, rapprochement approximatif du nom. */
export function search(index: SearchIndex, query: string, limit = 50): Hit[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ");
  const qDigits = digits(query);
  const hits: Hit[] = [];
  for (const e of index.entries) {
    let score = 0;
    if (e.c.numero === query.trim()) score = 1000;
    else if (words.every((w) => e.all.includes(w))) {
      score = 100;
      if (e.name === q) score += 300;
      else if (e.name.startsWith(q)) score += 200;
      else if (e.name.includes(q)) score += 120;
      else if (words.every((w) => e.name.includes(w))) score += 80;
      score -= e.name.length / 100;
    } else if (qDigits.length >= 6 && e.tel.includes(qDigits)) score = 150;
    if (score) hits.push({ c: e.c, score });
  }
  if (hits.length === 0 && q.length >= 4) {
    const nq = nameKey(query);
    for (const e of index.entries) {
      const s = similarity(nameKey(e.c.nom), nq);
      if (s >= 0.55) hits.push({ c: e.c, score: s * 50 });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

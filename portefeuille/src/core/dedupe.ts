import { digits, mailKey, nameKey, norm, phoneKey, similarity, streetKey } from "./normalize";
import type { Client } from "./types";

export interface DuplicateGroup {
  /** Clé stable du groupe (ids triés) : sert à mémoriser « pas un doublon ». */
  key: string;
  ids: string[];
  /** 0 → 1 : certitude que ces fiches désignent le même client. */
  confiance: number;
  raisons: string[];
}

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Doublons probables entre numéros différents. Deux sites d'un même payeur à
 * des adresses différentes ne sont jamais des doublons (ce sont deux sites).
 */
export function findDuplicates(clients: Client[], merges: Record<string, string>, ignores: string[]): DuplicateGroup[] {
  const active = clients.filter((c) => !merges[c.id]);
  const keys = new Map(active.map((c) => [c.id, { name: nameKey(c.nom), street: streetKey(c.adresse.split(",")[0]) }]));
  const pairs = new Map<string, { a: string; b: string; score: number; raison: string }>();

  const consider = (a: Client, b: Client, score: number, raison: string) => {
    if (a.id === b.id) return;
    // Payeur et site, ou deux sites distincts d'un même payeur : relation normale.
    if (a.payeur === b.id || b.payeur === a.id) return;
    const ka = keys.get(a.id)!, kb = keys.get(b.id)!;
    if (a.payeur && a.payeur === b.payeur && ka.street !== kb.street) return;
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const cur = pairs.get(k);
    if (!cur || cur.score < score) pairs.set(k, { a: a.id, b: b.id, score, raison });
  };

  const block = (key: (c: Client) => string, fn: (list: Client[]) => void) => {
    const m = new Map<string, Client[]>();
    for (const c of active) {
      const k = key(c);
      if (!k) continue;
      const l = m.get(k);
      if (l) l.push(c);
      else m.set(k, [c]);
    }
    m.forEach((l) => l.length > 1 && l.length < 60 && fn(l));
  };

  // Même code postal : noms identiques ou très proches.
  block((c) => c.cp, (list) => {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ka = keys.get(a.id)!, kb = keys.get(b.id)!;
        if (!ka.name || !kb.name) continue;
        const sim = ka.name === kb.name ? 1 : similarity(ka.name, kb.name);
        if (sim < 0.86) continue;
        const sameStreet = !!ka.street && ka.street === kb.street;
        if (sim === 1 && sameStreet) consider(a, b, 0.97, "Même nom et même adresse");
        else if (sameStreet) consider(a, b, 0.85, "Nom très proche, même adresse");
        else if (sim === 1 && a.type === b.type && (!ka.street || !kb.street)) consider(a, b, 0.75, "Même nom, même code postal");
        else if (sim === 1 && a.type === "1" && b.type === "1") consider(a, b, 0.7, "Même nom et code postal, adresses différentes");
      }
  });

  // Même SIRET/SIREN : seulement au même endroit (une enseigne ou un ministère réutilise
  // souvent le même numéro pour des établissements différents).
  block((c) => (c.type === "1" ? digits(c.siren).slice(0, 9) : ""), (list) => {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.cp !== b.cp) continue;
        const sa = digits(a.siren), sb = digits(b.siren);
        const sim = similarity(keys.get(a.id)!.name, keys.get(b.id)!.name);
        if (sa.length === 14 && sa === sb && sim > 0.4) consider(a, b, 0.9, "Même SIRET, même code postal");
        else if (sim > 0.6) consider(a, b, 0.8, "Même SIREN, même code postal");
      }
  });

  // Même téléphone ou même e-mail nominatif, pour des donneurs d'ordre au nom proche.
  const contactBlock = (key: (c: Client) => string, label: string) =>
    block((c) => (c.type === "1" ? key(c) : ""), (list) => {
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (similarity(keys.get(a.id)!.name, keys.get(b.id)!.name) <= 0.55) continue;
          // Ailleurs : plusieurs établissements d'une même enseigne, pas un doublon.
          if (a.cp === b.cp || norm(a.ville) === norm(b.ville)) consider(a, b, 0.8, label);
        }
    });
  contactBlock((c) => phoneKey(c.tel), "Même téléphone");
  contactBlock((c) => mailKey(c.mail), "Même e-mail");

  const uf = new UnionFind();
  pairs.forEach((p) => uf.union(p.a, p.b));
  const groups = new Map<string, DuplicateGroup>();
  pairs.forEach((p) => {
    const root = uf.find(p.a);
    const g = groups.get(root) ?? { key: "", ids: [], confiance: 0, raisons: [] };
    for (const id of [p.a, p.b]) if (!g.ids.includes(id)) g.ids.push(id);
    g.confiance = Math.max(g.confiance, p.score);
    if (!g.raisons.includes(p.raison)) g.raisons.push(p.raison);
    groups.set(root, g);
  });
  const ignored = new Set(ignores);
  return [...groups.values()]
    .map((g) => ({ ...g, ids: g.ids.sort(), key: [...g.ids].sort().join("+") }))
    .filter((g) => !ignored.has(g.key))
    .sort((a, b) => b.confiance - a.confiance || b.ids.length - a.ids.length);
}

/** Fiche à conserver dans un groupe : la plus « riche » (donneur d'ordre, contrat, sites rattachés). */
export function pickPrimary(ids: string[], clients: Map<string, Client>, sitesCount: Map<string, number>): string {
  const score = (id: string) => {
    const c = clients.get(id)!;
    return (
      (c.type === "1" ? 100 : 0) +
      (sitesCount.get(id) ?? 0) * 10 +
      (c.contrat ? 5 : 0) +
      [c.tel, c.mail, c.siren, c.contact].filter(Boolean).length
    );
  };
  return [...ids].sort((a, b) => score(b) - score(a))[0];
}

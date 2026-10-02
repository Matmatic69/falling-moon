/** Majuscules, sans accents ni ponctuation, espaces simples. */
export function norm(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[''`´]/g, " ")
    .replace(/&/g, " ET ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const LEGAL = new Set([
  "SARL", "SAS", "SASU", "SA", "EURL", "SNC", "STE", "STE.", "SOCIETE", "ETS", "ETABLISSEMENTS", "ETABLISSEMENT",
  "SITE", "C", "O", "CO", "LA", "LE", "LES", "DE", "DU", "DES", "D", "L", "ET", "SELARL", "GIE", "SCP",
]);

/** Nom « comparable » : sans forme juridique, articles ni mentions de site. */
export function nameKey(s: string | undefined | null): string {
  return norm(s)
    .split(" ")
    .filter((w) => w && !LEGAL.has(w))
    .join(" ");
}

export function digits(s: string | undefined | null): string {
  return (s || "").replace(/\D+/g, "");
}

/** Téléphone français normalisé sur 10 chiffres, ou "". */
export function phoneKey(s: string | undefined | null): string {
  let d = digits(s);
  if (d.startsWith("0033")) d = "0" + d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = "0" + d.slice(2);
  return d.length === 10 ? d : "";
}

const GENERIC_MAIL = /^(contact|info|infos|accueil|compta|comptabilite|facture|factures|facturation|administration|secretariat|direction|commercial|bonjour|hello)[@.]/;

export function mailKey(s: string | undefined | null): string {
  const m = (s || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m) && !GENERIC_MAIL.test(m) ? m : "";
}

export function streetKey(s: string | undefined | null): string {
  return norm(s)
    .replace(/\b(RUE|AVENUE|AV|BD|BOULEVARD|CHEMIN|CH|ROUTE|RTE|PLACE|PL|ALLEE|IMPASSE|IMP|QUAI|COURS|BIS|TER)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Map<string, number> {
  const t = new Map<string, number>();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) {
    const g = p.slice(i, i + 3);
    t.set(g, (t.get(g) || 0) + 1);
  }
  return t;
}

/** Similarité de Dice sur trigrammes (0 → 1). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  let total = 0;
  ta.forEach((n, g) => {
    total += n;
    const m = tb.get(g);
    if (m) inter += Math.min(n, m);
  });
  tb.forEach((n) => (total += n));
  return (2 * inter) / total;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’/(])([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(Sdc|Sci|Sas|Sarl|Asl|Aful|Lcl|Mdm|Ehpad|Opac|Oph|Bnp|Sncf|Edf|Grdf|Lpa|Capi|Ccas|Iut|Ime|Snc|Eurl|Sa|Rpa|Cfp)\b/g, (m) => m.toUpperCase());
}

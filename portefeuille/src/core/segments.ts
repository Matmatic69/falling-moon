import { norm } from "./normalize";
import type { SegmentId, SegmentSource } from "./types";

export interface SegmentDef {
  id: SegmentId;
  label: string;
  court: string;
}

/** Typologies de clients, dans l'ordre d'affichage. */
export const SEGMENTS: SegmentDef[] = [
  { id: "industrie", label: "Industrie & entreprises", court: "Industrie" },
  { id: "tertiaire", label: "Tertiaire, bureaux & banques", court: "Tertiaire" },
  { id: "immobilier", label: "Immobilier, syndics & bailleurs", court: "Immobilier" },
  { id: "public", label: "Collectivités & enseignement", court: "Public" },
  { id: "sante", label: "Santé & médico-social", court: "Santé" },
  { id: "commerce", label: "Commerces & automobile", court: "Commerce" },
  { id: "boulangerie", label: "Boulangeries & métiers de bouche", court: "Boulangerie" },
  { id: "hotellerie", label: "Hôtellerie & restauration", court: "Hôtellerie" },
  { id: "parking", label: "Parkings", court: "Parkings" },
  { id: "particulier", label: "Particuliers", court: "Particuliers" },
  { id: "autre", label: "À qualifier", court: "À qualifier" },
];

export const SEGMENT_BY_ID: Record<SegmentId, SegmentDef> = Object.fromEntries(SEGMENTS.map((s) => [s.id, s])) as Record<
  SegmentId,
  SegmentDef
>;

// Sous-familles ERP dont le sens est sans ambiguïté.
const SOUS_FAMILLE: Record<string, SegmentId> = {
  BP: "boulangerie", BC: "boulangerie",
  EC: "public", EL: "public", EE: "public", EM: "public", MC: "public", MD: "public", TI: "public", CT: "public",
  BM: "public", ME: "public", GN: "public", HV: "public", MO: "public", SG: "public", SM: "public", GF: "public", CS: "public",
  CH: "sante", CM: "sante", DE: "sante", PH: "sante", VE: "sante", MR: "sante", MM: "sante", RA: "sante", HE: "sante", FY: "sante", CR: "sante",
  HO: "hotellerie", BR: "hotellerie", HR: "hotellerie", RR: "hotellerie",
  IB: "immobilier", SL: "immobilier",
  TR: "industrie", BT: "industrie", F2: "industrie", MN: "industrie", TM: "industrie", GR: "industrie", EI: "industrie", LM: "industrie",
  IE: "tertiaire", LA: "tertiaire",
  GA: "commerce", CA: "commerce", CC: "commerce", PP: "commerce", LC: "commerce", TP: "commerce", MA: "commerce",
};

// Familles ERP au sens net (les familles fourre-tout BA, EN, CO, 90 passent par les mots-clés).
const FAMILLE: Record<string, SegmentId> = {
  AD: "public", EP: "public", ES: "public", AE: "public", OS: "public", SS: "public", AP: "public",
  EB: "tertiaire", NO: "tertiaire", AM: "tertiaire", BE: "tertiaire", AR: "tertiaire", AC: "tertiaire",
  CM: "sante", MA: "sante", AS: "sante",
  HR: "hotellerie",
  GS: "commerce", GA: "commerce", CO: "commerce", AT: "commerce",
  PV: "parking", SC: "parking",
  IM: "immobilier", RI: "immobilier", AG: "immobilier", SI: "immobilier", PE: "immobilier", PI: "immobilier",
  MO: "immobilier", OH: "immobilier", AB: "immobilier", CP: "immobilier", LO: "immobilier", LT: "immobilier", MB: "immobilier", AL: "industrie",
  GR: "industrie", FA: "industrie", EN: "industrie",
  PA: "particulier", MI: "particulier",
};

type Rule = [SegmentId, RegExp];

// Mots-clés très sûrs : ils priment sur la famille ERP.
const STRONG: Rule[] = [
  ["boulangerie", /\b(BOULANG\w*|PATISS\w*|FOURNIL|VIENNOISER\w*|TALMELIER|MIE CALINE)\b/],
  ["parking", /\b(PARKING|PARKINGS|PARC DE STATIONNEMENT|PARC RELAIS)\b/],
  ["sante", /\b(EHPAD|CLINIQUE|HOPITAL|HOPITAUX|HOSPITALIER|PHARMACIE|DENTAIRE|RADIOLOG\w*|MAISON DE RETRAITE|MAISON RETRAITE|RPA|VETERINAIRE)\b/],
  ["hotellerie", /\b(RESTAURANT|BRASSERIE|PIZZERIA|SUSHI|KEBAB|TRAITEUR|AUBERGE|CAMPING)\b/],
];

// Mots-clés généraux, appliqués quand la famille ne tranche pas.
const KEYWORDS: Rule[] = [
  ["public", /\b(MAIRIE|HOTEL DE VILLE|VILLE DE|COMMUNE|COMMUNAUTE|METROPOLE|DEPARTEMENT|PREFECTURE|GENDARMERIE|POLICE|POMPIERS?|SDIS|CASERNE|ECOLE|COLLEGE|LYCEE|UNIVERSITE|IUT|CAMPUS|GROUPE SCOLAIRE|GYMNASE|STADE|PISCINE|PATINOIRE|MEDIATHEQUE|BIBLIOTHEQUE|MUSEE|CCAS|MJC|CENTRE SOCIAL|CENTRE TECHNIQUE|DECHETTERIE|STATION EPURATION|CIMETIERE|EGLISE|PAROISSE|MOSQUEE|FINANCES PUBLIQUES|TRESOR PUBLIC|COMPTABLE PUBLIC|CFP|MDM|TRIBUNAL|CAF|CPAM|URSSAF|CRECHE|EAJE|SNCF|GARE|BOULODROME|SALLE DES FETES|ATELIERS MUNICIPAUX|GARAGE MUNICIPAL|OFFICE DE TOURISME|SCOLAIRE|FUNERAIRE|FUNEBRES|PLANETARIUM|AERODROME|TENNIS|CLUB|SPORTS?|ENSATT|ARMEE)\b/],
  ["sante", /\b(MEDICAL|MEDICALE|MEDIC|SANTE|CENTRE MEDICAL|LABORATOIRE D ANALYSES|KINE\w*|INFIRMIER\w*|OPHTALMO\w*|IRM|SENIORS?|FOYER|HANDICAP\w*|IME|ESAT|CAMSP|DITEP|APAJH|ADAPEI|MEDICO|AUDITION|ASSOCIATION|FONDATION)\b/],
  ["immobilier", /\b(SDC|SYNDIC|SYNDICAT|COPRO\w*|ASL|AFUL|SCI|IMMOBILIER\w*|IMMO|FONCIER\w*|REGIE|PROPERTY|HABITAT|OPAC|OPH|LOGEMENTS?|LOTISSEMENT|RESIDENCE|PATRIMOINE|INDIVISION|C O|LOCAL|LOCAUX|PARC D ACTIVITES?|PARC ACTIVITES?|ACTIPOLE|MINI PARC|(?<!FITNESS )PARK)\b/],
  ["commerce", /\b(FITNESS|MAGASIN|BOUTIQUE|SUPERMARCHE|HYPERMARCHE|BRICO\w*|PRESSING|TABAC|PRESSE|COIFF\w*|BEAUTE|OPTIQUE|OPTICIEN|BIJOUTERIE|FLEURISTE|CAVE|CENTRE COMMERCIAL|POLE COMMERCIAL|GALERIE|MARKET|GARAGE|AUTOMOBILES?|AUTO|PNEUS?|CONCESSION|CARROSSERIE|LAVAGE|STATION SERVICE)\b/],
  ["boulangerie", /\b(BOUCHERIE|CHARCUTERIE|FROMAGERIE|FROMAGE|CHOCOLAT\w*|PRIMEUR|EPICERIE|TRAITEUR|PAIN)\b/],
  ["hotellerie", /\b(HOTEL|HOTELS|CAFE|BISTRO\w*|BAR|SNACK|CROISIERE|RESIDENCE HOTELIERE|APPART HOTEL|GOLF)\b/],
  ["tertiaire", /\b(BANQUE|BANCAIRE|LCL|CREDIT|ASSURANCES?|MUTUELLE|MUTUALITE|NOTAIRE|NOTARIAL|AVOCATS?|CABINET|EXPERT\w*|COMPTABLE|CONSEIL|CONSULTING|BUREAUX?|SIEGE|CENTRE D AFFAIRES|BUSINESS|TECHNOPARK|TECHNOPOLE|PEPINIERE|COWORKING|INFORMATIQUE|DIGITAL|SOFTWARE|TELECOM|ARCHITECTE|INGENIERIE|BUREAU D ETUDES|INTERIM|FORMATION|INSTITUT|AGENCE|ENGINEERING|PROCUREMENT|IMMEUBLE)\b/],
  ["industrie", /\b(USINE|INDUSTRI\w*|LOGISTI\w*|ENTREPOTS?|TRANSPORTS?|TRANS|MESSAGERIE|DISTRIBUTION|BTP|TP|CONSTRUCTION|TRAVAUX|BATIMENT|BETON|GRANULATS?|CARRIERE|METAL\w*|MENUISERIE|CHAUDRONNERIE|MECANIQUE|ELECTRICITE|ENERGIE|CHIMIE|PLASTI\w*|FABRICATION|MANUFACTURE|ATELIER|ATELIERS|ZI|ZAC|ZONE INDUSTRIELLE|TECHNOLOG\w*|SYSTEMS?|EQUIPEMENTS?|FERMETURES?|PORTES?|CHAUFFERIE|POMPAGE|NEGOCE|GROSSISTE|SURETE|SECURITE|CARTONNAGES?|PHARMA|BIOPHARMA|THERM\w*|CINTRAGE|RECTIFICATION|SCIENTIFIQUE|ECHAF+AUDAGE)\b/],
];

export interface SegmentInput {
  nom: string;
  type: string;
  famille?: string;
  sousFamille?: string;
  motCle?: string;
}

/**
 * Typologie d'un client. Ordre : sous-famille ERP précise → mots-clés sûrs →
 * famille ERP précise → mots-clés généraux → valeur par défaut des familles
 * « fourre-tout ». Le rattachement au payeur est fait ensuite (voir classifyAll).
 */
export function classify(c: SegmentInput): { segment: SegmentId; source: SegmentSource } {
  const text = norm(c.nom);
  const fam = (c.famille || "").trim();
  const sf = (c.sousFamille || "").trim();

  if (c.type === "3" || fam === "PA" || fam === "MI" || /^(M|MR|MME|MLLE|MONSIEUR|MADAME|MR ET MME|M ET MME)\b/.test(text)) {
    return { segment: "particulier", source: fam === "PA" || fam === "MI" ? "famille" : "mot-cle" };
  }
  for (const [seg, re] of STRONG) if (re.test(text)) return { segment: seg, source: "mot-cle" };
  if (sf && SOUS_FAMILLE[sf]) return { segment: SOUS_FAMILLE[sf], source: "sous-famille" };
  const famSeg = FAMILLE[fam];
  if (famSeg && fam !== "EN" && fam !== "CO") return { segment: famSeg, source: "famille" };
  for (const [seg, re] of KEYWORDS) if (re.test(text)) return { segment: seg, source: "mot-cle" };
  if (famSeg) return { segment: famSeg, source: "famille" };
  return { segment: "autre", source: "defaut" };
}

/** Familles « fourre-tout » de l'ERP : sans autre indice, ce sont des entreprises (classement estimé). */
const FAMILLES_ENTREPRISES = new Set(["BA", "EN", "90", ""]);

export function defaultSegment(famille: string | undefined): SegmentId {
  return FAMILLES_ENTREPRISES.has((famille || "").trim()) ? "industrie" : "autre";
}

export type SegmentId =
  | "industrie"
  | "tertiaire"
  | "facilities"
  | "property"
  | "syndic"
  | "boulangerie"
  | "commerce"
  | "hotellerie"
  | "sante"
  | "public"
  | "immobilier"
  | "parking"
  | "particulier"
  | "autre";

export type SegmentSource = "manuel" | "sous-famille" | "mot-cle" | "famille" | "payeur" | "defaut";

/** Une fiche client, après nettoyage et fusion des lignes en double de l'export. */
export interface Client {
  /** Identifiant stable : le numéro ERP, ou « N-… » pour un client ajouté à la main. */
  id: string;
  numero: string;
  /** Type ERP : 1 donneur d'ordre, 2 et 5 sites, 3 particulier. */
  type: string;
  nom: string;
  adresse: string;
  cp: string;
  ville: string;
  tel?: string;
  portable?: string;
  contact?: string;
  mail?: string;
  siren?: string;
  motCle?: string;
  /** Numéro du payeur (le compte qui reçoit les factures de ce site). */
  payeur?: string;
  payeurNom?: string;
  famille?: string;
  sousFamille?: string;
  /** Code commercial d'origine dans l'ERP (17, 18…). */
  code: string;
  contrat: boolean;
  technicien?: string;
  secteurGeo?: string;
  /** Adresses des autres lignes de l'export portant le même numéro. */
  autresAdresses?: string[];
  lat?: number;
  lng?: number;
  /** Précision de la position : code postal exact, ville, département. */
  geo?: "cp" | "ville" | "dept";
  segment: SegmentId;
  segmentSource: SegmentSource;
  /** Renseigné pour un client ajouté dans l'outil (et non issu de l'ERP). */
  ajout?: { par: string; le: string; note?: string };
}

export interface Member {
  id: string;
  nom: string;
  /** Codes ERP qui appartiennent d'office à cette personne (ex. « 18 » pour le responsable). */
  codes: string[];
  /** Le responsable : seul à pouvoir modifier, garde les grands comptes. */
  responsable?: boolean;
  /** Participe au partage automatique du pool. */
  recoit: boolean;
  /** Part relative du pool (1 = part égale). */
  part: number;
}

export interface Settings {
  /** Les sites d'un compte déjà tenu par quelqu'un le rejoignent. */
  rattacherComptes: boolean;
  /** Nombre de plus gros comptes du pool réservés au responsable. */
  grandsComptes: number;
  /** Groupes réservés au responsable (mots-clés, ex. le nom d'un grand groupe) : tous leurs comptes lui reviennent. */
  groupes?: string[];
  /** Comptes qui portent le nom d'un groupe sans en faire partie (identifiant du compte). */
  groupesExclus?: string[];
  /** « type » : équilibre par typologie ; « territoire » : secteurs géographiques. */
  mode: "type" | "territoire";
  /** Privilégie un commercial déjà présent dans la même ville (mode « type »). */
  proximite: boolean;
  /** Libellé des codes ERP (ex. 17 → « Prénom (parti) »). */
  libellesCodes: Record<string, string>;
  /** Départements de la zone de travail (absent = Auvergne-Rhône-Alpes et départements voisins). */
  zone?: string[];
  /** Fichier partagé : il s'ouvre sans mot de passe en lecture pour l'équipe (sans coordonnées) ; la gestion reste sous mot de passe. */
  partage?: boolean;
  /** Noms d'enseignes dont les adresses d'un même compte sont regroupées en une seule (ex. les agences d'une banque). */
  regrouper?: string[];
}

export interface JournalEntry {
  at: string;
  par: string;
  msg: string;
}

/** Un client proposé par un commercial, en attente de validation par le responsable. */
export interface Ajout {
  client: Client;
  par: string;
  le: string;
  statut: "en-attente" | "valide" | "refuse";
  motif?: string;
}

export interface PortfolioState {
  v: 1;
  fileId: string;
  savedAt: string;
  importedAt: string;
  source: string;
  team: Member[];
  settings: Settings;
  clients: Client[];
  /** Propriétaire de chaque client ; absent = dans le pool à répartir. */
  owners: Record<string, string>;
  /** Choix faits à la main : la proposition automatique ne les touche pas. */
  pins: Record<string, true>;
  /** Doublons fusionnés : id secondaire → id conservé. */
  merges: Record<string, string>;
  /** Groupes de doublons écartés (« ce n'est pas un doublon »). */
  ignores: string[];
  segmentOverrides: Record<string, SegmentId>;
  ajouts: Ajout[];
  journal: JournalEntry[];
  /** Clé partagée avec les fichiers des commerciaux pour lire leurs ajouts. */
  returnKeys: Record<string, string>;
  /** Comptes comptés comme un seul site (ex. une collectivité aux nombreux bâtiments) : id du payeur. */
  siteUnique?: string[];
  /** Sociétés à démarcher, confiées à chacun (ne comptent pas dans les comptes clients). */
  prospects?: Prospect[];
  /** Clé (base64) qui chiffre les demandes déposées dans le dossier partagé ; recopiée dans la partie équipe du fichier. */
  teamKey?: string;
}

/** Demande déposée par un membre de l'équipe dans le dossier partagé ; seul le responsable la tranche. */
export interface Demande {
  id: string;
  type: "ajout" | "attribution" | "modification";
  par: string;
  le: string;
  /** Ajout : le client proposé. */
  client?: Client;
  /** Attribution ou modification : le client concerné. */
  clientId?: string;
  clientNom?: string;
  message?: string;
}

export interface Decision {
  id: string;
  statut: "acceptee" | "refusee";
  le: string;
  motif?: string;
}

/** Une société à démarcher (pas encore cliente) confiée à un commercial : hors comptes clients. */
export interface Prospect {
  id: string;
  nom: string;
  ville: string;
  cp?: string;
  segment: SegmentId;
  /** Membre de l'équipe qui doit s'en occuper. */
  owner: string;
  note?: string;
  le: string;
}

export type Role = "responsable" | "commercial";

/** Ce que contient un fichier (chiffré) : l'état et qui l'ouvre. */
export interface Payload {
  role: Role;
  /** Pour un fichier commercial : la personne à qui il est destiné. */
  me?: string;
  /** Détail des clients des autres dans un fichier commercial. */
  detail?: "nom" | "masque";
  state: PortfolioState;
  /** Empreintes (anti-doublon) des clients masqués d'un fichier commercial. */
  empreintes?: Empreinte[];
  /** Fichier commercial : clé de chiffrement des ajouts renvoyés au responsable. */
  returnKey?: string;
  /** Sel des empreintes. */
  fpSalt?: string;
}

export interface Empreinte {
  h: string[];
  owner: string;
}

export interface Account {
  id: string;
  nom: string;
  clientIds: string[];
  /** Fiches qui sont des lieux d'intervention (hors adresses de facturation). */
  siteIds: string[];
  sites: number;
  /** Taille du compte : nombre de sites d'intervention (au moins 1). Sert à repérer les plus gros comptes. */
  score: number;
  segment: SegmentId;
  ville: string;
  cp: string;
  codes: string[];
  lat?: number;
  lng?: number;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { accountOf, activeClients, buildAccounts, resolveMerge } from "../core/accounts";
import { findDuplicates, type DuplicateGroup } from "../core/dedupe";
import { memberStats, propose, type MemberStats, type Proposal } from "../core/distribute";
import { classify, defaultSegment } from "../core/segments";
import { buildIndex, type SearchIndex } from "../core/search";
import { applyCodeOwners, applyProposal, randomId } from "../core/state";
import type { Account, Ajout, Client, Empreinte, Member, PortfolioState, Role, SegmentId, Settings } from "../core/types";
import { seal, type SessionKey } from "../lib/crypto";
import { idbSet } from "../lib/idb";

export interface Session {
  role: Role;
  /** Membre de l'équipe qui utilise ce fichier. */
  me: string;
  key: SessionKey | null;
  /** Fichier commercial : clé pour chiffrer les ajouts envoyés au responsable. */
  returnKey?: string;
  detail?: "nom" | "masque";
  fpSalt?: string;
  empreintes?: Empreinte[];
}

export interface Derived {
  active: Client[];
  byId: Map<string, Client>;
  accounts: Map<string, Account>;
  acctOf: Map<string, string>;
  stats: MemberStats[];
  pool: number;
  index: SearchIndex;
  weight: (c: Client) => number;
}

type Updater = (s: PortfolioState) => PortfolioState;

interface StoreValue {
  state: PortfolioState;
  session: Session;
  setSession: (s: Session) => void;
  d: Derived;
  isAdmin: boolean;
  dirty: boolean;
  savedLocally: boolean | null;
  owner: (id: string) => string | undefined;
  member: (id: string | undefined) => Member | undefined;
  update: (msg: string | null, fn: Updater) => void;
  undo: () => void;
  canUndo: boolean;
  markBackedUp: () => void;
  duplicates: () => DuplicateGroup[];
  proposal: (settings?: Partial<Settings>) => Proposal;
  actions: Actions;
}

export interface Actions {
  assign: (ids: string[], memberId: string | null, msg?: string) => void;
  unpin: (ids: string[]) => void;
  applyProposal: () => void;
  resetDistribution: () => void;
  setSegment: (ids: string[], seg: SegmentId | null) => void;
  merge: (primary: string, others: string[]) => void;
  unmerge: (id: string) => void;
  ignoreDuplicate: (key: string) => void;
  settings: (patch: Partial<Settings>) => void;
  memberUpdate: (id: string, patch: Partial<Member>) => void;
  addClient: (c: Client, owner: string | null) => void;
  receiveAjouts: (list: Ajout[]) => number;
  decideAjout: (clientId: string, accept: boolean, owner?: string, motif?: string) => void;
  replaceClients: (fresh: Client[], source: string) => { ajoutes: number; retires: number; maj: number };
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore hors du StoreProvider");
  return v;
}

/** Applique les corrections de typologie faites à la main. */
function withOverrides(clients: Client[], s: PortfolioState): Client[] {
  const ov = s.segmentOverrides;
  if (!Object.keys(ov).length) return clients;
  return clients.map((c) => (ov[c.id] ? { ...c, segment: ov[c.id], segmentSource: "manuel" } : c));
}

export function storageKey(state: PortfolioState, session: Session): string {
  return session.role === "responsable" ? `pf:${state.fileId}` : `pf:${state.fileId}:ajouts`;
}

export function StoreProvider({
  initial,
  session: initialSession,
  children,
}: {
  initial: PortfolioState;
  session: Session;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [session, setSessionState] = useState(initialSession);
  const setSession = useCallback((s: Session) => {
    setSessionState(s);
    setDirty(true);
  }, []);
  const [dirty, setDirty] = useState(false);
  const [savedLocally, setSavedLocally] = useState<boolean | null>(null);
  const history = useRef<PortfolioState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const isAdmin = session.role === "responsable";

  const update = useCallback(
    (msg: string | null, fn: Updater) => {
      setState((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        history.current.push(prev);
        if (history.current.length > 40) history.current.shift();
        const journal = msg ? [{ at: new Date().toISOString(), par: session.me, msg }, ...next.journal].slice(0, 400) : next.journal;
        return { ...next, journal, savedAt: new Date().toISOString() };
      });
      setCanUndo(true);
      setDirty(true);
    },
    [session.me],
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      setState(prev);
      setDirty(true);
    }
    setCanUndo(history.current.length > 0);
  }, []);

  // Sauvegarde automatique (chiffrée) dans ce navigateur, regroupée par pause de saisie.
  useEffect(() => {
    if (!dirty || !session.key) return;
    const t = setTimeout(async () => {
      const key = storageKey(state, session);
      const value = session.role === "responsable" ? state : { ajouts: state.ajouts, savedAt: state.savedAt };
      const env = await seal(value, session.key!.key, { salt: session.key!.salt, iter: session.key!.iter });
      setSavedLocally(await idbSet(key, { savedAt: state.savedAt, env }));
    }, 900);
    return () => clearTimeout(t);
  }, [state, dirty, session]);

  const weight = useCallback((c: Client) => 1 + (c.contrat ? state.settings.poidsContrat : 0), [state.settings.poidsContrat]);

  const d = useMemo<Derived>(() => {
    const clients = withOverrides(state.clients, state);
    const active = activeClients(clients, state.merges);
    const byId = new Map(clients.map((c) => [c.id, c]));
    const accounts = buildAccounts(clients, state.merges, state.settings.poidsContrat);
    const acctOf = accountOf(accounts);
    const activeMap = new Map(active.map((c) => [c.id, c]));
    const stats = memberStats(state.team, state.owners, activeMap, accounts, weight);
    const pool = active.filter((c) => !state.owners[c.id]).length;
    return { active, byId, accounts, acctOf, stats, pool, index: buildIndex(active), weight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clients, state.merges, state.segmentOverrides, state.owners, state.team, state.settings.poidsContrat, weight]);

  const owner = useCallback((id: string) => state.owners[resolveMerge(id, state.merges)] || undefined, [state.owners, state.merges]);
  const member = useCallback((id: string | undefined) => state.team.find((m) => m.id === id), [state.team]);

  const dupCache = useRef<{ key: unknown[]; value: DuplicateGroup[] } | null>(null);
  const duplicates = useCallback(() => {
    const key = [state.clients, state.merges, state.ignores];
    if (dupCache.current && dupCache.current.key.every((k, i) => k === key[i])) return dupCache.current.value;
    const value = findDuplicates(state.clients, state.merges, state.ignores);
    dupCache.current = { key, value };
    return value;
  }, [state.clients, state.merges, state.ignores]);

  const proposal = useCallback(
    (patch?: Partial<Settings>) => {
      const s = { ...state, clients: withOverrides(state.clients, state), settings: { ...state.settings, ...patch } };
      return propose(s);
    },
    [state],
  );

  const actions = useMemo<Actions>(() => {
    const name = (s: PortfolioState, id: string | null) => (id ? s.team.find((m) => m.id === id)?.nom ?? id : "le pool");
    return {
      assign: (ids, memberId, msg) =>
        update(msg ?? `${ids.length} fiche(s) attribuée(s) à ${name(state, memberId)}`, (s) => {
          const owners = { ...s.owners };
          const pins = { ...s.pins };
          for (const id of ids) {
            if (memberId) owners[id] = memberId;
            else delete owners[id];
            pins[id] = true;
          }
          return { ...s, owners, pins };
        }),
      unpin: (ids) =>
        update(null, (s) => {
          const pins = { ...s.pins };
          ids.forEach((id) => delete pins[id]);
          return { ...s, pins };
        }),
      applyProposal: () =>
        update("Proposition automatique appliquée", (s) => ({ ...applyProposal({ ...s, clients: withOverrides(s.clients, s) }), clients: s.clients })),
      resetDistribution: () =>
        update("Répartition remise à zéro (seuls les codes ERP sont gardés)", (s) => {
          const next = { ...s, owners: {}, pins: {} };
          applyCodeOwners(next);
          return next;
        }),
      setSegment: (ids, seg) =>
        update(seg ? `${ids.length} fiche(s) reclassée(s)` : null, (s) => {
          const segmentOverrides = { ...s.segmentOverrides };
          ids.forEach((id) => (seg ? (segmentOverrides[id] = seg) : delete segmentOverrides[id]));
          return { ...s, segmentOverrides };
        }),
      merge: (primary, others) =>
        update(`Doublon fusionné : ${others.length + 1} fiches → ${state.clients.find((c) => c.id === primary)?.nom ?? primary}`, (s) => {
          const merges = { ...s.merges };
          const owners = { ...s.owners };
          others.forEach((o) => {
            if (o !== primary) merges[o] = primary;
            if (!owners[primary] && owners[o]) owners[primary] = owners[o];
          });
          return { ...s, merges, owners };
        }),
      unmerge: (id) =>
        update("Fusion annulée", (s) => {
          const merges = { ...s.merges };
          delete merges[id];
          return { ...s, merges };
        }),
      ignoreDuplicate: (key) => update(null, (s) => ({ ...s, ignores: [...s.ignores, key] })),
      settings: (patch) => update(null, (s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      memberUpdate: (id, patch) =>
        update(null, (s) => {
          const team = s.team.map((m) => (m.id === id ? { ...m, ...patch } : m));
          const next = { ...s, team };
          if (patch.codes) applyCodeOwners(next);
          return next;
        }),
      addClient: (c, ownerId) =>
        update(
          isAdmin ? `Nouveau client « ${c.nom} »${ownerId ? ` attribué à ${name(state, ownerId)}` : ""}` : `Ajout proposé : « ${c.nom} »`,
          (s) => {
            if (!isAdmin) {
              const ajout: Ajout = { client: c, par: session.me, le: new Date().toISOString(), statut: "en-attente" };
              return { ...s, ajouts: [ajout, ...s.ajouts] };
            }
            const owners = { ...s.owners };
            const pins = { ...s.pins, [c.id]: true as const };
            if (ownerId) owners[c.id] = ownerId;
            return { ...s, clients: [...s.clients, c], owners, pins };
          },
        ),
      receiveAjouts: (list) => {
        let n = 0;
        update(`Ajouts reçus : ${list.length}`, (s) => {
          const known = new Set([...s.ajouts.map((a) => a.client.id), ...s.clients.map((c) => c.id)]);
          const fresh = list.filter((a) => !known.has(a.client.id)).map((a) => ({ ...a, statut: "en-attente" as const }));
          n = fresh.length;
          return fresh.length ? { ...s, ajouts: [...fresh, ...s.ajouts] } : s;
        });
        return n;
      },
      decideAjout: (clientId, accept, ownerId, motif) =>
        update(null, (s) => {
          const a = s.ajouts.find((x) => x.client.id === clientId);
          if (!a) return s;
          const ajouts = s.ajouts.map((x) => (x.client.id === clientId ? { ...x, statut: accept ? ("valide" as const) : ("refuse" as const), motif } : x));
          if (!accept) return { ...s, ajouts, journal: [{ at: new Date().toISOString(), par: session.me, msg: `Ajout refusé : « ${a.client.nom} »` }, ...s.journal] };
          const who = ownerId ?? a.par;
          return {
            ...s,
            ajouts,
            clients: [...s.clients, { ...a.client, ajout: { par: a.par, le: a.le, note: a.client.ajout?.note } }],
            owners: { ...s.owners, [clientId]: who },
            pins: { ...s.pins, [clientId]: true },
            journal: [{ at: new Date().toISOString(), par: session.me, msg: `Ajout validé : « ${a.client.nom} » → ${name(s, who)}` }, ...s.journal],
          };
        }),
      replaceClients: (fresh, source) => {
        const result = { ajoutes: 0, retires: 0, maj: 0 };
        update(`Nouvel export importé : « ${source} »`, (s) => {
          const freshIds = new Set(fresh.map((c) => c.id));
          const old = new Map(s.clients.map((c) => [c.id, c]));
          const manuels = s.clients.filter((c) => c.ajout && !freshIds.has(c.id));
          result.retires = s.clients.filter((c) => !c.ajout && !freshIds.has(c.id)).length;
          fresh.forEach((c) => (old.has(c.id) ? result.maj++ : result.ajoutes++));
          const next = { ...s, clients: [...fresh, ...manuels], importedAt: new Date().toISOString(), source };
          applyCodeOwners(next);
          return next;
        });
        return result;
      },
    };
  }, [update, state, isAdmin, session.me]);

  const markBackedUp = useCallback(() => setDirty(false), []);

  const value: StoreValue = {
    state,
    session,
    setSession,
    d,
    isAdmin,
    dirty,
    savedLocally,
    owner,
    member,
    update,
    undo,
    canUndo,
    markBackedUp,
    duplicates,
    proposal,
    actions,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Nouveau client saisi dans l'outil (id « N-… »), classé et géolocalisé comme les autres. */
export function newClient(fields: Omit<Client, "id" | "numero" | "segment" | "segmentSource" | "code" | "contrat" | "type"> & { segment?: SegmentId; contrat?: boolean }, par: string, locate: (id: string, cp: string, ville: string) => { lat: number; lng: number; geo: Client["geo"] } | undefined): Client {
  const id = "N-" + randomId(5).toUpperCase();
  const seg = fields.segment ? { segment: fields.segment, source: "manuel" as const } : classify({ nom: fields.nom, type: "1" });
  const segment = seg.segment === "autre" ? defaultSegment("") : seg.segment;
  const c: Client = {
    ...fields,
    id,
    numero: id,
    type: "1",
    code: "",
    contrat: !!fields.contrat,
    segment,
    segmentSource: seg.source,
    ajout: { par, le: new Date().toISOString(), note: fields.ajout?.note },
  };
  const pos = locate(id, c.cp, c.ville);
  return pos ? { ...c, ...pos } : c;
}

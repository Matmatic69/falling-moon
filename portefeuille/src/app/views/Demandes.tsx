import { useCallback, useEffect, useState } from "react";
import { SEGMENT_BY_ID } from "../../core/segments";
import type { Decision, Demande } from "../../core/types";
import { chooseFolder, ready, savedFolder, sharedSupported, writeDecision } from "../../lib/shared";
import { deposer, lireDemandes, teamKeyOf } from "../demandes";
import { publishTeam, TEAM_FILE } from "../files";
import { Icon } from "../icons";
import { useStore } from "../store";
import { dateFr, useToast, Who } from "../ui";

const TYPE: Record<Demande["type"], string> = { ajout: "Ajout d'un client", attribution: "Demande d'attribution", modification: "Modification" };

/** Demandes d'ajout ou de modification : visibles de toute l'équipe, tranchées par le responsable seul. */
export function Demandes({ openClient }: { openClient: (id: string) => void }) {
  const store = useStore();
  const { state, isAdmin, actions, d, owner } = store;
  const toast = useToast();
  const team = state.team;
  const responsable = team.find((m) => m.responsable);
  const [data, setData] = useState<{ demandes: Demande[]; decisions: Map<string, Decision> } | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [motif, setMotif] = useState<Record<string, string>>({});
  const [texte, setTexte] = useState("");
  const key = teamKeyOf(store);

  const load = useCallback(
    async (ask: boolean) => {
      setError("");
      try {
        const r = await lireDemandes(store, ask);
        // null : aucun dossier choisi ; false : dossier connu mais accès à réautoriser (sur un clic).
        setLinked(r ? true : (await savedFolder()) ? false : null);
        if (r) setData(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lecture impossible.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(() => void load(false), [load]);

  const connect = async () => {
    setError("");
    try {
      const dir = (await savedFolder()) ?? (await chooseFolder());
      if (!(await ready(dir, true))) throw new Error("Accès au dossier refusé.");
      await load(true);
      toast("Dossier partagé connecté");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Connexion impossible.");
    }
  };
  const changeFolder = async () => {
    try {
      await chooseFolder();
      await load(true);
    } catch {
      /* annulé */
    }
  };

  const decide = async (dem: Demande, accept: boolean) => {
    if (!key) return;
    setBusy(true);
    try {
      if (accept && dem.type === "ajout" && dem.client && !d.byId.has(dem.client.id)) actions.addClient(dem.client, dem.par);
      if (accept && dem.type === "attribution" && dem.clientId) {
        const acct = d.accounts.get(d.acctOf.get(dem.clientId) ?? dem.clientId);
        const ids = acct ? acct.clientIds : [dem.clientId];
        actions.assign(ids, dem.par, `Demande acceptée : « ${dem.clientNom ?? dem.clientId} » → ${team.find((m) => m.id === dem.par)?.nom}`);
      }
      const dir = await savedFolder();
      if (!dir || !(await ready(dir, true))) throw new Error("Connectez le dossier partagé.");
      await writeDecision(dir, key, { id: dem.id, statut: accept ? "acceptee" : "refusee", le: new Date().toISOString(), motif: motif[dem.id]?.trim() || undefined });
      await load(true);
      toast(accept ? "Demande acceptée — publiez le fichier pour que l'équipe le voie" : "Demande refusée");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Décision impossible.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const r = await publishTeam(store);
      toast(r === "dossier" ? `Fichier publié dans le dossier partagé (${TEAM_FILE})` : `Fichier téléchargé : déposez ${TEAM_FILE} dans le dossier OneDrive`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setBusy(false);
    }
  };

  const sendFree = async () => {
    try {
      await deposer(store, { type: "modification", message: texte.trim() });
      setTexte("");
      await load(true);
      toast(`Demande envoyée à ${responsable?.nom}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
    }
  };

  const list = data?.demandes ?? [];
  const statut = (dem: Demande) => data?.decisions.get(dem.id);
  const pending = list.filter((x) => !statut(x));
  const done = list.filter((x) => statut(x));

  const Row = ({ dem }: { dem: Demande }) => {
    const dec = statut(dem);
    const c = dem.client;
    const target = dem.clientId ? d.byId.get(dem.clientId) : undefined;
    return (
      <div className="row wrap" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", gap: 10, alignItems: "flex-start" }}>
        <span className="grow" style={{ minWidth: 220 }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="pill">{TYPE[dem.type]}</span>
            <Who team={team} id={dem.par} />
            <span className="small muted">{dateFr(dem.le, true)}</span>
          </span>
          <div style={{ marginTop: 6 }}>
            {c && (
              <b>
                {c.nom} <span className="muted small">· {[c.cp, c.ville].filter(Boolean).join(" ")} · {SEGMENT_BY_ID[c.segment].court}</span>
              </b>
            )}
            {dem.clientId && (
              <button className="linklike" onClick={() => target && openClient(target.id)}>
                <b>{dem.clientNom ?? target?.nom ?? dem.clientId}</b>
                {target && <span className="muted small">· aujourd'hui chez {team.find((m) => m.id === owner(target.id))?.nom ?? "personne"}</span>}
              </button>
            )}
            {dem.message && <div className="dim small" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{dem.message}</div>}
            {c?.ajout?.note && <div className="dim small" style={{ marginTop: 4 }}>{c.ajout.note}</div>}
          </div>
        </span>
        {dec ? (
          <span className={`pill ${dec.statut === "acceptee" ? "ok" : "bad"}`} title={dec.motif}>
            <Icon name={dec.statut === "acceptee" ? "check" : "x"} size={12} /> {dec.statut === "acceptee" ? "Acceptée" : "Refusée"} le {dateFr(dec.le)}
            {dec.motif ? ` · ${dec.motif}` : ""}
          </span>
        ) : isAdmin ? (
          <span className="row wrap" style={{ gap: 6 }}>
            <input className="input" style={{ width: 180 }} placeholder="Motif (facultatif)" value={motif[dem.id] ?? ""} onChange={(e) => setMotif({ ...motif, [dem.id]: e.target.value })} />
            <button className="btn sm primary" disabled={busy} onClick={() => void decide(dem, true)}>
              <Icon name="check" size={14} /> Accepter
            </button>
            <button className="btn sm" disabled={busy} onClick={() => void decide(dem, false)}>
              Refuser
            </button>
          </span>
        ) : (
          <span className="pill warn">En attente de {responsable?.nom}</span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Demandes</h1>
          <p>
            Ajouts de clients, demandes d'attribution et modifications : toute l'équipe les voit, seul {responsable?.nom} les accepte ou les refuse.
          </p>
        </div>
        {isAdmin && (
          <button className="btn primary" disabled={busy} onClick={() => void publish()}>
            <Icon name="upload" size={16} /> Publier le fichier pour l'équipe
          </button>
        )}
      </div>

      {!sharedSupported() && (
        <div className="banner bad" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <span>Ce navigateur ne peut pas écrire dans le dossier partagé. Ouvrez le fichier avec Chrome ou Edge sur ordinateur.</span>
        </div>
      )}
      {sharedSupported() && !data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Connecter le dossier partagé</h3>
          <p className="dim small" style={{ margin: "6px 0 12px" }}>
            Choisissez le dossier OneDrive où se trouve « {TEAM_FILE} ». Les demandes y sont enregistrées, chiffrées, dans un sous-dossier « Demandes ». À faire une fois par
            ordinateur.
          </p>
          <button className="btn primary" onClick={() => void connect()}>
            <Icon name="upload" size={16} /> {linked === false ? "Autoriser l'accès au dossier" : "Choisir le dossier OneDrive"}
          </button>
        </div>
      )}
      {!key && isAdmin && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="info" />
          <span className="small">Le partage n'est pas encore activé : cliquez sur « Publier le fichier pour l'équipe » une première fois.</span>
        </div>
      )}
      {error && (
        <div className="banner bad" style={{ marginBottom: 12 }}>
          <Icon name="alert" /> {error}
        </div>
      )}

      {data && (
        <div className="grid g3">
          <div className="card span2">
            <div className="card-head">
              <h3 className="grow">En attente</h3>
              <span className={`badge${pending.length ? " warn" : ""}`}>{pending.length}</span>
              <button className="btn sm ghost" onClick={() => void load(true)}>
                Actualiser
              </button>
            </div>
            {pending.map((dem) => (
              <Row key={dem.id} dem={dem} />
            ))}
            {!pending.length && <p className="muted">Aucune demande en attente.</p>}
            {done.length > 0 && (
              <>
                <h3 style={{ marginTop: 22 }}>Traitées</h3>
                {done.map((dem) => (
                  <Row key={dem.id} dem={dem} />
                ))}
              </>
            )}
          </div>
          <div className="col" style={{ gap: 16 }}>
            {!isAdmin && (
              <div className="card">
                <h3>Nouvelle demande</h3>
                <p className="dim small" style={{ margin: "6px 0 10px" }}>
                  Pour un client précis, ouvrez sa fiche : « Demander ce client » ou « Signaler une correction ». Pour un nouveau client : « Ajouter un client ».
                </p>
                <textarea className="input" rows={3} placeholder={`Message pour ${responsable?.nom}`} value={texte} onChange={(e) => setTexte(e.target.value)} />
                <button className="btn primary" style={{ marginTop: 8 }} disabled={!texte.trim()} onClick={() => void sendFree()}>
                  Envoyer
                </button>
              </div>
            )}
            <div className="card">
              <h3>Dossier partagé</h3>
              <p className="dim small" style={{ margin: "6px 0 10px" }}>
                Les demandes sont des petits fichiers chiffrés dans le sous-dossier « Demandes ». Activez les notifications OneDrive sur ce dossier pour être prévenu à chaque
                nouvelle demande.
              </p>
              <button className="btn sm" onClick={() => void changeFolder()}>
                Changer de dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

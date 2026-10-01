import { useRef, useState } from "react";
import { findMatches } from "../../core/match";
import { SEGMENT_BY_ID } from "../../core/segments";
import { exportAjouts, readAjoutsFile } from "../files";
import { Icon } from "../icons";
import { useStore } from "../store";
import { dateFr, useToast, Who } from "../ui";

export function Ajouts({ openClient }: { openClient: (id: string) => void }) {
  const store = useStore();
  const { state, d, owner, isAdmin, session, actions } = store;
  const toast = useToast();
  const team = state.team;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const list = isAdmin ? state.ajouts : state.ajouts.filter((a) => a.par === session.me);
  const pending = list.filter((a) => a.statut === "en-attente");
  const done = list.filter((a) => a.statut !== "en-attente");
  const responsable = team.find((m) => m.responsable);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const { par, list: received } = await readAjoutsFile(store, file);
      const n = actions.receiveAjouts(received);
      toast(n ? `${n} ajout(s) de ${team.find((m) => m.id === par)?.nom} à valider` : "Ces ajouts étaient déjà reçus");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible.");
    }
  };

  const send = async () => {
    try {
      const n = await exportAjouts(store);
      toast(`${n} ajout(s) prêts : envoie le fichier téléchargé à ${responsable?.nom}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible.");
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>{isAdmin ? "Ajouts reçus" : "Mes ajouts"}</h1>
          <p>
            {isAdmin
              ? "Les commerciaux ajoutent des clients dans leur fichier, puis vous envoient un petit fichier « Ajouts ». Importez-le ici et validez."
              : `Tes nouveaux clients restent « en attente » jusqu'à validation par ${responsable?.nom}. Envoie-lui le fichier d'ajouts (par e-mail ou clé USB).`}
          </p>
        </div>
        {isAdmin ? (
          <>
            <button className="btn primary" onClick={() => input.current?.click()}>
              <Icon name="upload" size={16} /> Importer un fichier d'ajouts
            </button>
            <input ref={input} type="file" accept=".json" hidden onChange={(e) => (void importFile(e.target.files?.[0]), (e.target.value = ""))} />
          </>
        ) : (
          <button className="btn primary" disabled={!pending.length} onClick={() => void send()}>
            <Icon name="send" size={16} /> Envoyer mes {pending.length || ""} ajouts à {responsable?.nom}
          </button>
        )}
      </div>
      {error && (
        <div className="banner bad" style={{ marginBottom: 14 }}>
          <Icon name="alert" /> {error}
        </div>
      )}

      <div className="card flush">
        <div className="card-head" style={{ padding: "16px 18px 0" }}>
          <h3 className="grow">En attente</h3>
          <span className="badge warn">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty">
            <Icon name="inbox" size={26} />
            {isAdmin ? "Aucun ajout en attente." : "Aucun ajout en attente. Utilise « Ajouter un client » en haut à droite."}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="hide-mobile">Proposé par</th>
                {isAdmin && <th>Contrôle</th>}
                {isAdmin && <th>Décision</th>}
              </tr>
            </thead>
            <tbody>
              {pending.map((a) => {
                const dup = isAdmin ? findMatches(a.client, d.active, 1)[0] : undefined;
                const target = assign[a.client.id] ?? a.par;
                return (
                  <tr key={a.client.id}>
                    <td>
                      <b>{a.client.nom}</b>
                      <div className="small muted">
                        {a.client.cp} {a.client.ville} · {SEGMENT_BY_ID[a.client.segment].court}
                        {a.client.ajout?.note ? ` · ${a.client.ajout.note}` : ""}
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <Who team={team} id={a.par} />
                      <div className="small muted">{dateFr(a.le)}</div>
                    </td>
                    {isAdmin && (
                      <td>
                        {dup && dup.score >= 0.8 ? (
                          <button className="btn sm ghost" style={{ color: "var(--warning)" }} onClick={() => openClient(dup.client.id)}>
                            <Icon name="alert" size={14} /> Existe déjà : {dup.client.nom.slice(0, 26)} ({team.find((m) => m.id === owner(dup.client.id))?.nom ?? "pool"})
                          </button>
                        ) : (
                          <span className="pill ok">
                            <Icon name="check" size={12} /> Nouveau
                          </span>
                        )}
                      </td>
                    )}
                    {isAdmin && (
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <select className="select" style={{ height: 30 }} value={target} onChange={(e) => setAssign((x) => ({ ...x, [a.client.id]: e.target.value }))} aria-label="Attribuer à">
                            {team.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nom}
                              </option>
                            ))}
                          </select>
                          <button className="btn sm primary" onClick={() => (actions.decideAjout(a.client.id, true, target), toast("Client validé"))}>
                            Valider
                          </button>
                          <button className="btn sm ghost" onClick={() => (actions.decideAjout(a.client.id, false, undefined, dup && dup.score >= 0.8 ? "Déjà existant" : undefined), toast("Ajout refusé"))}>
                            Refuser
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {done.length > 0 && (
        <div className="card flush" style={{ marginTop: 16 }}>
          <div className="card-head" style={{ padding: "16px 18px 0" }}>
            <h3 className="grow">Historique</h3>
          </div>
          <table className="table">
            <tbody>
              {done.slice(0, 100).map((a) => (
                <tr key={a.client.id}>
                  <td>
                    <b>{a.client.nom}</b>
                    <div className="small muted">
                      {a.client.cp} {a.client.ville}
                    </div>
                  </td>
                  <td className="hide-mobile">
                    <Who team={team} id={a.par} />
                  </td>
                  <td>
                    <span className={`pill ${a.statut === "valide" ? "ok" : "bad"}`}>
                      {a.statut === "valide" ? "Validé" : "Refusé"}
                      {a.motif ? ` · ${a.motif}` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

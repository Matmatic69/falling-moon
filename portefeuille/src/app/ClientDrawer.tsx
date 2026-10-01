import { useMemo } from "react";
import { REASON_LABEL } from "../core/distribute";
import { ROLE_LABEL } from "../core/roles";
import { SEGMENTS, SEGMENT_BY_ID } from "../core/segments";
import type { SegmentId } from "../core/types";
import type { Nav } from "./App";
import { Icon } from "./icons";
import { useStore } from "./store";
import { dateFr, fmt, memberVar, Switch, useEscape, useToast, Who } from "./ui";

export function ClientDrawer({ id, onClose, openClient }: { id: string; onClose: () => void; openClient: (id: string) => void; go: Nav }) {
  const { state, d, owner, isAdmin, actions, proposal, session } = useStore();
  const toast = useToast();
  useEscape(onClose);
  const team = state.team;
  const primary = state.merges[id] ?? id;
  const c = d.byId.get(primary);
  const acctId = d.acctOf.get(primary);
  const acct = acctId ? d.accounts.get(acctId) : undefined;
  const mergedFrom = useMemo(() => Object.entries(state.merges).filter(([, p]) => p === primary).map(([s]) => d.byId.get(s)!).filter(Boolean), [state.merges, primary, d.byId]);
  const reason = useMemo(() => (isAdmin && acctId ? proposal().reasons[acctId] : undefined), [isAdmin, acctId, proposal]);
  if (!c) return null;
  const o = owner(c.id);
  const masked = !c.nom;
  const mine = o === session.me;
  const contactsHidden = !isAdmin && !mine;
  const tel = c.tel || c.portable;

  const setOwner = (to: string | null, whole: boolean) => {
    const ids = whole && acct ? acct.clientIds : [c.id];
    actions.assign(ids, to, `« ${c.nom} »${whole && acct && acct.sites > 1 ? ` et ses ${acct.sites - 1} autres sites` : ""} → ${to ? team.find((m) => m.id === to)?.nom : "pool"}`);
    toast(`${whole && acct && acct.sites > 1 ? `${acct.sites} fiches` : "Fiche"} attribuée(s) à ${to ? team.find((m) => m.id === to)?.nom : "personne (pool)"}`);
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={c.nom || "Client"}>
        <div className="drawer-head">
          <div className="row">
            <span className="pill">{c.numero.startsWith("N-") ? "Ajouté dans l'outil" : `N° ${c.numero}`}</span>
            <span className="pill">{ROLE_LABEL[d.roles.get(c.id) ?? "site"]}</span>
            <span className="spacer" />
            <button className="btn ghost icon" onClick={onClose} aria-label="Fermer">
              <Icon name="x" />
            </button>
          </div>
          <h2 style={{ marginTop: 10 }}>{masked ? "Client confidentiel" : c.nom}</h2>
          <p className="dim small">
            {c.adresse ? `${c.adresse}, ` : ""}
            {c.cp} {c.ville}
          </p>
          {d.roles.get(c.id) === "facturation" && acct && (
            <p className="small muted" style={{ marginTop: 4 }}>
              Adresse de facturation (siège, régie…) : les lieux d'intervention sont ses {acct.sites} site(s) ci-dessous.
            </p>
          )}
          {d.roles.get(c.id) === "hors-zone" && (
            <p className="small muted" style={{ marginTop: 4 }}>
              Facturé hors de la zone de travail ; aucun site n'est renseigné dans l'export pour ce client.
            </p>
          )}
        </div>
        <div className="drawer-body">
          <div className="answer">
            <span className="grow">
              <span className="small muted">Ce client appartient à</span>
              <div style={{ marginTop: 6 }}>
                <Who team={team} id={o} big />
              </div>
            </span>
            {state.pins[c.id] && isAdmin && (
              <span className="pill" title="Choix manuel">
                <Icon name="pin" size={12} /> épinglé
              </span>
            )}
          </div>
          {!isAdmin && o && !mine && (
            <div className="banner">
              <Icon name="info" />
              <span className="small">Ce client est suivi par {team.find((m) => m.id === o)?.nom}. Pour toute question, consulte {team.find((m) => m.responsable)?.nom}.</span>
            </div>
          )}

          {isAdmin && (
            <div className="col" style={{ gap: 8 }}>
              <span className="small muted">Attribuer {acct && acct.sites > 1 ? `le compte entier (${acct.sites} fiches)` : "ce client"}</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {team.map((m) => (
                  <button key={m.id} className="btn sm" disabled={o === m.id && (!acct || acct.clientIds.every((x) => owner(x) === m.id))} onClick={() => setOwner(m.id, true)}>
                    <span className="nav-dot" style={{ background: memberVar(team, m.id) }} /> {m.nom}
                  </button>
                ))}
                <button className="btn sm ghost" onClick={() => setOwner(null, true)}>
                  Pool
                </button>
              </div>
              {acct && acct.sites > 1 && (
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="small muted">Ce site seulement :</span>
                  {team.map((m) => (
                    <button key={m.id} className="btn sm ghost" disabled={o === m.id} onClick={() => setOwner(m.id, false)}>
                      {m.nom}
                    </button>
                  ))}
                </div>
              )}
              {reason && <span className="small muted">Proposition automatique : {REASON_LABEL[reason]}</span>}
            </div>
          )}

          <dl className="kv">
            <dt>Typologie</dt>
            <dd>
              {isAdmin ? (
                <select
                  className="select"
                  style={{ height: 30 }}
                  value={c.segment}
                  onChange={(e) => {
                    actions.setSegment([c.id], e.target.value as SegmentId);
                    toast("Typologie corrigée");
                  }}
                >
                  {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : (
                SEGMENT_BY_ID[c.segment].label
              )}
              <div className="small muted">
                {c.segmentSource === "manuel" ? "corrigée à la main" : c.segmentSource === "defaut" ? "estimée (aucun indice précis)" : c.segmentSource === "payeur" ? "déduite du payeur" : c.segmentSource === "mot-cle" ? "déduite du nom" : "famille ERP"}
              </div>
            </dd>
            <dt>Contrat</dt>
            <dd>{c.contrat ? "Sous contrat d'entretien" : "Non"}</dd>
            {c.code && (
              <>
                <dt>Code ERP</dt>
                <dd>
                  {c.code} {state.settings.libellesCodes[c.code] ? <span className="muted">· {state.settings.libellesCodes[c.code]}</span> : null}
                </dd>
              </>
            )}
            {contactsHidden ? (
              <>
                <dt>Coordonnées</dt>
                <dd className="muted">Réservées à {o ? team.find((m) => m.id === o)?.nom : "l'équipe"}</dd>
              </>
            ) : (
              <>
                {c.contact && (
                  <>
                    <dt>Contact</dt>
                    <dd>{c.contact}</dd>
                  </>
                )}
                {tel && (
                  <>
                    <dt>Téléphone</dt>
                    <dd>
                      <a href={`tel:${tel.replace(/\s/g, "")}`} style={{ color: "inherit" }}>
                        {tel.replace(/(\d{2})(?=\d)/g, "$1 ")}
                      </a>
                      {c.portable && c.tel ? <div className="small muted">Portable {c.portable.replace(/(\d{2})(?=\d)/g, "$1 ")}</div> : null}
                    </dd>
                  </>
                )}
                {c.mail && (
                  <>
                    <dt>E-mail</dt>
                    <dd>
                      <a href={`mailto:${c.mail}`} style={{ color: "inherit" }}>
                        {c.mail}
                      </a>
                    </dd>
                  </>
                )}
                {c.siren && (
                  <>
                    <dt>SIREN/SIRET</dt>
                    <dd className="num">{c.siren}</dd>
                  </>
                )}
                {c.technicien && (
                  <>
                    <dt>Technicien</dt>
                    <dd>{c.technicien}</dd>
                  </>
                )}
              </>
            )}
            {c.payeur && (
              <>
                <dt>Payeur</dt>
                <dd>
                  {d.byId.get(c.payeur) ? (
                    <button className="btn sm ghost" style={{ padding: 0, height: "auto" }} onClick={() => openClient(c.payeur!)}>
                      {d.byId.get(c.payeur)!.nom || c.payeurNom || c.payeur} <Icon name="chevron" size={13} />
                    </button>
                  ) : (
                    c.payeurNom || c.payeur
                  )}
                </dd>
              </>
            )}
            {c.ajout && (
              <>
                <dt>Ajouté</dt>
                <dd>
                  par {team.find((m) => m.id === c.ajout!.par)?.nom ?? c.ajout.par} le {dateFr(c.ajout.le)}
                  {c.ajout.note && <div className="small muted">{c.ajout.note}</div>}
                </dd>
              </>
            )}
            {!!c.autresAdresses?.length && !contactsHidden && (
              <>
                <dt>Autres adresses</dt>
                <dd>
                  {c.autresAdresses.map((a) => (
                    <div key={a} className="small">
                      {a}
                    </div>
                  ))}
                </dd>
              </>
            )}
          </dl>

          {mergedFrom.length > 0 && (
            <div className="col" style={{ gap: 6 }}>
              <h3>Doublons fusionnés dans cette fiche</h3>
              {mergedFrom.map((m) => (
                <div key={m.id} className="row small">
                  <span className="grow ellipsis">
                    N° {m.numero} · {m.nom} · {m.cp} {m.ville}
                  </span>
                  {isAdmin && (
                    <button className="btn sm ghost" onClick={() => (actions.unmerge(m.id), toast("Fusion annulée"))}>
                      Séparer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {acct && acct.clientIds.length > 1 && (
            <div className="col" style={{ gap: 6 }}>
              <div className="row">
                <h3 className="grow">Compte « {d.byId.get(acct.id)?.nom || "confidentiel"} »</h3>
                <span className="muted small">
                  {fmt(acct.sites)} site(s) · {fmt(acct.clientIds.length)} fiches · {fmt(acct.contrats)} contrats
                </span>
              </div>
              {isAdmin && (
                <Switch
                  checked={(state.siteUnique ?? []).includes(acct.id)}
                  onChange={() => {
                    actions.toggleSiteUnique(acct.id);
                    toast((state.siteUnique ?? []).includes(acct.id) ? "Chaque site compte à nouveau" : "Compte compté comme un seul site");
                  }}
                  label="Compter ce compte comme un seul site"
                />
              )}
              <div className="card flush" style={{ maxHeight: 320, overflow: "auto" }}>
                {acct.clientIds.map((sid) => {
                  const sc = d.byId.get(sid)!;
                  return (
                    <button
                      key={sid}
                      className="palette-item"
                      aria-selected={sid === c.id}
                      onClick={() => sid !== c.id && openClient(sid)}
                      style={{ borderBottom: "1px solid var(--line)", borderRadius: 0 }}
                    >
                      <span className="grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis">{sc.nom || "Client confidentiel"}</div>
                        <div className="small muted ellipsis">
                          {sc.cp} {sc.ville}
                          {sc.contrat ? " · contrat" : ""}
                        </div>
                      </span>
                      <Who team={team} id={owner(sid)} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

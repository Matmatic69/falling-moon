import { useEffect, useMemo, useState } from "react";
import { locate } from "../core/geo";
import { findMatches, fingerprintKeys, type Candidate } from "../core/match";
import { classify, SEGMENTS } from "../core/segments";
import type { SegmentId } from "../core/types";
import { fingerprint } from "../lib/crypto";
import { Icon } from "./icons";
import { deposer } from "./demandes";
import { newClient, useStore } from "./store";
import { Modal, useToast, Who } from "./ui";

/**
 * Ajout d'un client. Avant tout, on vérifie qu'il n'existe pas déjà :
 * s'il appartient à quelqu'un d'autre, un commercial est bloqué et invité à consulter le responsable.
 */
export function AddClient({ initialName, onClose, openClient }: { initialName: string; onClose: () => void; openClient: (id: string) => void }) {
  const store = useStore();
  const { state, d, owner, isAdmin, session, actions } = store;
  const toast = useToast();
  const team = state.team;
  const responsable = team.find((m) => m.responsable);
  const [f, setF] = useState({ nom: initialName, adresse: "", cp: "", ville: "", tel: "", mail: "", contact: "", siren: "", note: "" });
  const [segment, setSegment] = useState<SegmentId | "">("");
  const [assignTo, setAssignTo] = useState<string>(isAdmin ? responsable?.id ?? "" : session.me);
  const [force, setForce] = useState(false);
  const [maskedOwner, setMaskedOwner] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const cand: Candidate = { nom: f.nom, cp: f.cp, ville: f.ville, adresse: f.adresse, tel: f.tel, mail: f.mail, siren: f.siren };
  const matches = useMemo(() => (f.nom.trim().length >= 3 || f.tel || f.mail || f.siren ? findMatches(cand, d.active) : []), [f, d.active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fichier commercial « masqué » : contrôle par empreintes, sans pouvoir lire les noms des autres.
  useEffect(() => {
    if (!session.empreintes?.length || !session.fpSalt) return setMaskedOwner(null);
    let cancelled = false;
    const keys = fingerprintKeys(cand);
    void Promise.all(keys.map((k) => fingerprint(session.fpSalt!, k))).then((hs) => {
      if (cancelled) return;
      const set = new Set(hs);
      const hit = session.empreintes!.find((e) => e.h.some((h) => set.has(h)));
      setMaskedOwner(hit ? hit.owner : null);
    });
    return () => {
      cancelled = true;
    };
  }, [f, session.empreintes, session.fpSalt]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingDup = state.ajouts.find((a) => a.statut === "en-attente" && f.nom.trim().length >= 3 && findMatches(cand, [a.client], 1)[0]?.score >= 0.8);
  const strong = matches.filter((m) => m.score >= 0.8);
  const top = strong[0];
  const topOwner = top ? owner(top.client.id) : undefined;
  const blockedBy = maskedOwner !== null ? maskedOwner : top ? topOwner ?? "" : null;
  const blocked = !isAdmin && blockedBy !== null && blockedBy !== session.me;
  const autoSeg = f.nom.trim() ? classify({ nom: f.nom, type: "1" }).segment : "industrie";
  const valid = f.nom.trim().length >= 2 && (f.cp.trim().length >= 4 || f.ville.trim()) && !blocked && !(isAdmin && top && !force);

  const submit = () => {
    const c = newClient(
      {
        nom: f.nom.trim().toUpperCase(),
        adresse: f.adresse.trim(),
        cp: f.cp.replace(/\D/g, ""),
        ville: f.ville.trim().toUpperCase(),
        tel: f.tel.trim() || undefined,
        mail: f.mail.trim() || undefined,
        contact: f.contact.trim() || undefined,
        siren: f.siren.replace(/\s/g, "") || undefined,
        segment: (segment || undefined) as SegmentId | undefined,
        ajout: { par: session.me, le: new Date().toISOString(), note: f.note.trim() || undefined },
      },
      session.me,
      locate,
    );
    if (session.equipe) {
      deposer(store, { type: "ajout", client: c })
        .then(() => (toast(`Demande d'ajout de « ${c.nom} » envoyée à ${responsable?.nom} (onglet Demandes)`), onClose()))
        .catch((e) => toast(e instanceof Error ? e.message : "Envoi impossible"));
      return;
    }
    actions.addClient(c, isAdmin ? assignTo || null : session.me);
    toast(isAdmin ? `« ${c.nom} » ajouté` : `« ${c.nom} » ajouté à ton portefeuille, en attente de validation par ${responsable?.nom}`);
    onClose();
  };

  const who = (id: string | undefined) => (id ? team.find((m) => m.id === id)?.nom ?? id : "personne");

  return (
    <Modal
      title="Ajouter un client"
      onClose={onClose}
      wide
      foot={
        <>
          <button className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={!valid} onClick={submit}>
            <Icon name="plus" size={16} /> {isAdmin ? "Ajouter" : session.equipe ? "Envoyer la demande d'ajout" : "Ajouter à mon portefeuille"}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {blocked && (
          <div className="banner bad">
            <Icon name="lock" />
            <div>
              <b>
                {blockedBy
                  ? `Ce client appartient déjà à ${who(blockedBy)}.`
                  : "Ce client existe déjà et n'est attribué à personne."}
              </b>
              <div className="small" style={{ marginTop: 4 }}>
                {top && !maskedOwner ? `« ${top.client.nom} » (${top.client.cp} ${top.client.ville}) — ${top.raison.toLowerCase()}. ` : ""}
                Consulte {responsable?.nom} avant de le démarcher : lui seul peut changer l'attribution.
              </div>
            </div>
          </div>
        )}
        {!blocked && top && (
          <div className="banner warn">
            <Icon name="alert" />
            <div className="grow">
              <b>{topOwner === session.me && !isAdmin ? "Ce client est déjà dans ton portefeuille." : `Ce client semble déjà exister (${top.raison.toLowerCase()}).`}</b>
              <div className="row small" style={{ marginTop: 6 }}>
                « {top.client.nom} » · {top.client.cp} {top.client.ville} · <Who team={team} id={topOwner} />
                <button className="btn sm ghost" onClick={() => (onClose(), openClient(top.client.id))}>
                  Voir la fiche
                </button>
              </div>
              {isAdmin && (
                <label className="switch small" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  C'est un autre client : l'ajouter quand même
                </label>
              )}
            </div>
          </div>
        )}
        {pendingDup && !top && (
          <div className="banner warn">
            <Icon name="info" />
            <span className="small">Un ajout semblable est déjà en attente : « {pendingDup.client.nom} ».</span>
          </div>
        )}

        <div className="grid g2">
          <label className="field span2">
            <span>Raison sociale *</span>
            <input className="input" autoFocus value={f.nom} onChange={set("nom")} placeholder="Ex. Boulangerie du Parc" />
          </label>
          <label className="field span2">
            <span>Adresse</span>
            <input className="input" value={f.adresse} onChange={set("adresse")} placeholder="N° et rue" />
          </label>
          <label className="field">
            <span>Code postal *</span>
            <input className="input" inputMode="numeric" value={f.cp} onChange={set("cp")} />
          </label>
          <label className="field">
            <span>Ville *</span>
            <input className="input" value={f.ville} onChange={set("ville")} />
          </label>
          <label className="field">
            <span>Téléphone</span>
            <input className="input" inputMode="tel" value={f.tel} onChange={set("tel")} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input className="input" inputMode="email" value={f.mail} onChange={set("mail")} />
          </label>
          <label className="field">
            <span>Contact</span>
            <input className="input" value={f.contact} onChange={set("contact")} />
          </label>
          <label className="field">
            <span>SIREN / SIRET</span>
            <input className="input" inputMode="numeric" value={f.siren} onChange={set("siren")} />
          </label>
          <label className="field">
            <span>Typologie</span>
            <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as SegmentId | "")}>
              <option value="">Automatique ({SEGMENTS.find((s) => s.id === autoSeg)?.court})</option>
              {SEGMENTS.filter((s) => s.id !== "autre").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <label className="field">
              <span>Attribuer à</span>
              <select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
                <option value="">Personne (pool)</option>
              </select>
            </label>
          ) : (
            <div className="field">
              <span>Attribution</span>
              <span className="dim small" style={{ paddingTop: 8 }}>
                À toi, après validation par {responsable?.nom}
              </span>
            </div>
          )}
          <label className="field span2">
            <span>Note (contexte, besoin, source du contact…)</span>
            <textarea className="input" rows={2} value={f.note} onChange={set("note")} />
          </label>
        </div>

        {matches.length > (top ? 1 : 0) && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small muted">Clients qui ressemblent</span>
            {matches.slice(top ? 1 : 0, 5).map((m) => (
              <div key={m.client.id} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="grow ellipsis">
                  <b>{m.client.nom}</b> · {m.client.cp} {m.client.ville} <span className="muted">· {m.raison.toLowerCase()}</span>
                </span>
                <Who team={team} id={owner(m.client.id)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

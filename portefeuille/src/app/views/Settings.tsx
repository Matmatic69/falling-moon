import { useMemo, useRef, useState } from "react";
import { ROLE_LABEL, ZONE_DEFAUT } from "../../core/roles";
import type { Payload, PortfolioState } from "../../core/types";
import { deriveKey, open, unlock, type Envelope } from "../../lib/crypto";
import type { FileMeta } from "../../lib/file";
import { idbGet } from "../../lib/idb";
import { exportWorkbook, readExport } from "../../lib/excel";
import { download, today } from "../../lib/file";
import { makeCommercialFile, saveSnapshot } from "../files";
import { Icon } from "../icons";
import { useStore } from "../store";
import { dateFr, fmt, memberVar, Seg, useToast } from "../ui";

const WORDS = ["Portail", "Rideau", "Barriere", "Volet", "Tilleul", "Saone", "Rhone", "Fourviere", "Croix", "Rousse", "Brotteaux", "Gerland", "Perrache", "Bellecour", "Vaise", "Platane", "Granit", "Cobalt", "Orage", "Comete", "Lune", "Soleil", "Ardoise", "Cedre", "Falaise"];

function suggestPassword(): string {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${(r[2] % 90) + 10}`;
}

export function SettingsView() {
  const store = useStore();
  const { state, d, owner, actions, session, setSession } = store;
  const toast = useToast();
  const team = state.team;
  const commerciaux = team.filter((m) => !m.responsable);
  const [pw, setPw] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, "nom" | "masque">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [newPw, setNewPw] = useState({ a: "", b: "" });
  const [importMsg, setImportMsg] = useState("");
  const erpInput = useRef<HTMLInputElement>(null);
  const oldInput = useRef<HTMLInputElement>(null);
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [oldMsg, setOldMsg] = useState("");

  /** Reprend l'état d'un fichier responsable plus ancien (ex. après une mise à jour de l'outil). */
  const takeOver = async () => {
    if (!oldFile) return;
    setOldMsg("Lecture…");
    try {
      const html = await oldFile.text();
      const m = html.match(/<script id="pf-data" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error("Ce fichier ne contient pas de portefeuille.");
      const meta = JSON.parse(m[1]) as FileMeta;
      if (meta.role !== "responsable") throw new Error("Seul un fichier responsable peut être repris.");
      let value: Payload;
      let key: CryptoKey;
      try {
        const r = await unlock<Payload>(meta.env, oldPw);
        value = r.value;
        key = r.session.key;
      } catch {
        throw new Error("Mot de passe incorrect pour ce fichier.");
      }
      let st: PortfolioState = value.state;
      // La copie de travail de ce navigateur peut être plus récente que le fichier lui-même.
      const local = await idbGet<{ savedAt: string; env: Envelope }>(`pf:${st.fileId}`);
      if (local && local.savedAt > meta.savedAt) {
        try {
          st = await open<PortfolioState>(local.env, key);
        } catch {
          /* copie illisible : on garde le fichier */
        }
      }
      store.update(`Données reprises depuis « ${oldFile.name} »`, () => ({ ...st, journal: st.journal }));
      setOldMsg(`Données reprises (${fmt(st.clients.length)} fiches, enregistré le ${dateFr(st.savedAt, true)}). Téléchargez maintenant le fichier à jour : il garde votre mot de passe actuel.`);
      setOldFile(null);
      setOldPw("");
    } catch (e) {
      setOldMsg(e instanceof Error ? e.message : "Fichier illisible.");
    }
  };

  const codes = useMemo(() => {
    const m = new Map<string, number>();
    state.clients.forEach((c) => c.code && m.set(c.code, (m.get(c.code) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [state.clients]);

  const createFile = async (id: string) => {
    const p = pw[id] ?? "";
    if (p.length < 8) return toast("Mot de passe trop court (8 caractères minimum)");
    setBusy(id);
    try {
      await makeCommercialFile(store, id, p, detail[id] ?? "nom");
      toast(`Fichier de ${team.find((m) => m.id === id)?.nom} téléchargé. Donnez-lui le mot de passe de vive voix.`);
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async () => {
    const key = await deriveKey(newPw.a);
    setSession({ ...session, key });
    setNewPw({ a: "", b: "" });
    setTimeout(() => void saveSnapshot({ ...store, session: { ...session, key } }), 50);
    toast("Mot de passe changé : le nouveau fichier est téléchargé, supprimez l'ancien.");
  };

  const importErp = async (file: File | undefined) => {
    if (!file) return;
    setImportMsg("Lecture…");
    try {
      const { clients, report } = await readExport(file);
      const r = actions.replaceClients(clients, file.name);
      setImportMsg(
        `${fmt(report.clients)} clients lus. ${fmt(r.ajoutes)} nouveaux (à répartir), ${fmt(r.maj)} mis à jour (attributions conservées), ${fmt(r.retires)} absents du nouvel export retirés. Les clients ajoutés dans l'outil sont conservés.`,
      );
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Fichier illisible.");
    }
  };

  const addMember = () => {
    const nom = prompt("Prénom du nouveau commercial ?")?.trim();
    if (!nom) return;
    const id = nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    if (team.some((m) => m.id === id)) return toast("Ce prénom existe déjà");
    store.update(`Nouveau commercial : ${nom}`, (s) => ({ ...s, team: [...s.team, { id, nom, codes: [], recoit: true, part: 1 }] }));
  };

  const removeMember = (id: string) => {
    const m = team.find((t) => t.id === id)!;
    const n = d.active.filter((c) => owner(c.id) === id).length;
    if (!confirm(`Retirer ${m.nom} ? Ses ${n} clients retourneront dans le pool.`)) return;
    store.update(`${m.nom} retiré de l'équipe (${n} clients remis au pool)`, (s) => {
      const owners = { ...s.owners };
      const pins = { ...s.pins };
      Object.keys(owners).forEach((k) => {
        if (owners[k] === id) {
          delete owners[k];
          delete pins[k];
        }
      });
      return { ...s, team: s.team.filter((t) => t.id !== id), owners, pins };
    });
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <h1>Réglages & fichiers</h1>
          <p>Vous seul pouvez modifier le portefeuille : les commerciaux reçoivent un fichier en lecture, protégé par leur propre mot de passe.</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card span2">
          <div className="card-head">
            <div className="grow">
              <h3>Fichiers des commerciaux</h3>
              <p>
                Chaque commercial reçoit son propre fichier HTML chiffré : son portefeuille complet (coordonnées comprises), la carte, le tableau de bord et la recherche « à qui appartient ce client ». Il peut proposer des ajouts, mais
                rien de ce qu'il fait ne modifie votre fichier.
              </p>
            </div>
          </div>
          <div className="col" style={{ gap: 14 }}>
            {commerciaux.map((m) => (
              <div key={m.id} className="row wrap" style={{ gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <span className="row" style={{ minWidth: 120 }}>
                  <span className="nav-dot" style={{ background: memberVar(team, m.id) }} />
                  <b>{m.nom}</b>
                </span>
                <input
                  className="input"
                  style={{ width: 230 }}
                  placeholder="Mot de passe de son fichier"
                  value={pw[m.id] ?? ""}
                  onChange={(e) => setPw((x) => ({ ...x, [m.id]: e.target.value }))}
                  aria-label={`Mot de passe pour ${m.nom}`}
                />
                <button className="btn sm ghost" onClick={() => setPw((x) => ({ ...x, [m.id]: suggestPassword() }))}>
                  Générer
                </button>
                <Seg
                  value={detail[m.id] ?? "nom"}
                  onChange={(v) => setDetail((x) => ({ ...x, [m.id]: v }))}
                  options={[
                    ["nom", "Clients des autres : nom + ville"],
                    ["masque", "Clients des autres : masqués"],
                  ]}
                />
                <span className="spacer" />
                <button className="btn primary" disabled={busy === m.id || (pw[m.id] ?? "").length < 8} onClick={() => void createFile(m.id)}>
                  {busy === m.id ? <div className="spin" /> : <Icon name="file" size={16} />} Créer le fichier de {m.nom}
                </button>
              </div>
            ))}
            <p className="small muted">
              « Nom + ville » : il peut chercher à qui appartient un client, sans voir les coordonnées des clients des autres. « Masqués » : il ne voit que ses clients ; le contrôle « déjà attribué, consulte {team.find((t) => t.responsable)?.nom} »
              fonctionne quand même grâce à des empreintes chiffrées. Recréez le fichier après chaque changement de répartition.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Équipe</h3>
            <button className="btn sm" onClick={addMember}>
              <Icon name="plus" size={14} /> Commercial
            </button>
          </div>
          {team.map((m) => (
            <div key={m.id} className="row wrap" style={{ gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <span className="nav-dot" style={{ background: memberVar(team, m.id) }} />
              <input className="input" style={{ width: 120 }} value={m.nom} onChange={(e) => actions.memberUpdate(m.id, { nom: e.target.value })} aria-label="Prénom" />
              <input
                className="input"
                style={{ width: 120 }}
                placeholder="Codes ERP"
                defaultValue={m.codes.join(", ")}
                onBlur={(e) => {
                  const codesList = e.target.value
                    .split(/[\s,;]+/)
                    .map((x) => x.trim())
                    .filter(Boolean);
                  if (codesList.join() !== m.codes.join()) {
                    actions.memberUpdate(m.id, { codes: codesList });
                    toast(`Codes de ${m.nom} : ${codesList.join(", ") || "aucun"}`);
                  }
                }}
                aria-label="Codes ERP"
              />
              {m.responsable ? <span className="pill">Responsable</span> : <span className="pill">{m.recoit ? "Reçoit une part du pool" : "Hors partage"}</span>}
              <span className="spacer" />
              {!m.responsable && (
                <>
                  <button className="btn sm ghost" onClick={() => actions.memberUpdate(m.id, { recoit: !m.recoit })}>
                    {m.recoit ? "Exclure du partage" : "Inclure au partage"}
                  </button>
                  <button className="btn sm ghost danger" onClick={() => removeMember(m.id)} aria-label={`Retirer ${m.nom}`}>
                    <Icon name="x" size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
          <p className="small muted" style={{ marginTop: 8 }}>
            Les clients dont le code ERP est attribué à quelqu'un lui reviennent d'office (ex. le code du responsable).
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Codes commerciaux de l'ERP</h3>
          </div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {codes.map(([code, n]) => (
              <div key={code} className="row" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <b style={{ width: 34 }}>{code}</b>
                <input
                  className="input grow"
                  style={{ height: 30 }}
                  placeholder="Qui ? (ex. « Prénom (parti) »)"
                  defaultValue={state.settings.libellesCodes[code] ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (state.settings.libellesCodes[code] ?? "")) actions.settings({ libellesCodes: { ...state.settings.libellesCodes, [code]: v } });
                  }}
                />
                <span className="num muted small" style={{ width: 50, textAlign: "right" }}>
                  {fmt(n)}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Le code marqué « parti » apparaît comme onglet dans Répartition.
          </p>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Sauvegarde & export</h3>
          </div>
          <div className="col">
            <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => void saveSnapshot(store).then(() => toast("Fichier sauvegardé"))}>
              <Icon name="download" size={16} /> Télécharger le fichier responsable à jour
            </button>
            <button
              className="btn"
              style={{ justifyContent: "flex-start" }}
              onClick={() =>
                download(
                  `Portefeuille-complet-${today()}.xlsx`,
                  exportWorkbook(d.active, team, (c) => owner(c.id), (code) => (code ? `${code}${state.settings.libellesCodes[code] ? " – " + state.settings.libellesCodes[code] : ""}` : ""), undefined, (c) => ROLE_LABEL[d.roles.get(c.id) ?? "site"]),
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
              }
            >
              <Icon name="download" size={16} /> Exporter tout en Excel (un onglet par personne)
            </button>
            <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => erpInput.current?.click()}>
              <Icon name="upload" size={16} /> Importer un nouvel export ERP (mise à jour)
            </button>
            <input ref={erpInput} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => (void importErp(e.target.files?.[0]), (e.target.value = ""))} />
            {importMsg && <div className="banner small">{importMsg}</div>}
            <p className="small muted">
              Le fichier se sauvegarde aussi tout seul dans ce navigateur (chiffré). Téléchargez-le régulièrement : c'est votre vraie sauvegarde. Ctrl + S fonctionne aussi.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Zone de travail</h3>
          </div>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Départements où vous intervenez. Un client facturé en dehors (siège à Paris, Lille…) sans site connu n'apparaît ni sur la carte ni dans les sites.
          </p>
          <input
            className="input"
            style={{ width: "100%" }}
            defaultValue={(state.settings.zone ?? ZONE_DEFAUT).join(", ")}
            onBlur={(e) => {
              const zone = e.target.value
                .split(/[\s,;]+/)
                .map((x) => x.trim().toUpperCase())
                .filter((x) => /^(\d{2}|2A|2B|97\d)$/.test(x));
              if (zone.length && zone.join() !== (state.settings.zone ?? ZONE_DEFAUT).join()) {
                actions.settings({ zone });
                toast(`Zone de travail : ${zone.length} départements`);
              }
            }}
            aria-label="Départements de la zone de travail"
          />
          <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => (actions.settings({ zone: undefined }), toast("Zone par défaut : Auvergne-Rhône-Alpes et voisins"))}>
            Revenir à Auvergne-Rhône-Alpes + voisins
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Reprendre un ancien fichier</h3>
          </div>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Quand vous recevez une nouvelle version de l'outil : ouvrez-la, puis reprenez ici votre ancien fichier responsable (répartition, choix manuels, doublons, ajouts…).
          </p>
          <div className="col">
            <button className="btn" style={{ justifyContent: "flex-start" }} onClick={() => oldInput.current?.click()}>
              <Icon name="upload" size={16} /> {oldFile ? oldFile.name : "Choisir l'ancien fichier .html"}
            </button>
            <input ref={oldInput} type="file" accept=".html,.htm" hidden onChange={(e) => (setOldFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
            {oldFile && (
              <>
                <input className="input" type="password" placeholder="Mot de passe de l'ancien fichier" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
                <button className="btn primary" disabled={!oldPw} onClick={() => void takeOver()}>
                  Reprendre ses données
                </button>
              </>
            )}
            {oldMsg && <div className="banner small">{oldMsg}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="grow">Mot de passe responsable</h3>
          </div>
          <div className="col">
            <input className="input" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" value={newPw.a} onChange={(e) => setNewPw((x) => ({ ...x, a: e.target.value }))} />
            <input className="input" type="password" placeholder="Confirmez" value={newPw.b} onChange={(e) => setNewPw((x) => ({ ...x, b: e.target.value }))} />
            <button className="btn" disabled={newPw.a.length < 8 || newPw.a !== newPw.b} onClick={() => void changePassword()}>
              <Icon name="lock" size={16} /> Changer et télécharger le nouveau fichier
            </button>
          </div>
        </div>

        <div className="card span2">
          <div className="card-head">
            <h3 className="grow">Journal</h3>
            <span className="muted small">{state.journal.length} actions</span>
          </div>
          <div style={{ maxHeight: 320, overflow: "auto" }}>
            {state.journal.slice(0, 120).map((j, i) => (
              <div key={i} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="muted nowrap" style={{ width: 150 }}>
                  {dateFr(j.at, true)}
                </span>
                <span className="grow">{j.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

import { useMemo, useRef, useState } from "react";
import type { ParseReport } from "../core/parse";
import { createState } from "../core/state";
import type { Client, Payload, PortfolioState } from "../core/types";
import { cryptoAvailable, open, unlock, type Envelope } from "../lib/crypto";
import { readExport } from "../lib/excel";
import { download, today, type FileMeta } from "../lib/file";
import { idbGet } from "../lib/idb";
import { snapshotFor } from "./files";
import { Icon } from "./icons";
import type { Session } from "./store";
import { dateFr, fmt } from "./ui";

export interface Opened {
  state: PortfolioState;
  session: Session;
  notice?: string;
}

function Brand() {
  return (
    <div className="row" style={{ marginBottom: 22 }}>
      <div className="brand-mark">
        <i />
        <i />
        <i />
      </div>
      <div>
        <b>Portefeuille clients</b>
        <div className="muted small">Fichier local et chiffré — rien n'est envoyé sur internet</div>
      </div>
    </div>
  );
}

function NoCrypto() {
  return (
    <div className="banner bad">
      <Icon name="alert" />
      <span>Ce navigateur ne permet pas le chiffrement. Ouvrez le fichier avec Chrome, Edge, Firefox ou Safari à jour.</span>
    </div>
  );
}

/** Premier lancement : on importe l'export ERP et on choisit le mot de passe du responsable. */
export function Welcome({ onReady }: { onReady: (o: Opened) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const [data, setData] = useState<{ clients: Client[]; report: ParseReport; name: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [resp, setResp] = useState({ nom: "", code: "" });
  const [coms, setComs] = useState(["", ""]);
  const [parti, setParti] = useState({ code: "", nom: "" });
  const input = useRef<HTMLInputElement>(null);
  const codes = useMemo(() => {
    const m = new Map<string, number>();
    data?.clients.forEach((c) => c.code && m.set(c.code, (m.get(c.code) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const teamOk = resp.nom.trim().length > 0 && coms.some((c) => c.trim());

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await readExport(file);
      if (!r.clients.length) throw new Error("Aucun client trouvé dans ce fichier.");
      setData({ ...r, name: file.name });
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!data) return;
    setBusy(true);
    const state = createState(data.clients, data.name, {
      responsable: { nom: resp.nom.trim(), code: resp.code },
      commerciaux: coms.map((c) => c.trim()).filter(Boolean),
      parti: parti.code ? { code: parti.code, nom: parti.nom.trim() } : undefined,
    });
    const { html, session } = await snapshotFor(state, pw);
    download(`Portefeuille-clients-${today()}.html`, html);
    onReady({ state, session, notice: "Votre fichier chiffré vient d'être téléchargé : c'est lui que vous ouvrirez désormais." });
  };

  const strong = pw.length >= 8;
  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        <div className="steps">
          <i className="on" />
          <i className={step >= 2 ? "on" : ""} />
          <i className={step === 3 ? "on" : ""} />
        </div>
        {!cryptoAvailable() && <NoCrypto />}
        {step === 1 && (
          <div className="col" style={{ gap: 14 }}>
            <h2>Importer l'export clients</h2>
            <p className="dim">
              Déposez l'export de l'ERP (.xls, .xlsx ou .csv). Le fichier est lu ici, dans votre navigateur : doublons fusionnés, typologies classées, comptes regroupés.
            </p>
            <div
              className={`drop${over ? " over" : ""}`}
              onClick={() => input.current?.click()}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void load(e.dataTransfer.files[0]);
              }}
            >
              {busy ? <div className="spin" /> : <Icon name="upload" size={26} />}
              <b>{busy ? "Lecture en cours…" : "Glissez l'export ici"}</b>
              <span className="small muted">ou cliquez pour le choisir</span>
              <input ref={input} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => void load(e.target.files?.[0])} />
            </div>
            {error && (
              <div className="banner bad">
                <Icon name="alert" /> {error}
              </div>
            )}
          </div>
        )}
        {step === 2 && data && (
          <div className="col" style={{ gap: 14 }}>
            <h2>Votre équipe</h2>
            <div className="banner ok">
              <Icon name="check" />
              <div className="small">
                <b>{data.name}</b> : {fmt(data.report.lignes)} lignes → <b>{fmt(data.report.clients)} clients</b>.{" "}
                {data.report.lignesFusionnees + data.report.lignesIdentiques > 0 &&
                  `${fmt(data.report.lignesFusionnees + data.report.lignesIdentiques)} lignes en double fusionnées automatiquement.`}
                {data.report.colonnesManquantes.length > 0 && <div>Colonnes non trouvées : {data.report.colonnesManquantes.join(", ")}</div>}
              </div>
            </div>
            <div className="grid g2">
              <label className="field">
                <span>Votre prénom (responsable)</span>
                <input className="input" autoFocus value={resp.nom} onChange={(e) => setResp((r) => ({ ...r, nom: e.target.value }))} />
              </label>
              <label className="field">
                <span>Votre code commercial ERP</span>
                <select className="select" value={resp.code} onChange={(e) => setResp((r) => ({ ...r, code: e.target.value }))}>
                  <option value="">—</option>
                  {codes.map(([c, n]) => (
                    <option key={c} value={c}>
                      {c} · {fmt(n)} clients
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field">
              <span>Les commerciaux qui se partagent le reste</span>
              {coms.map((c, i) => (
                <input
                  key={i}
                  className="input"
                  placeholder={`Prénom du commercial ${i + 1}`}
                  value={c}
                  onChange={(e) => setComs((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
              <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setComs((l) => [...l, ""])}>
                <Icon name="plus" size={14} /> Un commercial de plus
              </button>
            </div>
            <div className="grid g2">
              <label className="field">
                <span>Code d'un commercial parti (facultatif)</span>
                <select className="select" value={parti.code} onChange={(e) => setParti((p) => ({ ...p, code: e.target.value }))}>
                  <option value="">Aucun</option>
                  {codes
                    .filter(([c]) => c !== resp.code)
                    .map(([c, n]) => (
                      <option key={c} value={c}>
                        {c} · {fmt(n)} clients
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Son prénom</span>
                <input className="input" value={parti.nom} disabled={!parti.code} onChange={(e) => setParti((p) => ({ ...p, nom: e.target.value }))} />
              </label>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={() => setStep(1)}>
                <Icon name="back" size={16} /> Retour
              </button>
              <span className="spacer" />
              <button className="btn primary" disabled={!teamOk} onClick={() => setStep(3)}>
                Continuer <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}
        {step === 3 && data && (
          <div className="col" style={{ gap: 14 }}>
            <h2>Protéger le portefeuille</h2>
            <p className="dim">
              Choisissez le mot de passe du responsable. Il chiffre toutes les données : sans lui, le fichier est illisible. <b>Il ne pourra pas être récupéré</b> : notez-le.
            </p>
            <label className="field">
              <span>Mot de passe (8 caractères minimum)</span>
              <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label className="field">
              <span>Confirmez</span>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && strong && pw === pw2 && void create()} />
            </label>
            <div className="row">
              <button className="btn ghost" onClick={() => setStep(2)}>
                <Icon name="back" size={16} /> Retour
              </button>
              <span className="spacer" />
              <button className="btn primary" disabled={!strong || pw !== pw2 || busy || !cryptoAvailable()} onClick={() => void create()}>
                {busy ? <div className="spin" /> : <Icon name="lock" size={16} />} Créer mon portefeuille
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface Stored {
  savedAt: string;
  env: Envelope;
}

/** Ouverture d'un fichier existant : mot de passe, puis reprise de la copie de travail locale si plus récente. */
export function Unlock({ meta, onReady, onCancel }: { meta: FileMeta; onReady: (o: Opened) => void; onCancel?: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const { value, session: sk } = await unlock<Payload>(meta.env, pw);
      let state = value.state;
      let notice: string | undefined;
      const me = value.role === "commercial" ? value.me! : state.team.find((m) => m.responsable)?.id ?? state.team[0].id;
      if (value.role === "responsable") {
        const local = await idbGet<Stored>(`pf:${state.fileId}`);
        if (local && local.savedAt > meta.savedAt) {
          try {
            state = await open<PortfolioState>(local.env, sk.key);
            notice = `Modifications du ${dateFr(local.savedAt, true)} reprises depuis ce navigateur. Pensez à sauvegarder le fichier.`;
          } catch {
            /* copie locale d'un autre mot de passe : on garde le fichier */
          }
        }
      } else {
        const local = await idbGet<Stored>(`pf:${state.fileId}:ajouts`);
        if (local) {
          try {
            const { ajouts } = await open<{ ajouts: PortfolioState["ajouts"] }>(local.env, sk.key);
            const known = new Set([...state.ajouts.map((a) => a.client.id), ...state.clients.map((c) => c.id)]);
            const mine = ajouts.filter((a) => a.statut === "en-attente" && !known.has(a.client.id));
            if (mine.length) {
              state = { ...state, ajouts: [...mine, ...state.ajouts] };
              notice = `${mine.length} ajout(s) en attente repris depuis ce navigateur.`;
            }
          } catch {
            /* ignoré */
          }
        }
      }
      onReady({
        state,
        notice,
        session: { role: value.role, me, key: sk, returnKey: value.returnKey, detail: value.detail, fpSalt: value.fpSalt, empreintes: value.empreintes },
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof DOMException || (e instanceof Error && /decrypt|operation/i.test(e.message)) ? "Mot de passe incorrect." : e instanceof Error ? e.message : "Impossible d'ouvrir ce fichier.");
    }
  };

  return (
    <div className="gate">
      <form
        className="gate-card col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <Brand />
        {!cryptoAvailable() && <NoCrypto />}
        <h2>{meta.role === "responsable" ? "Espace responsable" : `Portefeuille de ${meta.pour ?? ""}`}</h2>
        <p className="dim">
          {meta.team
            ? "La gestion (attributions, demandes, réglages) est réservée au responsable. Saisissez votre mot de passe."
            : `Fichier enregistré le ${dateFr(meta.savedAt, true)}. Saisissez le mot de passe pour déchiffrer les données.`}
        </p>
        <label className="field">
          <span>Mot de passe</span>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {error && (
          <div className="banner bad">
            <Icon name="alert" /> {error}
          </div>
        )}
        <button className="btn primary" disabled={!pw || busy || !cryptoAvailable()}>
          {busy ? <div className="spin" /> : <Icon name="lock" size={16} />} Ouvrir
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Retour à la consultation
          </button>
        )}
      </form>
    </div>
  );
}

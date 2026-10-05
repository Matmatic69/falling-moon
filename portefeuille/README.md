# Portefeuille clients — répartition entre commerciaux

Outil de répartition du portefeuille clients entre le responsable commercial et son équipe, livré sous
forme d'**un seul fichier HTML local** : il s'ouvre dans le navigateur, sans
internet, et toutes les données qu'il contient sont **chiffrées par mot de passe** (AES-256-GCM, clé
dérivée par PBKDF2). Aucune donnée client n'est stockée dans ce dépôt.

## Utilisation

1. Ouvrir `portefeuille.html` (le fichier vierge) dans Chrome, Edge, Firefox ou Safari.
2. Déposer l'export clients de l'ERP (`.xls`, `.xlsx` ou `.csv`).
3. Indiquer l'équipe : prénom et code ERP du responsable, prénoms des commerciaux, code d'un commercial parti.
4. Choisir le mot de passe du responsable. Un fichier `Portefeuille-clients-AAAA-MM-JJ.html` chiffré est
   téléchargé : c'est lui qu'on rouvre ensuite. Il se sauvegarde aussi tout seul dans le navigateur ;
   « Sauvegarder le fichier » (ou Ctrl + S) télécharge la version à jour.

### Ce que fait l'outil

| Écran | Rôle |
|---|---|
| Accueil | Une bulle animée par personne, ses comptes en orbite (taille = nombre de comptes), la bulle grise des comptes à répartir. Clic sur une bulle → son portefeuille ; clic sur un client → sa fiche. |
| Tableau de bord | En nombre de comptes : typologies × propriétaire, départements, villes, codes ERP d'origine (où sont partis les clients du commercial parti), qualité des données. |
| Carte | Carte hors-ligne (départements, communes du Rhône) des lieux d'intervention de chaque compte, colorés par propriétaire, regroupés en anneaux quand on dézoome ; filtres par personne et typologie ; adresses de facturation en option. |
| Recherche (Ctrl + K) | « À qui appartient ce client ? » : nom, ville, n° client, téléphone, e-mail, SIREN. Recherche avancée avec filtres et export Excel. |
| Répartition | Proposition automatique réglable (groupes réservés au responsable, grands comptes, partage), aperçu chiffré avant d'appliquer, attribution en un clic ou par lot, onglet « Code … (parti) » pour reprendre les clients du commercial parti qu'on gère encore. |
| Doublons | Groupes de fiches en double (même nom + adresse, même SIRET au même endroit…), fusion ou « ce ne sont pas des doublons ». |
| Ajouts | Les commerciaux proposent de nouveaux clients ; le responsable les valide. |
| Réglages & fichiers | Équipe, libellés des codes ERP, zone de travail, fichiers des commerciaux, import d'un nouvel export, reprise d'un ancien fichier (après une mise à jour de l'outil), export Excel, mot de passe, journal. |

### Règles de répartition

1. Le responsable garde tous les clients de son code ERP ; les choix manuels sont épinglés et jamais
   modifiés par la proposition automatique.
2. Un compte (un payeur et tous ses sites) n'est jamais coupé : les sites libres d'un compte rejoignent celui
   qui en tient déjà une partie (ex. un payeur du responsable dont certains sites portaient un autre code).
3. Les **groupes réservés** reviennent au responsable : tous les comptes dont le nom, ou celui du payeur,
   contient un mot-clé choisi (ex. le nom d'un grand groupe et de ses filiales). On peut exclure à la main un
   compte qui porte le nom sans faire partie du groupe. Puis les N plus gros comptes encore libres lui sont
   aussi réservés (N réglable, 10 par défaut).
4. Le reste est partagé entre les commerciaux **en nombre de comptes**, au choix :
   - **par typologie** : chacun reçoit le même nombre de comptes de chaque typologie (à un compte près), les
     gros comptes étant alternés, en privilégiant les villes où il est déjà présent ;
   - **par secteur** : des secteurs géographiques d'un seul tenant autour de Lyon, d'autant de comptes chacun.

Tout se compte en comptes : un client est un compte, quel que soit son nombre de sites. Les contrats
d'entretien n'entrent pas dans le calcul.

### Typologies

Industrie & entreprises · Tertiaire, bureaux & banques · **Facility management** · **Property management** ·
**Syndics & copropriétés** · Bailleurs & immobilier · Collectivités & enseignement · Santé & médico-social ·
Commerces & automobile · Boulangeries & métiers de bouche · Hôtellerie & restauration · Parkings · Particuliers.

Elles sont recalculées à chaque ouverture à partir des familles ERP et du nom, plus les corrections faites à la
main (fiche client, ou « Reclasser… » sur une sélection de comptes). Les sites d'un intermédiaire (facility
manager, property manager, syndic) prennent sa typologie : c'est lui le client.

Un compte peut être **compté comme un seul site** (fiche client → interrupteur), par exemple une collectivité
aux nombreux bâtiments : ses adresses sont regroupées et ne pèsent plus qu'un site.

### Sites et adresses de facturation

L'export mélange deux sortes d'adresses. L'outil ne compte et ne cartographie que les **sites d'intervention** :

- un payeur qui a des sites (siège, régie, syndic, donneur d'ordre) est une **adresse de facturation** : elle
  n'apparaît ni sur la carte ni dans les sites, ses sites oui ;
- un client facturé **hors de la zone de travail** (par défaut Auvergne-Rhône-Alpes et les départements voisins,
  réglable) sans site renseigné est une facturation dont le site est inconnu ;
- tout le reste (sites, clients facturés sur place) est un site d'intervention.

### Confidentialité et droits

- Seul le fichier du responsable permet de modifier la répartition.
- Chaque commercial reçoit son propre fichier HTML (Réglages → « Créer le fichier de… »), protégé par son
  propre mot de passe, avec deux niveaux :
  - *nom + ville* : il voit le nom et la ville des clients des autres (pour savoir à qui ils appartiennent),
    jamais leurs coordonnées ;
  - *masqués* : il ne voit que ses clients ; le contrôle anti-doublon fonctionne avec des empreintes salées.
- Un commercial peut ajouter un client ; s'il appartient déjà à quelqu'un, l'ajout est bloqué avec le message
  « consulte le responsable » (avec son prénom). Ses ajouts partent dans un petit fichier chiffré que le responsable importe et valide.

## Développement

```bash
cd portefeuille
npm install
npm run build          # → dist/portefeuille.html (vierge)
npm run dev            # reconstruit à chaque modification
npm run typecheck
npm run geo            # régénère src/geo/geo-data.json (sources publiques)
npm run analyse -- /chemin/Export.xlsx   # rapport en console (typologies, doublons…)
npm run analyse -- /chemin/Export.xlsx --distribution
```

`npm run build -- --data Export.xlsx --password "…" --equipe "Prénom:18,Prénom2,Prénom3" --parti "17:Prénom"
--appliquer --patch corrections.json --out fichier.html` produit un fichier déjà rempli et chiffré, doublons
certains fusionnés et répartition appliquée. `corrections.json` (local) peut contenir `siteUnique`, `segments`
(numéro → typologie), `epingler` (prénom → numéros de payeur), `groupes` (mots-clés des groupes réservés au
responsable) et `groupesExclus` (comptes à exclure de ces groupes). Usage local uniquement : ne jamais committer ces
fichiers, `.gitignore` exclut les fichiers générés.

### Organisation

- `src/core/` — logique pure : lecture de l'export (`parse.ts`), typologies (`segments.ts`), doublons
  (`dedupe.ts`), comptes (`accounts.ts`), répartition (`distribute.ts`), recherche, géolocalisation.
- `src/lib/` — chiffrement (Web Crypto), stockage local (IndexedDB), génération des fichiers, Excel (SheetJS).
- `src/app/` — interface React : bulles animées (canvas), carte (canvas), écrans.
- `src/geo/geo-data.json` — codes postaux → coordonnées et contours simplifiés, générés depuis
  [france-geojson](https://github.com/gregoiredavid/france-geojson) (IGN ADMIN EXPRESS) et le paquet
  `codes-postaux` (base officielle La Poste), sous Licence Ouverte.

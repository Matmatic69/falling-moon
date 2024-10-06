import React, { useState, useCallback, useRef } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect } from "react-konva";
import useImage from "use-image";
import {
  PlasmicRootProvider,
  PlasmicComponent,
} from "@plasmicapp/loader-react"; // Plasmic imports
import { PLASMIC } from "./plasmic-init"; // Plasmic configuration import
import {
  FaSun,
  FaMoon,
  FaPlus,
  FaList,
  FaTools,
  FaCheckCircle,
  FaCheck,
  FaChartBar,
  FaUndo,
  FaEraser,
  FaHighlighter,
  FaHardHat,
} from "react-icons/fa";
import PlacesAutocomplete, {
  geocodeByAddress,
  getLatLng,
} from "react-places-autocomplete";
import Script from "react-load-script";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// Assurez-vous que vous avez un composant ModalAnnotation défini
// Si ce n'est pas le cas, veuillez le définir ou ajuster le code en conséquence.

const AppGestionChantiers = () => {
  const [projets, setProjets] = useState([]);
  const [dossierTravaux, setDossierTravaux] = useState([]);
  const [projetsTermines, setProjetsTermines] = useState([]);
  const [projetActif, setProjetActif] = useState(null);
  const [notification, setNotification] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [filtreCommercial, setFiltreCommercial] = useState("");
  const [ongletActif, setOngletActif] = useState("nouveauProjet");
  const [annotationImage, setAnnotationImage] = useState(null);
  const [themeSombre, setThemeSombre] = useState(true);
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false); // État pour charger le script Google Maps

  // Fonction pour gérer le chargement du script Google Maps
  const handleScriptLoad = () => {
    setGoogleMapsLoaded(true);
    afficherNotification("Google Maps chargé avec succès", "success");
  };

  // Fonction pour gérer les erreurs de chargement du script Google Maps
  const handleScriptError = () => {
    afficherNotification(
      "Erreur lors du chargement de l'API Google Maps. Veuillez vérifier votre clé API.",
      "error"
    );
  };

  const afficherNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const modifierProjet = useCallback(
    (id, modifications) => {
      const modifier = (liste) =>
        liste.map((projet) =>
          projet.id === id ? { ...projet, ...modifications } : projet
        );

      setProjets((prevProjets) => modifier(prevProjets));
      setDossierTravaux((prevProjets) => modifier(prevProjets));
      setProjetsTermines((prevProjets) => modifier(prevProjets));

      setProjetActif((prevProjetActif) =>
        prevProjetActif && prevProjetActif.id === id
          ? { ...prevProjetActif, ...modifications }
          : prevProjetActif
      );
      afficherNotification("Projet modifié avec succès", "success");
    },
    [setProjets, setDossierTravaux, setProjetsTermines]
  );

  const marquerCommeCommande = useCallback(
    (projet) => {
      const projetCommande = {
        ...projet,
        commandeConfirmee: true,
        avancement: 0,
        etapes: {},
        montantHT: 0,
        devisNumber: "",
        clientNumber: "",
        equipmentType: "",
        datePrevisionnelle: new Date(),
      };
      setDossierTravaux((prevDossierTravaux) => [
        ...prevDossierTravaux,
        projetCommande,
      ]);
      setProjets((prevProjets) =>
        prevProjets.filter((p) => p.id !== projet.id)
      );
      setProjetActif(projetCommande);
      afficherNotification("Projet marqué comme commandé", "success");
    },
    [setDossierTravaux, setProjets]
  );

  const filtrerProjets = useCallback(
    (liste) => {
      return liste.filter(
        (projet) =>
          projet.nom.toLowerCase().includes(recherche.toLowerCase()) &&
          (filtreCommercial === "" || projet.commercial === filtreCommercial)
      );
    },
    [recherche, filtreCommercial]
  );

  const ajouterProjet = () => {
    const nouveauProjet = {
      id: Date.now(),
      nom: "",
      client: "",
      nomSociete: "",
      emailClient: "",
      telephoneClient: "",
      numeroRue: "",
      adresse: "",
      codePostal: "",
      ville: "",
      commercial: "",
      notes: [],
      photos: [],
      piecesJointes: [],
      commandeConfirmee: false,
      devisNumber: "",
      clientNumber: "",
      equipmentType: "",
      montantHT: 0,
      datePrevisionnelle: null,
      avancement: 0,
    };
    setProjets([...projets, nouveauProjet]);
    setProjetActif(nouveauProjet);
    setOngletActif("detailsProjet");
    afficherNotification("Projet créé avec succès", "success");
  };

  const supprimerProjet = (id) => {
    setProjets(projets.filter((projet) => projet.id !== id));
    setDossierTravaux(dossierTravaux.filter((projet) => projet.id !== id));
    setProjetsTermines(projetsTermines.filter((projet) => projet.id !== id));
    if (projetActif && projetActif.id === id) {
      setProjetActif(null);
    }
    afficherNotification("Projet supprimé", "success");
  };

  const ajouterPhoto = (e) => {
    const fichiers = e.target.files;
    const nouvellesPhotos = [];
    for (let i = 0; i < fichiers.length; i++) {
      const fichier = fichiers[i];
      const lecteur = new FileReader();
      lecteur.onload = (event) => {
        const photo = {
          id: Date.now() + i,
          nom: fichier.name,
          contenu: event.target.result,
        };
        nouvellesPhotos.push(photo);
        if (nouvellesPhotos.length === fichiers.length) {
          modifierProjet(projetActif.id, {
            photos: [...(projetActif.photos || []), ...nouvellesPhotos],
          });
          ouvrirAnnotation(photo);
        }
      };
      lecteur.readAsDataURL(fichier);
    }
  };

  const ajouterNoteAutomatique = (e) => {
    const contenu = e.target.value;
    if (contenu.trim() !== "") {
      const nouvelleNote = {
        id: Date.now(),
        contenu,
        date: new Date().toLocaleString(),
      };
      modifierProjet(projetActif.id, {
        notes: [...(projetActif.notes || []), nouvelleNote],
      });
      e.target.value = "";
    }
  };

  const ajouterPieceJointe = (e) => {
    const fichiers = e.target.files;
    const nouvellesPiecesJointes = [];
    for (let i = 0; i < fichiers.length; i++) {
      const fichier = fichiers[i];
      const lecteur = new FileReader();
      lecteur.onload = (event) => {
        nouvellesPiecesJointes.push({
          nom: fichier.name,
          contenu: event.target.result,
        });
        if (nouvellesPiecesJointes.length === fichiers.length) {
          modifierProjet(projetActif.id, {
            piecesJointes: [
              ...(projetActif.piecesJointes || []),
              ...nouvellesPiecesJointes,
            ],
          });
        }
      };
      lecteur.readAsDataURL(fichier);
    }
  };

  const obtenirAdresseActuelle = () => {
    if (!navigator.geolocation) {
      afficherNotification(
        "La géolocalisation n'est pas supportée par votre navigateur",
        "error"
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
        )
          .then((response) => response.json())
          .then((data) => {
            if (data && data.address) {
              const { road, house_number, postcode, city } = data.address;
              modifierProjet(projetActif.id, {
                adresse: road || "",
                numeroRue: house_number || "",
                codePostal: postcode || "",
                ville: city || "",
              });
              afficherNotification(
                "Adresse mise à jour avec succès",
                "success"
              );
            } else {
              afficherNotification("Impossible d'obtenir l'adresse", "error");
            }
          })
          .catch((error) => {
            afficherNotification(
              "Erreur lors de la récupération de l'adresse",
              "error"
            );
          });
      },
      (error) => {
        afficherNotification("Impossible d'obtenir votre position", "error");
      }
    );
  };

  const ouvrirAnnotation = (photo) => {
    setAnnotationImage(photo);
  };

  const fermerAnnotation = () => {
    setAnnotationImage(null);
  };

  const basculerTheme = () => {
    setThemeSombre(!themeSombre);
  };

  const estChampRempli = (valeur) => {
    return valeur && valeur.toString().trim() !== "";
  };

  const gererAvancement = (valeur) => {
    modifierProjet(projetActif.id, { avancement: valeur });
  };

  const gererEtapeChantier = (etape, valeur) => {
    const nouvellesEtapes = {
      ...projetActif.etapes,
      [etape]: valeur,
    };

    let projetMiseAJour = {
      etapes: nouvellesEtapes,
    };

    if (etape === "pvReceptionValide" && valeur === true) {
      projetMiseAJour.dateFin = new Date().toLocaleString();
      setProjetsTermines((prev) => [
        ...prev,
        { ...projetActif, ...projetMiseAJour },
      ]);
      setDossierTravaux((prev) =>
        prev.filter((projet) => projet.id !== projetActif.id)
      );
      setProjetActif({ ...projetActif, ...projetMiseAJour });
    } else {
      modifierProjet(projetActif.id, projetMiseAJour);
    }
  };

  const calculerStatistiques = () => {
    const totalProjets =
      projets.length + dossierTravaux.length + projetsTermines.length;
    const totalParCommercial = {};
    const totalMontantParCommercial = {};
    const projetsTous = [...projets, ...dossierTravaux, ...projetsTermines];

    projetsTous.forEach((projet) => {
      if (projet.commercial) {
        if (totalParCommercial[projet.commercial]) {
          totalParCommercial[projet.commercial] += 1;
        } else {
          totalParCommercial[projet.commercial] = 1;
        }

        if (projet.commandeConfirmee && projet.montantHT) {
          if (totalMontantParCommercial[projet.commercial]) {
            totalMontantParCommercial[projet.commercial] +=
              projet.montantHT || 0;
          } else {
            totalMontantParCommercial[projet.commercial] =
              projet.montantHT || 0;
          }
        }
      }
    });

    return {
      totalProjets,
      totalParCommercial,
      totalMontantParCommercial,
    };
  };

  // Fonction pour ouvrir le client de messagerie par défaut avec un e-mail prérempli
  const envoyerEmail = () => {
    const sujet = encodeURIComponent("Demande de création de numéro client");
    const corps = encodeURIComponent(`Bonjour,

Pourrais-tu créer le numéro client suivant ?

- Nom du projet : ${projetActif.nom || "N/A"}
- Nom du client : ${projetActif.client || "N/A"}
- Nom de la société : ${projetActif.nomSociete || "N/A"}
- Adresse : ${projetActif.numeroRue || ""} ${projetActif.adresse || ""}, ${
      projetActif.codePostal || ""
    } ${projetActif.ville || ""}
- Numéro de téléphone : ${projetActif.telephoneClient || "N/A"}
- Adresse e-mail : ${projetActif.emailClient || "N/A"}

Merci d'avance.

Cordialement,
${projetActif.commercial || "N/A"}`);

    // Remplacez "facturation@example.com" par l'adresse e-mail du service de facturation
    const mailtoLink = `mailto:facturation@example.com?subject=${sujet}&body=${corps}`;
    window.location.href = mailtoLink;
  };

  return (
    <div
      className={`flex flex-col h-screen ${
        themeSombre ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-900"
      }`}
      style={{
        backgroundImage: themeSombre
          ? "url('/images/construction-dark.jpg')"
          : "url('/images/construction-light.jpg')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      }}
    >
      {/* Chargement du script Google Maps */}
      <Script
        url={`https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={handleScriptLoad}
        onError={handleScriptError}
      />

      {notification && (
        <div
          className={`fixed top-4 right-4 w-64 p-4 rounded shadow ${
            notification.type === "success"
              ? "bg-yellow-500 text-black"
              : "bg-red-600 text-white"
          }`}
        >
          <strong className="block mb-2">
            {notification.type === "success" ? "Succès" : "Erreur"}
          </strong>
          <p>{notification.message}</p>
        </div>
      )}
      {/* Barre de navigation */}
      <div
        className={`flex items-center justify-between p-4 ${
          themeSombre ? "bg-gray-800 bg-opacity-80" : "bg-white bg-opacity-90"
        } shadow-md`}
      >
        <div className="flex items-center">
          <FaHardHat className="text-yellow-400 text-3xl mr-2" />{" "}
          {/* Icône Thématique */}
          <h1 className="text-2xl font-bold">Gestion des Chantiers</h1>
        </div>
        <div className="flex">
          <button
            onClick={() => {
              setOngletActif("nouveauProjet");
              setProjetActif(null);
            }}
            className={`p-2 mr-2 rounded flex items-center ${
              ongletActif === "nouveauProjet"
                ? "bg-yellow-500 text-black"
                : themeSombre
                ? "bg-gray-700 text-gray-200"
                : "bg-gray-200 text-gray-700"
            } hover:bg-yellow-400 transition-colors`}
          >
            <FaPlus className="mr-1" /> Nouveau Projet
          </button>
          <button
            onClick={() => {
              setOngletActif("listeProjets");
              setProjetActif(null);
            }}
            className={`p-2 mr-2 rounded flex items-center ${
              ongletActif === "listeProjets"
                ? "bg-yellow-500 text-black"
                : themeSombre
                ? "bg-gray-700 text-gray-200"
                : "bg-gray-200 text-gray-700"
            } hover:bg-yellow-400 transition-colors`}
          >
            <FaList className="mr-1" /> Liste des Projets
          </button>
          <button
            onClick={() => {
              setOngletActif("dossierTravaux");
              setProjetActif(null);
            }}
            className={`p-2 mr-2 rounded flex items-center ${
              ongletActif === "dossierTravaux"
                ? "bg-yellow-500 text-black"
                : themeSombre
                ? "bg-gray-700 text-gray-200"
                : "bg-gray-200 text-gray-700"
            } hover:bg-yellow-400 transition-colors`}
          >
            <FaTools className="mr-1" /> Dossier Travaux
          </button>
          <button
            onClick={() => {
              setOngletActif("chantiersTermines");
              setProjetActif(null);
            }}
            className={`p-2 rounded flex items-center ${
              ongletActif === "chantiersTermines"
                ? "bg-yellow-500 text-black"
                : themeSombre
                ? "bg-gray-700 text-gray-200"
                : "bg-gray-200 text-gray-700"
            } hover:bg-yellow-400 transition-colors ml-2`}
          >
            <FaCheck className="mr-1" /> Chantiers Terminés
          </button>
          <button
            onClick={() => {
              setOngletActif("statistiques");
              setProjetActif(null);
            }}
            className={`p-2 rounded flex items-center ${
              ongletActif === "statistiques"
                ? "bg-yellow-500 text-black"
                : themeSombre
                ? "bg-gray-700 text-gray-200"
                : "bg-gray-200 text-gray-700"
            } hover:bg-yellow-400 transition-colors ml-2`}
          >
            <FaChartBar className="mr-1" /> Statistiques
          </button>
        </div>
        <button
          onClick={basculerTheme}
          className="p-2 rounded-full hover:bg-gray-500 transition-colors"
          title="Basculer le thème"
        >
          {themeSombre ? (
            <FaSun className="text-yellow-400" />
          ) : (
            <FaMoon className="text-gray-800" />
          )}
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Contenu en fonction de l'onglet actif */}
        {ongletActif === "nouveauProjet" && (
          <div className="w-full flex items-center justify-center">
            <button
              onClick={ajouterProjet}
              className="bg-yellow-500 text-black rounded-full hover:bg-yellow-400 shadow-lg transform hover:scale-110 transition-transform"
              style={{
                width: "150px",
                height: "150px",
                fontSize: "72px",
                lineHeight: "150px",
                textAlign: "center",
                border: "4px solid #333",
              }}
              title="Ajouter un nouveau projet"
            >
              +
            </button>
          </div>
        )}
        {(ongletActif === "listeProjets" ||
          ongletActif === "dossierTravaux" ||
          ongletActif === "chantiersTermines") && (
          <div className="w-full overflow-auto p-4">
            <h2 className="text-3xl font-bold mb-4 text-yellow-500">
              {ongletActif === "listeProjets"
                ? "Liste des Projets"
                : ongletActif === "dossierTravaux"
                ? "Dossier Travaux"
                : "Chantiers Terminés"}
            </h2>
            {/* Recherche et filtre */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Rechercher..."
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className={`w-full p-2 border rounded mb-2 ${
                  themeSombre
                    ? "bg-gray-800 text-white placeholder-gray-400"
                    : "bg-gray-200 text-gray-900 placeholder-gray-500"
                }`}
              />
              <select
                value={filtreCommercial}
                onChange={(e) => setFiltreCommercial(e.target.value)}
                className={`w-full p-2 border rounded ${
                  themeSombre
                    ? "bg-gray-800 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <option value="">Tous les commerciaux</option>
                <option value="MATHIS DELOLMO">MATHIS DELOLMO</option>
                <option value="ALEXANDRE MARQUES">ALEXANDRE MARQUES</option>
                <option value="ELIOT DELOLMO">ELIOT DELOLMO</option>
              </select>
            </div>
            {/* Liste des projets */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtrerProjets(
                ongletActif === "listeProjets"
                  ? projets
                  : ongletActif === "dossierTravaux"
                  ? dossierTravaux
                  : projetsTermines
              ).map((projet) => (
                <button
                  key={projet.id}
                  className={`p-4 rounded shadow-lg hover:bg-yellow-500 hover:text-black transition-colors relative ${
                    themeSombre
                      ? "bg-gray-700 text-white"
                      : "bg-gray-200 text-gray-900"
                  } ${
                    projet.etapes && projet.etapes.pvReceptionValide
                      ? "border-4 border-green-500"
                      : ""
                  }`}
                  onClick={() => {
                    setProjetActif(projet);
                    setOngletActif("detailsProjet");
                  }}
                  title={`Voir les détails du projet ${projet.nom}`}
                >
                  <h3 className="text-xl font-semibold mb-2">
                    {projet.nom || "Projet sans nom"}
                  </h3>
                  <p className="text-sm">Client : {projet.client || "N/A"}</p>
                  <p className="text-sm">
                    Commercial : {projet.commercial || "N/A"}
                  </p>
                  {projet.etapes && projet.etapes.pvReceptionValide && (
                    <span className="absolute top-2 right-2 text-green-500">
                      <FaCheckCircle />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {ongletActif === "statistiques" && (
          <div className="w-full overflow-auto p-4">
            <h2 className="text-3xl font-bold mb-4 text-yellow-500">
              Statistiques
            </h2>
            {/* Affichage des statistiques */}
            {(() => {
              const stats = calculerStatistiques();
              return (
                <div className="space-y-6">
                  <div className="bg-yellow-500 p-4 rounded shadow">
                    <h3 className="text-xl font-semibold mb-2">
                      Total de projets :
                    </h3>
                    <p className="text-2xl">{stats.totalProjets}</p>
                  </div>
                  <div className="bg-yellow-500 p-4 rounded shadow">
                    <h3 className="text-xl font-semibold mb-2">
                      Projets par commercial :
                    </h3>
                    <ul className="list-disc list-inside">
                      {Object.entries(stats.totalParCommercial).map(
                        ([commercial, total], index) => (
                          <li key={index}>
                            {commercial} : {total}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                  <div className="bg-yellow-500 p-4 rounded shadow">
                    <h3 className="text-xl font-semibold mb-2">
                      Montant total HT par commercial :
                    </h3>
                    <ul className="list-disc list-inside">
                      {Object.entries(stats.totalMontantParCommercial).map(
                        ([commercial, montant], index) => (
                          <li key={index}>
                            {commercial} : {montant.toFixed(2)} €
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {ongletActif === "detailsProjet" && projetActif && (
          <div className="flex-1 overflow-auto p-4 bg-gray-800 bg-opacity-50">
            <h2 className="text-3xl font-bold mb-4 text-yellow-400">
              {projetActif.nom || "Nouveau Projet"}
            </h2>
            {/* Formulaire pour les détails du projet */}
            <div className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="block mb-2 relative">
                  Nom du projet :
                  {estChampRempli(projetActif.nom) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="text"
                    value={projetActif.nom}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, { nom: e.target.value })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez le nom du projet"
                  />
                </label>
                <label className="block mb-2 relative">
                  Nom du client :
                  {estChampRempli(projetActif.client) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="text"
                    value={projetActif.client || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, { client: e.target.value })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez le nom du client"
                  />
                </label>
                <label className="block mb-2 relative">
                  Nom de la société :
                  {estChampRempli(projetActif.nomSociete) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="text"
                    value={projetActif.nomSociete || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        nomSociete: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez le nom de la société"
                  />
                </label>
                <label className="block mb-2 relative">
                  Adresse e-mail du client :
                  {estChampRempli(projetActif.emailClient) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="email"
                    value={projetActif.emailClient || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        emailClient: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez l'e-mail du client"
                  />
                </label>
                <label className="block mb-2 relative">
                  Numéro de téléphone du client :
                  {estChampRempli(projetActif.telephoneClient) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="tel"
                    value={projetActif.telephoneClient || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        telephoneClient: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez le téléphone du client"
                  />
                </label>
                {/* Utilisation de PlacesAutocomplete pour l'adresse */}
                {googleMapsLoaded ? (
                  <PlacesAutocomplete
                    value={projetActif.adresse || ""}
                    onChange={(adresse) =>
                      modifierProjet(projetActif.id, { adresse })
                    }
                    onSelect={(adresse) => {
                      geocodeByAddress(adresse)
                        .then((results) => getLatLng(results[0]))
                        .then((latLng) => {
                          modifierProjet(projetActif.id, {
                            adresse,
                            latitude: latLng.lat,
                            longitude: latLng.lng,
                          });
                        })
                        .catch((error) => console.error("Error", error));
                    }}
                  >
                    {({
                      getInputProps,
                      suggestions,
                      getSuggestionItemProps,
                      loading,
                    }) => (
                      <div className="relative">
                        <input
                          {...getInputProps({
                            placeholder: "Adresse du projet...",
                            className: `w-full p-3 border rounded mt-1 ${
                              themeSombre
                                ? "bg-gray-700 text-white placeholder-gray-400"
                                : "bg-gray-200 text-gray-900 placeholder-gray-500"
                            }`,
                          })}
                        />
                        <div className="absolute bg-white border rounded mt-1 w-full z-10">
                          {loading && <div className="p-2">Chargement...</div>}
                          {suggestions.map((suggestion, index) => {
                            const className = suggestion.active
                              ? "bg-yellow-500 text-black p-2 cursor-pointer"
                              : "p-2 cursor-pointer";
                            return (
                              <div
                                key={index}
                                {...getSuggestionItemProps(suggestion, {
                                  className,
                                })}
                              >
                                <span>{suggestion.description}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </PlacesAutocomplete>
                ) : (
                  <label className="block mb-2 relative">
                    Adresse du projet :
                    {estChampRempli(projetActif.adresse) && (
                      <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                    )}
                    <input
                      type="text"
                      value={projetActif.adresse || ""}
                      onChange={(e) =>
                        modifierProjet(projetActif.id, {
                          adresse: e.target.value,
                        })
                      }
                      className={`w-full p-3 border rounded mt-1 ${
                        themeSombre
                          ? "bg-gray-700 text-white placeholder-gray-400"
                          : "bg-gray-200 text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder="Entrez l'adresse du projet"
                    />
                  </label>
                )}
                <label className="block mb-2 relative">
                  Code postal :
                  {estChampRempli(projetActif.codePostal) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="text"
                    value={projetActif.codePostal || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        codePostal: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez le code postal"
                  />
                </label>
                <label className="block mb-2 relative">
                  Ville :
                  {estChampRempli(projetActif.ville) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <input
                    type="text"
                    value={projetActif.ville || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        ville: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder="Entrez la ville"
                  />
                </label>
                <label className="block mb-2 relative">
                  Commercial responsable :
                  {estChampRempli(projetActif.commercial) && (
                    <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                  )}
                  <select
                    value={projetActif.commercial || ""}
                    onChange={(e) =>
                      modifierProjet(projetActif.id, {
                        commercial: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    <option value="">Sélectionner un commercial</option>
                    <option value="MATHIS DELOLMO">MATHIS DELOLMO</option>
                    <option value="ALEXANDRE MARQUES">ALEXANDRE MARQUES</option>
                    <option value="ELIOT DELOLMO">ELIOT DELOLMO</option>
                  </select>
                </label>
                {/* Champs conditionnels après commande */}
                {projetActif.commandeConfirmee && (
                  <>
                    <label className="block mb-2 relative">
                      Numéro de devis :
                      {estChampRempli(projetActif.devisNumber) && (
                        <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                      )}
                      <input
                        type="text"
                        value={projetActif.devisNumber || ""}
                        onChange={(e) =>
                          modifierProjet(projetActif.id, {
                            devisNumber: e.target.value,
                          })
                        }
                        className={`w-full p-3 border rounded mt-1 ${
                          themeSombre
                            ? "bg-gray-700 text-white placeholder-gray-400"
                            : "bg-gray-200 text-gray-900 placeholder-gray-500"
                        }`}
                        placeholder="Entrez le numéro de devis"
                      />
                    </label>
                    <label className="block mb-2 relative">
                      Numéro client :
                      {estChampRempli(projetActif.clientNumber) && (
                        <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                      )}
                      <input
                        type="text"
                        value={projetActif.clientNumber || ""}
                        onChange={(e) =>
                          modifierProjet(projetActif.id, {
                            clientNumber: e.target.value,
                          })
                        }
                        className={`w-full p-3 border rounded mt-1 ${
                          themeSombre
                            ? "bg-gray-700 text-white placeholder-gray-400"
                            : "bg-gray-200 text-gray-900 placeholder-gray-500"
                        }`}
                        placeholder="Entrez le numéro client"
                      />
                    </label>
                    <label className="block mb-2 relative">
                      Type d'équipement :
                      {estChampRempli(projetActif.equipmentType) && (
                        <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                      )}
                      <input
                        type="text"
                        value={projetActif.equipmentType || ""}
                        onChange={(e) =>
                          modifierProjet(projetActif.id, {
                            equipmentType: e.target.value,
                          })
                        }
                        className={`w-full p-3 border rounded mt-1 ${
                          themeSombre
                            ? "bg-gray-700 text-white placeholder-gray-400"
                            : "bg-gray-200 text-gray-900 placeholder-gray-500"
                        }`}
                        placeholder="Entrez le type d'équipement"
                      />
                    </label>
                    <label className="block mb-2 relative">
                      Montant HT de la commande (€) :
                      {estChampRempli(projetActif.montantHT) && (
                        <FaCheckCircle className="absolute top-0 right-0 text-green-500" />
                      )}
                      <input
                        type="number"
                        value={projetActif.montantHT || 0}
                        onChange={(e) =>
                          modifierProjet(projetActif.id, {
                            montantHT: parseFloat(e.target.value),
                          })
                        }
                        className={`w-full p-3 border rounded mt-1 ${
                          themeSombre
                            ? "bg-gray-700 text-white placeholder-gray-400"
                            : "bg-gray-200 text-gray-900 placeholder-gray-500"
                        }`}
                        placeholder="Entrez le montant HT"
                      />
                    </label>
                  </>
                )}
              </div>
              {/* Notes */}
              <div className="mt-6">
                <h3 className="text-2xl font-bold mb-2 text-yellow-400">
                  Notes :
                </h3>
                <textarea
                  onBlur={ajouterNoteAutomatique}
                  placeholder="Ajouter une note..."
                  className={`w-full p-3 border rounded mb-2 ${
                    themeSombre
                      ? "bg-gray-700 text-white placeholder-gray-400"
                      : "bg-gray-200 text-gray-900 placeholder-gray-500"
                  }`}
                />
                <ul className="mt-4">
                  {projetActif.notes &&
                    projetActif.notes.map((note) => (
                      <li
                        key={note.id}
                        className={`mb-2 p-3 border rounded ${
                          themeSombre ? "bg-gray-700" : "bg-gray-200"
                        }`}
                      >
                        <p>{note.contenu}</p>
                        <small
                          className={
                            themeSombre ? "text-gray-400" : "text-gray-600"
                          }
                        >
                          {note.date}
                        </small>
                      </li>
                    ))}
                </ul>
              </div>
              {/* Photos */}
              <label className="block mb-2 mt-6">
                Photos :
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={ajouterPhoto}
                  className={`w-full p-3 border rounded mt-1 ${
                    themeSombre
                      ? "bg-gray-700 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                />
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {projetActif.photos &&
                  projetActif.photos.map((photo, index) => (
                    <div
                      key={index}
                      className="relative cursor-pointer group"
                      onClick={() => ouvrirAnnotation(photo)}
                    >
                      <img
                        src={photo.contenu}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-32 object-cover rounded shadow-lg group-hover:opacity-75 transition-opacity"
                      />
                      <a
                        href={photo.contenu}
                        download={photo.nom}
                        className="absolute top-1 right-1 bg-gray-800 bg-opacity-75 text-white p-1 rounded hover:bg-opacity-100"
                        title="Télécharger la photo"
                      >
                        &#x21E9;
                      </a>
                    </div>
                  ))}
              </div>
              {/* Pièces jointes */}
              <label className="block mb-2 mt-6">
                Pièces Jointes :
                <input
                  type="file"
                  multiple
                  onChange={ajouterPieceJointe}
                  className={`w-full p-3 border rounded mt-1 ${
                    themeSombre
                      ? "bg-gray-700 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                />
              </label>
              <ul className="mt-2">
                {projetActif.piecesJointes &&
                  projetActif.piecesJointes.map((fichier, index) => (
                    <li key={index} className="mb-2">
                      <a
                        href={fichier.contenu}
                        download={fichier.nom}
                        className="text-yellow-400 underline hover:text-yellow-600"
                      >
                        {fichier.nom}
                      </a>
                    </li>
                  ))}
              </ul>
              {/* Options supplémentaires pour les projets commandés */}
              {projetActif.commandeConfirmee && (
                <div className="mt-6">
                  <h3 className="text-2xl font-bold mb-2 text-yellow-400">
                    Avancement du chantier :
                  </h3>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={projetActif.avancement}
                    onChange={(e) =>
                      gererAvancement(parseInt(e.target.value, 10))
                    }
                    className="w-full"
                  />
                  <p className="text-lg">{projetActif.avancement}%</p>
                  <h3 className="text-2xl font-bold mt-6 mb-2 text-yellow-400">
                    Date prévisionnelle des travaux :
                  </h3>
                  <DatePicker
                    selected={
                      projetActif.datePrevisionnelle
                        ? new Date(projetActif.datePrevisionnelle)
                        : null
                    }
                    onChange={(date) =>
                      modifierProjet(projetActif.id, {
                        datePrevisionnelle: date,
                      })
                    }
                    className={`w-full p-3 border rounded mt-1 ${
                      themeSombre
                        ? "bg-gray-700 text-white placeholder-gray-400"
                        : "bg-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                    placeholderText="Sélectionner une date"
                  />
                </div>
              )}
            </div>
            {/* Actions sur le projet */}
            <div className="mt-6 flex flex-wrap gap-4">
              {!projetActif.commandeConfirmee && (
                <button
                  onClick={() => marquerCommeCommande(projetActif)}
                  className="bg-yellow-500 text-black p-3 rounded hover:bg-yellow-400 transition-colors"
                >
                  Commandé
                </button>
              )}
              <button
                onClick={() => supprimerProjet(projetActif.id)}
                className="bg-red-600 text-white p-3 rounded hover:bg-red-500 transition-colors"
              >
                Supprimer
              </button>
              <button
                onClick={() => {
                  setProjetActif(null);
                  setOngletActif(
                    projetActif.commandeConfirmee
                      ? projetActif.etapes &&
                        projetActif.etapes.pvReceptionValide
                        ? "chantiersTermines"
                        : "dossierTravaux"
                      : "listeProjets"
                  );
                }}
                className="bg-gray-600 text-white p-3 rounded hover:bg-gray-500 transition-colors"
              >
                Retour
              </button>
              {/* Bouton Demande de numéro client */}
              <button
                onClick={envoyerEmail}
                className="bg-yellow-500 text-black p-3 rounded hover:bg-yellow-400 transition-colors"
              >
                Demande de numéro client
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Modal pour l'annotation */}
      {annotationImage && (
        <ModalAnnotation
          photo={annotationImage}
          onClose={fermerAnnotation}
          onSave={(annotatedImage, annotations) => {
            const photosMisesAJour = projetActif.photos.map((p) =>
              p.id === annotationImage.id
                ? { ...p, contenu: annotatedImage, annotations }
                : p
            );
            modifierProjet(projetActif.id, { photos: photosMisesAJour });
            setAnnotationImage(null);
          }}
        />
      )}
    </div>
  );
};

// Composant pour l'annotation des images
const ModalAnnotation = ({ photo, onClose, onSave }) => {
  const [image] = useImage(photo.contenu);
  const [annotations, setAnnotations] = useState(photo.annotations || []);
  const isDrawing = useRef(false);
  const stageRef = useRef(null);
  const [tool, setTool] = useState("pen"); // 'pen', 'eraser', 'highlighter'

  const handleMouseDown = (e) => {
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    setAnnotations((prevAnnotations) => [
      ...prevAnnotations,
      { tool, points: [pos.x, pos.y] },
    ]);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current) return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    let lastAnnotation = annotations[annotations.length - 1];
    lastAnnotation.points = lastAnnotation.points.concat([point.x, point.y]);

    annotations.splice(annotations.length - 1, 1, lastAnnotation);
    setAnnotations(annotations.concat());
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const handleUndo = () => {
    setAnnotations((prevAnnotations) => prevAnnotations.slice(0, -1));
  };

  const handleSave = () => {
    const uri = stageRef.current.toDataURL();
    onSave(uri, annotations);
  };

  const handleErase = () => {
    setTool("eraser");
  };

  const handleHighlight = () => {
    setTool("highlighter");
  };

  const handlePen = () => {
    setTool("pen");
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div
        className="bg-gray-800 p-4 rounded shadow-lg relative"
        style={{ width: "700px" }}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-white text-2xl"
        >
          &#x2715;
        </button>
        {/* Outils d'annotation */}
        <div className="flex space-x-2 mb-4">
          <button
            onClick={handlePen}
            className={`p-2 rounded ${
              tool === "pen"
                ? "bg-yellow-500 text-black"
                : "bg-gray-700 text-gray-200"
            } hover:bg-yellow-400 transition-colors`}
            title="Outil Stylo"
          >
            <FaSun /> Pen
          </button>
          <button
            onClick={handleErase}
            className={`p-2 rounded ${
              tool === "eraser"
                ? "bg-yellow-500 text-black"
                : "bg-gray-700 text-gray-200"
            } hover:bg-yellow-400 transition-colors`}
            title="Outil Gomme"
          >
            <FaEraser /> Eraser
          </button>
          <button
            onClick={handleHighlight}
            className={`p-2 rounded ${
              tool === "highlighter"
                ? "bg-yellow-500 text-black"
                : "bg-gray-700 text-gray-200"
            } hover:bg-yellow-400 transition-colors`}
            title="Outil Surligneur"
          >
            <FaHighlighter /> Highlight
          </button>
          <button
            onClick={handleUndo}
            className="p-2 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            title="Annuler"
          >
            <FaUndo /> Undo
          </button>
        </div>
        <Stage
          width={650}
          height={450}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          ref={stageRef}
          className="border-4 border-yellow-500 rounded"
        >
          <Layer>
            <KonvaImage image={image} width={650} height={450} />
            {annotations.map((ann, i) => (
              <Line
                key={i}
                points={ann.points}
                stroke={
                  ann.tool === "pen"
                    ? "#FF4500" // Orange pour le stylo
                    : ann.tool === "highlighter"
                    ? "yellow"
                    : "white"
                }
                strokeWidth={ann.tool === "eraser" ? 20 : 4}
                tension={0.5}
                lineCap="round"
                globalCompositeOperation={
                  ann.tool === "eraser" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>
        <div className="flex justify-between mt-4">
          <button
            onClick={handleUndo}
            className="bg-gray-700 text-gray-200 p-2 rounded hover:bg-gray-600 transition-colors"
            title="Annuler la dernière action"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            className="bg-yellow-500 text-black p-2 rounded hover:bg-yellow-400 transition-colors"
            title="Enregistrer les annotations"
          >
            Enregistrer les annotations
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppGestionChantiers;

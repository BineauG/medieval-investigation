# Tests

## Résultats automatisés exécutés

Environnement : Windows, Node fourni par le workspace, dépôt `medieval-investigation-toolkit`.

| Commande | Résultat |
|---|---|
| `npm test` | 63/63 tests réussis |
| `npm run check` | manifeste, JSON, fichiers déclarés, absence de CDN/jQuery/`actor.system` validés |
| `node --check` sur tous les `.js` | réussi |

La suite couvre : validation des cartes et connexions, migrations, rejet audio/vidéo, résolution UUID, sélection de l’image de token, permissions, autorité MJ, mutations collaboratives du graphe, conflits par champ, validation/sérialisation, relations et déplacement joueur, appartenance multiple, nettoyage après suppression et chargement du point d’entrée sur une surface API `ApplicationV2` mockée.

## Statut des tests Foundry réels

Une version antérieure du module a été chargée dans une session locale Foundry 13.351 + WFRP4e en tant que MJ. Les contrôles, formulaires, dossiers `pins` et `parchments`, FilePicker et bouton du graphe avaient été observés. Les changements 1.6.0 sont contrôlés hors ligne uniquement : Foundry n’a pas été lancé pour ce patch. La file automatique, les mutations atomiques, les deltas de champs, les permissions et la détection de conflits sont testés unitairement ; le déplacement diffusé entre plusieurs navigateurs reste à confirmer visuellement. Foundry v14 et le multijoueur ne sont pas installés ou validés dans cet environnement.

Légende : `À exécuter` signifie non testé dans une instance réelle ; `Partiel` précise la partie réellement observée.

## Matrice plateformes et systèmes

| Cible | Scénario | Statut |
|---|---|---|
| Foundry 13.351 + WFRP4e | Monde de test, MJ seul | Partiel : chargement, contrôles, formulaires et FilePicker réussis |
| Foundry 13.351 + WFRP4e | MJ + joueur dans deux navigateurs | À exécuter |
| Foundry 13 + système générique | Toutes les fonctions sans accès système | À exécuter |
| Foundry 14 stable | Chargement, contrôles, ApplicationV2, dessins et journal | À exécuter |

## Panneau

| Test manuel | Résultat attendu | Statut |
|---|---|---|
| Afficher une carte non cachée avec un compte joueur et changer d’outil de canevas | La carte, son pin et ses ficelles restent visibles | À exécuter |
| Cocher Afficher le nom et Afficher l’image sur une source non observable | Le joueur voit ces deux contenus sans pouvoir ouvrir la fiche source | À exécuter |
| Cacher une carte en tant que MJ | Carte, pin et ficelles invisibles au joueur, ensemble encore visible au MJ | À exécuter |
| Cocher l’option dans la scène | Le flag `investigationBoard.enabled` est persistant et les outils apparaissent | À exécuter |
| Utiliser le bouton de contrôle | L’état bascule sans masquer les outils de dessin natifs | À exécuter |
| Créer Acteur/Document/Note | Trois `DrawingDocument` et flags carte v2 valides ; la Note apparaît sans formulaire préalable | À exécuter pour la Note 1.3.0 |
| Cocher le tag Mort | Cachet noir en bas, dimension maximale dans la zone libre, sans débordement ni chevauchement | À exécuter |
| Changer l’asset Mort | Le cachet personnalisé remplace le SVG fourni sur toutes les cartes taguées | À exécuter |
| Double-cliquer une Note | Éditeur à un champ ; Entrée enregistre un ou deux mots et ferme la fenêtre | À exécuter |
| Redimensionner une Note | Fanion et texte vertical se réadaptent ; pin et ficelles suivent | À exécuter |
| Changer le sens de lecture | Rotation droite par défaut, gauche si configurée, rafraîchissement du rendu | À exécuter |
| Déposer Actor, Item, Journal/Page | Carte générique au bon emplacement | À exécuter |
| Choisir MP3/OGG/WAV/FLAC/M4A | Refus explicite, aucun Drawing créé | À exécuter |
| Masquer nom puis portrait | Valeurs neutres côté joueur, indicateur discret côté MJ | À exécuter |
| Modifier Actor source | Nom/image actualisés sauf surcharge locale | À exécuter |
| Supprimer la source | Carte conservée, référence manquante, pas d’erreur | À exécuter |
| Déplacer/redimensionner | Le fond image s’étire exactement avec la carte ; carte et sceau suivent ; taille minimale respectée | À exécuter |
| Créer un Document sans/avec image | Parchemin générique sans choix ; image choisie comme fond complet, format initial au ratio naturel et titre superposé, sans champ descriptif | À exécuter |
| Relier deux sceaux | Aperçu, ficelle courbe persistante, doublon refusé | À exécuter |
| Maj + glisser entre deux sceaux | Aperçu en temps réel, création au relâchement, navigation libre après le geste | À exécuter |
| Double-cliquer une carte | Éditeur du module seul, sans configuration native du Drawing ; champs Document non redondants | Partiel : éditeur et FilePicker réussis depuis les outils ; geste canevas à exécuter |
| Ouvrir les paramètres d’assets | Les dossiers persistants de sceaux, parchemins, notes et tags sont proposés | Partiel : anciens dossiers créés et visibles ; dossier tags à exécuter |
| Déplacer une carte reliée | Ficelles incidentes mises à jour pendant le mouvement | À exécuter |
| Sélectionner/modifier/supprimer une connexion | Clic sur la courbe : surbrillance ; double-clic : palette des neuf couleurs, épaisseur et affaissement ; Suppr : suppression | À exécuter |
| Supprimer carte reliée | Confirmation puis nettoyage de toutes les ficelles | À exécuter |
| Changer de scène/recharger | Nettoyage du rendu, reconstruction depuis les documents | À exécuter |
| 100 cartes / 200 ficelles | Interaction utilisable et écritures limitées aux fins de geste | À exécuter |

## Graphe

| Test manuel | Résultat attendu | Statut |
|---|---|---|
| Ouvrir depuis Notes | Le bouton du graphe est présent dans les contrôles Notes | Réussi sur Foundry 13.351 |
| Première ouverture MJ | Journal/Page de stockage créés avec ownership Observer | À exécuter |
| Déposer un Actor | Nœud à position manuelle et image du prototype token | À exécuter |
| Modifier/supprimer Actor | Actualisation ou indicateur de référence manquante | À exécuter |
| Créer les trois formes de faction | Formes fermées derrière les personnages | À exécuter |
| Déposer personnage dans faction | Appartenance explicite et badge persistant | À exécuter |
| Ajouter deux factions | Deux badges ; sortir des formes ne retire rien | À exécuter |
| Maj + déplacer faction | Forme seule ; sans Maj, membres visibles déplacés | À exécuter |
| Créer les 4 types de relation | Actor↔Actor, Actor↔Faction, Faction↔Actor, Faction↔Faction | À exécuter |
| Direction/libellé/style | Flèche optionnelle et libellé lisible | À exécuter |
| Zoom/pan/ajuster | Viewport fluide et local à chaque utilisateur, sans écriture partagée | À exécuter |
| Annuler/rétablir | Une opération inverse est synchronisée sans restaurer une ancienne copie globale | À exécuter |
| Export/import JSON | Aller-retour validé, import invalide refusé | À exécuter |
| Fermeture/rechargement | Même graphe ; la fermeture attend les mutations encore en file | À exécuter |
| Deux éditeurs sur des éléments distincts | Les deux mutations sont fusionnées et visibles dans les deux fenêtres | Automatisé hors ligne ; à confirmer visuellement |
| Deux éditeurs sur le même champ | La première mutation est conservée, la seconde resynchronisée avec un message | Automatisé hors ligne ; à confirmer visuellement |
| Deux utilisateurs déplaçant des nœuds distincts | Aperçu distant pendant le geste et une écriture par nœud au relâchement | À exécuter |
| 150 entités / 300 relations | Déplacement met à jour seulement l’entité et ses arêtes incidentes | À exécuter |

## Permissions et reconnexion

| Test manuel | Résultat attendu | Statut |
|---|---|---|
| Joueur double-cliquant une carte | Éditeur limité au titre local et au tag Mort ; modification visible par tous | À exécuter |
| Joueur tentant une autre modification de carte | Refus par l’interface et par le contrôleur MJ | À exécuter |
| Joueur double-cliquant une ficelle | Éditeur de style ouvert ; modification visible par tous | À exécuter |
| Joueur déplaçant un nœud Acteur | Mouvement diffusé en direct puis synchronisé au relâchement | À exécuter |
| Joueur créant/modifiant/supprimant une relation du graphe | Opération immédiate via le MJ actif, visible pour tous | À exécuter |
| Deux joueurs modifiant des champs différents | Requêtes automatiques sérialisées et fusionnées, sans intervention du MJ | Automatisé hors ligne ; à confirmer visuellement |
| Deux joueurs modifiant le même champ | Première écriture conservée ; seconde refusée avec message de conflit | Automatisé hors ligne ; à confirmer visuellement |
| Deux MJ actifs | Premier identifiant lexical seul traite la commande | À exécuter |
| Aucun MJ actif | Message clair, aucune mutation locale | À exécuter |
| Reconnexion joueur | État reconstruit depuis Scene/JournalPage | À exécuter |

## Procédure de diagnostic

1. Activer **Logs détaillés**.
2. Reproduire l’action.
3. Relever les entrées préfixées `[Medieval Investigation Toolkit]`.
4. Inspecter les flags de la scène, du Drawing ou de la JournalEntryPage concernée.
5. Pour un conflit de graphe, fermer et rouvrir l’application avant de rejouer la modification.

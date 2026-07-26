# Medieval Investigation Toolkit

Module Foundry Virtual Tabletop réunissant un panneau d’enquête médiéval placé sur une scène et un graphe persistant de relations entre personnages et factions.

Le module est développé indépendamment, sans dépendance obligatoire, sans CDN et sans accès à `actor.system`. WFRP4e est la cible prioritaire, mais toutes les sources sont manipulées par leurs UUID et APIs Foundry génériques.

## Compatibilité

- Foundry VTT 13 minimum ; manifeste vérifié 13.
- Chemins de compatibilité prévus pour Foundry 14, dont `ApplicationV2`, les contrôles de scène et les documents embarqués.
- WFRP4e et systèmes génériques ne nécessitant aucun adaptateur système.
- JavaScript ES modules, sans étape de build.

La suite automatisée valide les modèles et une surface API mockée v13/v14. Une session Foundry 13.351 est installée sur la machine de développement, mais les scénarios visuels et multijoueurs réels n’ont pas été exécutés automatiquement. Voir [TESTING.md](TESTING.md).

## Installation

Dans Foundry VTT, ouvrir **Configuration et installation** → **Modules complémentaires** → **Installer un module**, puis coller cette URL dans le champ **URL du manifeste** :

```text
https://raw.githubusercontent.com/BineauG/medieval-investigation/main/module.json
```

Foundry téléchargera la release compatible et proposera ensuite les mises à jour comme pour les autres modules.

Installation manuelle :

1. Télécharger `module.zip` depuis la [dernière release GitHub](https://github.com/BineauG/medieval-investigation/releases/latest).
2. Extraire son contenu dans `Data/modules/medieval-investigation-toolkit` de sorte que `module.json` soit à la racine du dossier.
3. Redémarrer Foundry et activer **Medieval Investigation Toolkit** dans le monde.

Pour développer depuis le dépôt :

```text
npm test
npm run check
npm run package
```

## Panneau d’enquête

### Activer une scène

Deux chemins sont disponibles pour le MJ :

- ouvrir la configuration de la scène et cocher **Panneau d’enquête médiéval** ;
- ouvrir les contrôles **Dessins** et utiliser **Activer ou désactiver le panneau d’enquête**.

L’état est conservé dans `flags.medieval-investigation-toolkit.investigationBoard.enabled`. Le fond de scène n’est jamais modifié.

### Créer les cartes

- **Carte Acteur** : utiliser l’outil puis choisir un Actor accessible, ou déposer un Actor depuis le répertoire sur la scène.
- **Carte Document** : utiliser l’outil et saisir un UUID, choisir un fichier image avec le FilePicker, ou déposer un Item, Journal/Page, Scene, RollTable, Macro, Cards ou autre document doté d’un UUID.
- **Note** : cliquer sur l’outil crée immédiatement une languette verticale au centre de la scène. Elle contient un ou deux mots, possède un pin et se déplace, se redimensionne ou se relie comme les autres cartes.

Les Playlists, PlaylistSounds, AmbientSounds, types MIME audio et extensions audio courantes sont refusés avec un message explicite. La vidéo est également hors périmètre de cette version.

Chaque carte est un `DrawingDocument` natif rendu par une sous-classe de `Drawing`, selon le modèle éprouvé par Investigation Board. Il n’existe plus de second renderer de cartes greffé au canevas. Le contenu visuel est enfant de la vraie surface `Drawing.shape` de Foundry : une carte non cachée reste donc visible par les joueurs quel que soit l’outil de canevas actif. Carte, pin et ficelles utilisent la même règle de visibilité ; une carte cachée ne révèle aucun de ces éléments aux joueurs et reste seulement visible par le MJ. Les déplacements, redimensionnements, rotation, visibilité et ordre suivent directement la couche de dessins. Le rendu réagit aux `renderFlags` de Foundry : le fond image est la surface opaque réelle de la carte et est étiré exactement à ses dimensions pendant le redimensionnement, sans bordure ni ombre ajoutée. Le portrait d’une carte Acteur conserve en revanche son ratio et reste entièrement visible. Pour une carte Document, l’image de référence choisie remplace tout le fond et le titre est dessiné par-dessus ; sans image choisie, le parchemin générique est utilisé. À la création ou après le choix d’une nouvelle image, le format initial de la carte reprend automatiquement le ratio naturel de cette image. Le redimensionnement manuel reste libre ensuite. Les cartes Acteur et Document n’ont aucun champ descriptif : le texte libre appartient exclusivement au fanion Note. Les sceaux vivent dans un conteneur global séparé afin que leur interaction ne déclenche jamais le déplacement du Drawing. Les métadonnées propres au module sont versionnées dans `drawing.flags.medieval-investigation-toolkit`; aucun document source complet n’est copié.

Double-cliquer une carte ouvre exclusivement l’éditeur du module, sans afficher la configuration native du Drawing. Pour une carte Document, cet éditeur présente uniquement la référence Foundry facultative, le titre, l’image de fond, son aperçu et les options d’affichage. Le clic droit propose modification, duplication et ordre d’affichage à tous les utilisateurs ; l’ouverture de la source et la suppression restent réservées au MJ. Le nom et l’image peuvent être surchargés ou masqués séparément. Une surcharge vide rétablit la valeur de la source. Cocher leur option d’affichage les partage explicitement sur le panneau avec les joueurs ; cela ne leur accorde jamais la permission d’ouvrir la fiche Foundry source.

Une note s’édite dans une fenêtre dédiée ne contenant qu’un champ court. Saisir un ou deux mots puis appuyer sur `Entrée` enregistre et ferme la fenêtre. Son texte noir utilise la police Almendra SC intégrée au module, est pivoté et se lit du haut vers le bas ; le réglage **Sens de lecture des notes** choisit une inclinaison vers la droite, utilisée par défaut, ou vers la gauche. Une image de fanion peut être choisie dans **Configurer les images**. Sans image, la note est un rectangle textile vertical. Les anciennes cartes Libres sont affichées selon ce nouveau format.

Chaque carte possède une liste de tags extensible. Le premier choix disponible est **Mort** : il affiche un cachet de cire noir dans la zone inférieure libre. Sa taille est calculée à partir de l’espace restant afin de ne jamais sortir de la carte ni recouvrir le portrait, le titre ou le texte vertical d’une Note. Le cachet fourni peut être remplacé dans **Configurer les images**.

Les pins de toutes les cartes utilisent une échelle visuelle et interactive augmentée de 30 % depuis la version 1.3.1.

### Créer les ficelles

Le geste direct est **Maj + glisser** depuis le sceau d’une carte vers celui d’une autre : la ficelle temporaire suit le pointeur en temps réel. Les sceaux restent utilisables même si le contrôle actif n’est pas Dessins. Un clic ordinaire sur un sceau ne fait rien. Le mode alternatif par deux clics reste disponible uniquement après avoir activé l’outil **Connexions**. Cliquer une ficelle la sélectionne en doré ; la touche Suppr ou son menu contextuel l’efface ; un double-clic ouvre son éditeur de couleur, d’épaisseur et d’affaissement. La couleur se choisit parmi neuf pigments WFRP : rouge, bleu, jaune, vert, pourpre, noir, blanc, gris et orange.

`Échap` annule. Les auto-connexions et doublons sont refusés. Les ficelles sont stockées une seule fois dans le flag de scène et suivent en temps réel les clones temporaires utilisés par Foundry pendant le déplacement.

## Graphe de relations

Ouvrir **Graphe de relations** depuis les contrôles Notes ou appeler l’API. La première ouverture par un MJ crée une `JournalEntry` dédiée et une `JournalEntryPage` contenant le graphe dans ses flags.

### Personnages

Déposer un Actor sur le SVG. Son image utilise, dans l’ordre, `prototypeToken.texture.src`, `actor.img`, puis la silhouette fournie. Le nom et l’image se mettent à jour à partir de l’Actor tant qu’aucune surcharge n’existe. Une source supprimée conserve le nœud et affiche **Référence manquante**.

### Factions

Utiliser **Nouvelle faction**, choisir rectangle arrondi, ellipse ou polygone fermé, puis régler nom, taille et style. Déposer un personnage dans la forme ajoute explicitement son appartenance sans la retirer lorsqu’il en sort. L’éditeur de faction et le menu contextuel permettent aussi d’ajouter ou retirer des membres. Un personnage peut avoir plusieurs badges de faction.

Glisser une faction déplace par défaut sa forme et ses membres visibles. Maintenir `Maj` déplace uniquement la forme. La poignée de redimensionnement apparaît sur la faction sélectionnée.

### Relations

1. Activer **Nouvelle relation**.
2. Cliquer une source, personnage ou faction.
3. Cliquer une cible, personnage ou faction.
4. Saisir le libellé libre, la direction et le style.

Les relations directionnelles affichent une flèche. Le double-clic ou le menu contextuel ouvre l’éditeur. Le graphe prend en charge zoom à la molette, déplacement de vue, ajustement à la fenêtre, suppression clavier, annuler/rétablir, sauvegarde, import et export JSON.

## Permissions et synchronisation

Le MJ dispose de toutes les fonctions. Sur une scène où le panneau d’enquête est actif, un joueur peut déplacer et redimensionner les cartes, les dupliquer, changer leur ordre d’affichage et créer immédiatement une note libre. Il ne peut pas créer de carte Acteur ou Document, ouvrir la source liée, supprimer une carte, créer ou supprimer une ficelle, ni modifier le graphe. En double-cliquant une carte, il voit uniquement **Titre local** et le tag **Mort** et peut les modifier pour tout le monde. En double-cliquant une ficelle existante, il peut modifier son style dans la palette prévue.

Une requête joueur est envoyée au premier MJ actif trié par identifiant. Ce client sert uniquement d’autorité technique : aucune confirmation, fenêtre d’approbation ou validation manuelle du MJ n’est demandée. L’opération autorisée est exécutée automatiquement. Le contrôleur vérifie l’utilisateur actif, la scène, le type de carte et les champs : une création joueur doit être une note libre, tandis que l’éditeur de carte reste limité à `titleOverride` et `tags`. Les déplacements, redimensionnements, duplications, changements d’ordre et styles de ficelles autorisés passent par le même canal. Toutes les mutations finales utilisent les documents Foundry et sont donc rediffusées à tous.

Toutes les opérations reçues par l’autorité — joueurs et MJ compris — passent par une file unique et sont traitées dans leur ordre d’arrivée. Les éditeurs joueur transmettent seulement les champs réellement changés : des modifications simultanées du titre et du tag, ou de deux propriétés différentes d’une ficelle, se fusionnent. Si deux utilisateurs modifient la même propriété à partir d’une ancienne version, la seconde écriture est refusée avec un message clair ; il suffit de rouvrir l’éditeur. Aucun changement récent n’est ainsi écrasé silencieusement.

Limite de sécurité : le canal socket brut d’un module ne fournit pas au callback l’identité authentifiée de l’émetteur. Le module revalide l’identifiant déclaré contre les utilisateurs actifs, mais un client volontairement malveillant pourrait tenter de l’usurper. De plus, les flags de scènes et journaux peuvent exposer des UUID techniques aux clients autorisés à recevoir ces documents. Sur le panneau, les cases **Afficher le nom** et **Afficher l’image** constituent un partage explicite de ces deux informations ; la fiche source demeure protégée par ses permissions Foundry. L’anonymisation continue de s’appliquer au graphe.

## Réglages

Les réglages monde couvrent :

- échelle et taille minimale des cartes ;
- texture de parchemin, image de fanion, sens de lecture des notes, image de sceau, cachet Mort et silhouette via le FilePicker ;
- couleur WFRP parmi neuf teintes et épaisseur des ficelles ;
- confirmation de suppression ;
- taille des personnages, style des factions et relations ;
- sauvegarde automatique et délai de debounce ;
- anonymisation et logs de diagnostic.

Au premier chargement par un MJ, le module crée quatre dossiers persistants dans les données Foundry : `assets/medieval-investigation-toolkit/pins` pour les sceaux, `assets/medieval-investigation-toolkit/parchments` pour les fonds/références, `assets/medieval-investigation-toolkit/notes` pour les languettes et fanions et `assets/medieval-investigation-toolkit/tags` pour les cachets de tags. Le menu **Configurer les images** ouvre directement ces dossiers pour choisir l’image globale de chaque type. La texture de parchemin ou de fanion sélectionnée est étirée aux dimensions exactes de la carte et constitue son unique surface opaque ; aucun beige, cadre ou ombre n’est superposé.

## API

```javascript
const api = game.modules.get("medieval-investigation-toolkit").api;

await api.setBoardEnabled(canvas.scene, true);
await api.createCard({ cardType: "free", titleOverride: "Témoin rouge" }, { x: 800, y: 500 });
await api.createConnection("drawingA", "drawingB", { color: "#7b1010", width: 4 });
await api.deleteConnection("connectionId");
await api.openRelationGraph();
const graph = await api.getActiveGraph();
```

## Stockage et migrations

- cartes : flags versionnés de `DrawingDocument` ;
- panneau et ficelles : un flag versionné de `Scene` ;
- graphe : un flag versionné de `JournalEntryPage` ;
- migrations : cartes v0/v1 vers v2, nettoyage des références structurelles cassées ;
- concurrence du graphe : compteur de révision et refus d’un enregistrement obsolète.

## Limites connues

- Le polygone de faction du MVP est une forme fermée redimensionnable prédéfinie ; l’édition sommet par sommet n’est pas encore fournie.
- Les portraits d’Acteur conservent leur ratio ; les parchemins et images de fond Document sont volontairement déformés pour épouser exactement les dimensions de la carte.
- Il existe un graphe principal par monde ; le modèle conserve un identifiant pour une évolution vers plusieurs graphes.
- Aucune fonction audio, vidéo, géographique, chronologique, généalogique ou de simulation de forces n’est incluse.
- La validation visuelle complète v14 reste à exécuter sur une installation v14 réelle.

## Références et licence

Le panneau reprend et adapte l’architecture de Drawing d’Investigation Board 4.10.1, sous licence MIT. L’attribution et le texte de licence amont sont conservés dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Foundry Graph a été étudié sous AGPL-3.0 uniquement au niveau architectural ; aucun code ni asset n’en est repris. Ce projet est distribué sous licence MIT, voir [LICENSE](LICENSE).

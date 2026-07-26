# Changelog

## 1.5.2 — 2026-07-26

- Les joueurs disposent désormais du même flux de gestion des ficelles que le MJ : création par **Maj + glisser** ou par l’outil **Connexions**, sélection, modification et suppression par menu contextuel ou touche Suppr.
- La création et la suppression joueur sont validées puis exécutées automatiquement par le client MJ actif, dans la même file d’autorité que les autres opérations partagées.
- L’action de duplication des cartes est retirée pour tous les utilisateurs, ainsi que son opération socket interne.

## 1.5.1 — 2026-07-26

- Les joueurs peuvent désormais déplacer et redimensionner les cartes du panneau d’enquête ; la transformation est appliquée automatiquement par le client MJ actif puis synchronisée à tous.
- Le menu contextuel joueur propose maintenant la modification, la duplication et les changements d’ordre, tandis que l’ouverture de la source liée et la suppression restent réservées au MJ.
- Le bouton **Créer une note** est visible pour les joueurs dès que le panneau d’enquête de la scène est activé.
- Les requêtes joueur restent validées côté autorité : seule une carte de type Note libre peut être créée, sans aucune confirmation manuelle du MJ.

## 1.5.0 — 2026-07-26

- Refonte du graphe de relations : nœuds réduits aux portraits, libellés au survol, fond parchemin, liens directionnels par Maj + glisser, relations mutuelles et séparation des liens opposés.
- Ajout de nœuds libres, de l’anonymisation du nom ou de l’apparence, du marqueur Mort, des relations personnalisées persistantes et de leur suppression contrôlée.
- Ajout du catalogue de relations WFRP colorées, trié alphabétiquement, dont **Est membre de** et **A tué**.
- Les joueurs voient les portraits et noms publiés, peuvent supprimer les nœuds autorisés et paramétrer les liens sans validation manuelle du MJ.
- Les cartes Document peuvent être créées depuis les objets des inventaires, le répertoire d’objets et les images des journaux.
- Le tag **Mort** du panneau d’enquête superpose désormais l’icône `defeated` de WFRP4e au portrait des cartes Acteur.
- Refonte de la fenêtre **Configurer les images** avec aperçus uniformes, champs lisibles et disposition adaptative.
- Ajout d’un réglage d’opacité partagé pour le marqueur Mort du panneau d’enquête et du graphe.

## 1.4.1 — 2026-07-22

- Clarification et garantie du flux joueur : aucune validation manuelle du MJ n’est demandée. Le premier client MJ actif agit uniquement comme autorité technique et applique automatiquement les opérations déjà autorisées.
- Les actions locales du MJ et toutes les requêtes joueur partagent désormais une file d’exécution unique, résistante aux erreurs, qui garantit un ordre déterministe et empêche deux écritures simultanées sur les flags Foundry.
- Les éditeurs joueur envoient uniquement les champs réellement modifiés accompagnés de leur valeur d’origine. Deux modifications sur des champs distincts fusionnent donc sans perte.
- Si deux utilisateurs modifient le même champ d’une carte ou d’une ficelle depuis des éditeurs devenus obsolètes, la seconde écriture est refusée avec un message de conflit au lieu d’écraser silencieusement la première.

## 1.4.0 — 2026-07-22

- Ajout d’un système de tags extensible sur les cartes, avec le premier tag **Mort** représenté par un cachet de cire noir.
- Le cachet Mort occupe automatiquement la zone inférieure disponible sans sortir de la carte ni recouvrir le portrait, le titre ou le texte vertical d’une Note.
- Ajout d’un cachet noir SVG fourni par défaut, d’un réglage d’asset **Cachet du tag Mort** et du dossier persistant `assets/medieval-investigation-toolkit/tags`.
- L’éditeur MJ conserve tous les champs et permet de cocher le tag Mort. L’éditeur joueur ne montre que **Titre local** et **Mort** ; leurs modifications passent par le MJ actif et sont diffusées à tous.
- Les joueurs peuvent double-cliquer une ficelle existante et modifier sa couleur, son épaisseur et son affaissement.
- Nouvelle politique stricte : le MJ conserve toutes les fonctions ; les joueurs ne peuvent plus créer, déplacer, dupliquer ou supprimer des cartes, créer ou supprimer des ficelles, ni modifier le graphe.
- Le contrôleur d’autorité limite aussi les requêtes joueur fabriquées aux seuls champs `titleOverride` et `tags`, ou au style d’une ficelle existante.
- Schéma des cartes porté en version 2 pour enregistrer la liste extensible de tags.

## 1.3.3 — 2026-07-22

- Cocher **Afficher le nom** ou **Afficher l’image** publie désormais réellement cet élément sur la carte pour les joueurs, même s’ils ne peuvent pas ouvrir le document Foundry source. La permission de la fiche source reste inchangée.
- Les cartes Acteur et Document ne possèdent plus de champ descriptif et ne rendent plus de texte libre ; cette fonction est réservée au fanion Note.
- Les couleurs des ficelles sont limitées à une palette WFRP de neuf teintes : rouge, bleu, jaune, vert, pourpre, noir, blanc, gris et orange. Le choix utilise désormais des pastilles nommées plutôt qu’un sélecteur RGB libre.
- La même palette est validée lors de l’enregistrement et proposée pour la couleur par défaut ; toute ancienne teinte hors palette est ramenée au rouge de base.

## 1.3.2 — 2026-07-22

- Le contenu visuel des cartes est désormais attaché à la vraie surface `Drawing.shape` rendue par Foundry, afin que les joueurs voient les cartes même lorsque l’outil Dessins n’est pas actif.
- Carte, pin et ficelles partagent maintenant la même règle de visibilité : masquer une carte la masque entièrement aux joueurs tout en conservant l’aperçu MJ.
- La couche globale des pins accepte correctement les `DrawingDocument` fournis par le contrôleur ; elle lit à nouveau les dimensions et l’état caché réels de chaque carte.

## 1.3.1 — 2026-07-21

- Le texte des notes utilise désormais Almendra SC en noir, avec la police TTF intégrée localement au module et couverte par la SIL Open Font License 1.1.
- La taille visuelle et la zone interactive des pins de toutes les cartes sont augmentées de 30 % par rapport à la version 1.3.0.

## 1.3.0 — 2026-07-21

- La carte Libre devient une note verticale spécialisée, créée immédiatement par le bouton **Créer une note**, sans formulaire préalable.
- La note utilise une languette/fanion personnalisable depuis les paramètres d’images ; sans fichier choisi, un rectangle textile vertical bordeaux est rendu.
- Le libellé est limité à un ou deux mots et pivote de 90° pour se lire du haut vers le bas. Un réglage monde choisit une lecture inclinée vers la droite, par défaut, ou vers la gauche.
- Le texte et sa taille se réadaptent pendant le redimensionnement de la note ; le fond personnalisé est étiré aux dimensions exactes.
- Le double-clic ouvre un éditeur minimal à champ unique. La touche Entrée valide et ferme directement la fenêtre.
- Les notes conservent le pin, le déplacement, le redimensionnement, la duplication, l’ordre, les ficelles et la suppression, mais n’affichent plus les commandes de document sans objet.
- Création du dossier persistant `assets/medieval-investigation-toolkit/notes` pour les images de fanion.

## 1.2.5 — 2026-07-21

- À la création d’une carte Document, sa hauteur initiale est calculée d’après le ratio naturel de l’image de référence choisie ; la taille minimale reste respectée.
- Choisir une nouvelle image sur une carte Document existante adapte également son format en conservant son centre. Le redimensionnement manuel demeure libre ensuite.
- Le double-clic ouvre exclusivement l’éditeur du module et bloque l’ouverture concurrente de la configuration native du Drawing.
- L’éditeur Document a été allégé : suppression du sélecteur de type désactivé et du second bouton d’image redondant placé près de l’UUID.
- La remise à zéro ou la saisie manuelle du chemin actualise désormais correctement l’aperçu.

## 1.2.4 — 2026-07-21

- Le parchemin d’une carte Acteur est maintenant sa surface opaque réelle : aucune bordure, ombre ou forme native n’est ajoutée derrière.
- Les fonds de carte sont étirés exactement à la largeur et à la hauteur du Drawing pendant le redimensionnement, sans conservation de ratio.
- Une carte Document utilise l’image de référence explicitement choisie comme fond complet et dessine son titre et son texte par-dessus ; sans image choisie, elle reprend le parchemin générique.
- Un clic ordinaire sur un sceau n’amorce plus de ficelle. Le mode à deux clics doit être activé par l’outil Connexions ; Maj + glisser reste le geste direct.
- La sélection des ficelles utilise désormais la géométrie de leur courbe au niveau du canvas, indépendamment de l’outil Foundry actif. Le gestionnaire reste actif après la création d’un lien et est libéré uniquement à la fermeture du canvas.

## 1.2.3 — 2026-07-21

- Les images utilisent désormais un ajustement proportionnel `contain` : elles sont réduites et centrées sans aucune découpe.
- Les positions temporaires des clones de déplacement Foundry alimentent le rendu des sceaux et des ficelles à chaque image ; les liens suivent donc les cartes avant le relâchement.
- Zone interactive des ficelles élargie et sélection dès l’appui du pointeur.
- La touche Suppr intercepte prioritairement la suppression lorsqu’une ficelle est sélectionnée.
- Taille visuelle et zone d’interaction des sceaux multipliées par 1,2.

## 1.2.2 — 2026-07-21

- Correction de la conversion des couleurs CSS vers PIXI 7 : les ficelles enregistrées sont de nouveau visibles sous Foundry v13.
- Ficelles placées au-dessus des Drawings et sous les sceaux, comme dans Investigation Board.
- Clic sur une ficelle pour la sélectionner, touche Suppr ou menu contextuel pour l’effacer, double-clic pour modifier sa couleur, son épaisseur et son affaissement.
- L’image de parchemin sélectionnée devient le fond opaque réel de la carte ; le beige n’est utilisé qu’en secours si le fichier ne peut pas être chargé.
- Titre ajusté automatiquement en taille et tronqué proprement si nécessaire pour ne jamais déborder.
- Nouvelle pile de polices médiévales lisibles pour les titres et descriptions, avec contour léger afin de rester lisible sur les fonds personnalisés.

## 1.2.1 — 2026-07-21

- Correction du redimensionnement sous Foundry v13 : le rendu réagit désormais aux `renderFlags` utilisés pendant le glissement de la poignée.
- Recalcul dynamique du parchemin, du cadre d’image, du recadrage, du texte et de la position du sceau à chaque nouvelle taille.
- Taille minimale appliquée pendant le redimensionnement et lors de sa persistance.
- Sceaux déplacés dans un conteneur interactif global au-dessus des Drawings, suivant l’architecture d’Investigation Board.
- Le geste Maj + glisser n’active plus la sélection ou le déplacement natif du Drawing et reste utilisable hors des outils Dessins.
- Cartes maintenues interactives lorsque le panneau est actif, quel que soit le contrôle de scène sélectionné.

## 1.2.0

- Correction des boutons Acteur, Document et Libre dans les contrôles Dessins de Foundry v13.
- Correction du `FilePicker` v13 : l’éditeur de carte et les paramètres d’assets ouvrent désormais le navigateur de fichiers.
- Ajout de Maj + glisser d’un sceau vers un autre avec aperçu de la ficelle en temps réel et nettoyage immédiat des événements de glissement.
- Conservation de la création de ficelle par deux clics, avec une aide visible depuis le bouton Connexions.
- Éditeur de carte fiabilisé au double-clic, avec modification du texte, du titre, de l’image et aperçu de l’image choisie.
- Création automatique des dossiers persistants `assets/medieval-investigation-toolkit/pins` et `assets/medieval-investigation-toolkit/parchments`, directement proposés dans les paramètres du module.

## 1.1.0

- Refonte complète du moteur du panneau sur le modèle de `Investigation Board` 4.10.1 (MIT).
- Les cartes sont désormais rendues par une sous-classe de `Drawing`, sans renderer parallèle greffé au calque.
- Mise en cache du rendu : déplacer une carte ne recharge plus son portrait, son parchemin ni son UUID.
- Nouveau gestionnaire léger des ficelles, avec aperçu depuis le sceau, sélection, édition et suppression.
- Annulation propre du mode connexion en quittant les outils Dessins ; aucun état global ne bloque les autres interfaces.
- Résolution renforcée des Actors, Items, Scenes, journaux, tables, macros, cartes et compendiums dans les menus contextuels Foundry v13.
- Conservation du graphe de relations dans les contrôles Notes.
- Ajout de l’attribution MIT amont dans `THIRD_PARTY_NOTICES.md`.

## 1.0.2 — 2026-07-20

- Correction du crash de rendu des cartes : compatibilité explicite avec PIXI 7.4 utilisé par Foundry VTT 13.351.
- Suppression des doubles réinitialisations du panneau et rafraîchissement ciblé lors des changements de connexions.
- Reconstruction correcte des contrôles de scène après activation du panneau.
- Déplacement du bouton du graphe de relations dans les contrôles Notes.

## 1.0.1 — 2026-07-20

- Correction de la création des cartes sur Foundry VTT 13.351 : le support `Drawing` respecte désormais la validation de contenu visible.
- Ajout de l’action contextuelle « Ajouter au panneau d’enquête » pour les Actors, Items, journaux, tables, macros, paquets de cartes et pages de journal.
- Ajout du même raccourci au HUD des tokens et activation automatique du panneau pour le MJ.
- Rafraîchissement immédiat du rendu lors de l’activation du panneau depuis la configuration de scène.

Toutes les modifications notables sont documentées ici.

## 1.0.0 — 2026-07-20

- Première version du panneau d’enquête sur `DrawingDocument`.
- Cartes Acteur, Document et Libre avec surcharges et masquage.
- Sceaux de cire, ficelles courbes, sélection, édition et nettoyage.
- Autorité MJ déterministe et permissions monde.
- Graphe SVG manuel persistant dans une `JournalEntryPage`.
- Personnages Actor, factions fermées, appartenances multiples et relations qualifiées.
- Zoom, panoramique, ajustement, annuler/rétablir, import/export JSON et sauvegarde avec révision.
- Migrations v1, traductions française et anglaise, assets SVG originaux.
- Tests unitaires, contrôle de projet et packaging ZIP.

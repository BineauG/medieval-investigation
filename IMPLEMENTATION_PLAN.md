# Plan d’implémentation

## Contexte vérifié

- Le dépôt de destination était vide : l’identifiant retenu est `medieval-investigation-toolkit`.
- Investigation Board 4.10.1 est installé localement sous licence MIT. Sa sous-classe de `Drawing`, son cycle de rafraîchissement et sa séparation cartes/ficelles servent de référence directe à la refonte v1.1.0, avec attribution conservée dans `THIRD_PARTY_NOTICES.md`.
- Foundry Graph est installé localement sous AGPL-3.0. Aucun code ni asset n’en est repris. Le présent module réimplémente indépendamment un seul graphe de relations, sans D3 ni dépendance externe.
- Les documentations publiques Foundry v13.350 et v14.365 confirment `ApplicationV2`, `HandlebarsApplicationMixin`, les contrôles de scène sous forme de registre, les documents embarqués et les flags de documents.

## Architecture

1. **Socle** — constantes, réglages, journalisation, API publique, compatibilité v13/v14, permissions et sockets avec autorité MJ déterministe.
2. **Panneau** — chaque carte est le `Drawing` Foundry lui-même via une sous-classe composable ; son rendu PIXI est mémorisé et n’est reconstruit que si le contenu ou la taille change. Les ficelles occupent un conteneur léger distinct et restent persistées dans un flag unique de scène. Les éditeurs utilisent `ApplicationV2` et les documents restent glissables depuis Foundry.
3. **Graphe** — modèle pur validé/migré, stockage atomique dans une `JournalEntryPage` dédiée, application `ApplicationV2`, rendu SVG manuel, factions fermées, appartenances explicites, relations qualifiées, zoom/panoramique, import/export.
4. **Synchronisation** — les joueurs soumettent uniquement le titre/tag d’une carte ou le style d’une ficelle au MJ actif dont l’identifiant est le premier dans l’ordre lexical, sans validation manuelle. Actions MJ et requêtes joueur sont sérialisées dans une file unique ; des deltas optimistes par champ fusionnent les éditions indépendantes et refusent les écrasements obsolètes. Le contrôleur filtre à nouveau les champs et les documents Foundry assurent la diffusion finale.
5. **Qualité** — traductions FR/EN, styles et SVG originaux, tests unitaires Node pour les modèles purs, matrice de tests manuels et ZIP installable.

## Compatibilité

- Les accès variant entre versions (contrôles, boîtes de dialogue, FilePicker, coordonnées de dessins et conteneur PIXI de couche) sont isolés dans `scripts/compatibility/foundry-version.js`.
- Aucune propriété `actor.system` n’est utilisée.
- Les APIs natives de documents et `fromUuid` sont privilégiées.
- Le manifeste déclare Foundry 13 minimum et 14 vérifié, sans maximum.

## Limite de validation locale

Les tests unitaires, syntaxiques et de packaging sont exécutables dans ce dépôt. La validation visuelle et multijoueur réelle reste à effectuer dans une instance Foundry v13/v14 selon `TESTING.md` ; elle ne sera pas déclarée réussie sans exécution.

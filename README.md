# invent97
<<<<<<< HEAD

Application locale de gestion d'inventaire informatique pour une PME.

## Prise en main

```bash
npm install
npm run build:css
npm start
```

L'application est accessible sur `http://localhost:3000`.

- Identifiants administrateur initiaux : `admin` / `admin123`
- Modifiez le mot de passe après la première connexion.

## Fonctionnalités

- Authentification par session et zone d'administration protégée
- Gestion complète des équipements (ajout, modification, suppression)
- Catalogue des types de matériel (ajout, modification, suppression)
- Historique des événements par équipement (attribution, état, documents, etc.)
- Répertoire des employés avec coordonnées, poste et notes
- Recherche plein texte et filtre par état
- Résumé des statistiques du parc
- Téléversement des factures (PDF ou images)
- Export CSV de l'inventaire (`/export`)
- Sauvegarde de la base SQLite : `npm run backup` (fichier créé dans `db/backups/`)

## Développement

- Tailwind CSS : `npm run build:css`
- Base SQLite : `db/invent97.db`

Les fichiers téléchargés sont stockés dans `public/uploads/`.

> ℹ️ Ajoutez d'abord vos employés via l'onglet **Employés** et vos catégories via l'onglet **Types de matériel**, puis assignez-les aux équipements depuis le formulaire dédié. Documentez ensuite chaque matériel via l'onglet **Historique** accessible depuis la liste.
=======
Logiciel inventaire
>>>>>>> 47b17d8109dd9b299455c551e21e6407c1a1f6e0

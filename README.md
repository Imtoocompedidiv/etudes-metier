# Études métier

Des applications indépendantes pour examiner un geste de travail précis : comparer deux versions, préparer un fichier, contrôler des exceptions ou simuler un planning.

Chaque étude dispose de son lien direct et de données fictives. Les actions modifient réellement le scénario ; les exports reflètent son état courant. Aucun compte ni service distant n’est nécessaire au traitement. Les noms d’entreprises servent de contexte aux études et ne désignent ni des clients ni des commanditaires.

## Développement

```sh
npm ci
npm run dev
npm test
npm run build
```

Ouvrir `/etudes-metier/?etude=<nom>` pendant le développement. La compilation produit également une route statique `/etudes-metier/<nom>/` pour chaque étude.

Les interfaces sont chargées séparément avec React et Vite. Chaque module conserve ses règles métier et leurs tests. Les utilitaires communs traitent les imports délimités, les exports, l’historique et les messages d’erreur. Les formats acceptés et les limites sont précisés dans chaque interface.

Les contrôles présents sont des outils de préparation. Ils ne remplacent pas la validation des données, des règles métier et des intégrations dans un environnement de production.

Conception et développement par JD.

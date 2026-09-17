# Reprise d’un flux de commandes

Atelier indépendant pour DATAFREAK. Une cible fictive est préchargée ; les nouveaux passages sont enregistrés séparément. Tous les traitements ont lieu dans le navigateur, sans API ni sauvegarde automatique.

Le modèle conserve un registre d’événements appliqués, scoped par source. L’empreinte porte sur le contenu canonique, les dépendances et la commande. Un même événement n’ajoute pas de nouvel effet ; un contenu divergent bloque son traitement. Le registre reconstruit la cible et valide les transitions. Les références inconnues, prérequis absents, cycles et interruptions de test restent distincts.

L’import d’un nouveau lot conserve le registre ; la restauration d’un dossier vérifie aussi que son dernier cas de recette reproduit l’état courant. Les décisions de mise à l’écart et les correspondances ne modifient pas les messages source. Les exports contiennent le dossier, le journal, la cible, le rapport HTML et un cas de recette avec entrée et attendu réellement exécutés.

```sh
node --test src/demos/datafreak/model.test.js
```

Les JSON de lot suivent `datafreak-lot-v1`, les dossiers `datafreak-reprise-v1`. L’exemple téléchargeable expose les champs et les contraintes. Le journal garde les vingt derniers passages ; le registre appliqué est conservé intégralement dans la limite de 2 000 événements.

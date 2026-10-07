# toairport.fr

Site statique (HTML/CSS/JS sans build) de réservation de taxi entre Paris et les aéroports CDG et Orly, hébergé sur Netlify. Chaque `push` sur `main` déploie le site.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Accueil |
| `tarifs/` | Forfaits officiels CDG et Orly. Page la plus visible dans Google : elle doit pointer vers toutes les pages trajet. |
| `taxi-paris-cdg/`, `taxi-cdg-paris/`, `taxi-paris-orly/`, `taxi-orly-paris/` | Pages trajet par sens |
| `taxi-montparnasse-orly/` | Page gare (voir « Ajouter une page gare ») |
| `vtc-paris-cdg/`, `reservation/`, `mentions-legales/` | Autres pages |
| `assets/style.css`, `assets/main.js` | Styles et comportements communs (menu, FAQ, apparition au défilement, envoi du formulaire) |
| `netlify/functions/reservation.js` | Envoi des emails de réservation (opérateur et client) via SMTP OVH |
| `sitemap.xml`, `robots.txt` | Référencement |

Variables d'environnement Netlify de la fonction : `OVH_SMTP_HOST`, `OVH_SMTP_PORT`, `OVH_EMAIL_USER`, `OVH_EMAIL_PASS`.

## Tarifs de référence

Arrêté du 24 décembre 2025 relatif aux tarifs des courses de taxi pour 2026 ([Légifrance](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053228231)).

| Forfait | Rive droite | Rive gauche |
|---|---|---|
| CDG ↔ Paris | 56 € | 65 € |
| Orly ↔ Paris | 45 € | 36 € |

- Rive droite : arrondissements 1 à 4, 8 à 12, 16 à 20. Rive gauche : 5 à 7, 13 à 15.
- Suppléments autorisés : réservation immédiate 4 €, réservation à l'avance 7 €, 5,50 € par passager à partir du 5e. Bagages et péages inclus, même prix de jour comme de nuit.
- La prise en charge (4,48 € au plus) concerne les courses au compteur, pas les forfaits.
- Les forfaits ne s'appliquent qu'aux adresses dans Paris.

Les montants, l'année et la date de l'arrêté apparaissent sur toutes les pages (title, meta, JSON-LD, contenu, pied de page). À chaque nouvel arrêté annuel, tout mettre à jour d'un coup : `grep -rn "2026\|24 décembre 2025" --include=index.html .`

## Blocs de contenu des pages trajet

Classes définies en fin de `assets/style.css`, à utiliser plutôt que des styles en ligne (elles passent en une colonne sous 1024 px) :

- `.info-grid` : deux colonnes de blocs ; `.info-title`, `.info-text`, `.info-note` à l'intérieur.
- `.price-list` : liste libellé / montant. `<strong>` en doré pour un prix, `<strong class="plain">` pour une durée ou une info.
- `.see-also` : rangée de liens `.btn-ghost` sous une section.

Chaque FAQ existe deux fois : en HTML (`.faq-item`) et dans le JSON-LD `FAQPage` du `<head>`. Les deux doivent rester identiques (le JSON-LD est en texte brut, sans liens).

## Ajouter une page gare

Modèle : `taxi-montparnasse-orly/index.html`. Une page par gare et par aéroport, URL `taxi-<gare>-<aeroport>/`.

1. Copier le dossier modèle, adapter title, meta, canonical, JSON-LD (TaxiService, BreadcrumbList, FAQPage), contenu et formulaire (champ `trajet` en liste à deux sens, adresse préremplie).
2. Prix selon la rive de la gare (voir tableau ci-dessus).
3. Ajouter la page à `sitemap.xml` avec un `<lastmod>`.
4. Ajouter le lien dans la colonne « Trajets » du pied de page de toutes les pages, dans la liste des gares des pages trajet concernées et dans `.see-also` de `tarifs/`.
5. Après déploiement, demander l'indexation de l'URL dans Search Console (Inspection d'URL).

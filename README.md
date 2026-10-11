# toairport.fr

Site statique (HTML/CSS/JS sans build) de réservation de taxi entre Paris et les aéroports CDG et Orly, hébergé sur Netlify. Chaque `push` sur `main` déploie le site.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Accueil |
| `tarifs/` | Forfaits officiels CDG et Orly. Page la plus visible dans Google : elle doit pointer vers toutes les pages trajet. |
| `taxi-paris-cdg/`, `taxi-cdg-paris/`, `taxi-paris-orly/`, `taxi-orly-paris/` | Pages trajet par sens |
| `taxi-montparnasse-orly/`, `taxi-austerlitz-orly/`, `taxi-gare-de-lyon-orly/` | Pages gare (voir « Ajouter une page gare ») |
| `taxi-orly-cdg/` | Transfert entre aéroports : pas de forfait, course au compteur |
| `vtc-paris-cdg/`, `reservation/`, `mentions-legales/` | Autres pages |
| `en/paris-airport-taxi-fares/`, `en/orly-airport-taxi/`, `en/cdg-airport-taxi/` | Version anglaise (voir « Version anglaise ») |
| `assets/style.css`, `assets/main.js` | Styles et comportements communs (menu, FAQ, apparition au défilement, envoi du formulaire) |
| `netlify/functions/reservation.js` | Envoi des emails de réservation (opérateur et client) via SMTP OVH |
| `sitemap.xml`, `robots.txt` | Référencement |

Variables d'environnement Netlify de la fonction : `OVH_SMTP_HOST`, `OVH_SMTP_PORT`, `OVH_EMAIL_USER`, `OVH_EMAIL_PASS`, `RECIPIENT_EMAIL` (boîte qui reçoit les demandes).

## Suivi des réservations

Chaque demande reçoit une référence `TA-AAMMJJ-XXXX`, reprise dans l'objet des deux emails. L'email opérateur a pour objet `[Réservation TA-...]` et se termine par un bloc « Suivi » : page d'origine du formulaire (`page`, envoyée par `assets/main.js`) et langue (`lang`, lue sur `<html lang>`). Compter les réservations du mois = compter les emails `[Réservation` reçus ; la page d'origine dit quelles pages convertissent.

Le client reçoit l'email en anglais si le formulaire est sur une page `lang="en"`, en français sinon.

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

## Version anglaise

Trois pages sous `en/`, chacune appariée à une page française par `hreflang` (fr, en, x-default vers le français), déclaré des deux côtés :

| Anglais | Français |
|---|---|
| `/en/paris-airport-taxi-fares/` | `/tarifs/` |
| `/en/orly-airport-taxi/` (les deux sens) | `/taxi-orly-paris/` |
| `/en/cdg-airport-taxi/` (les deux sens) | `/taxi-cdg-paris/` |

Toutes les pages françaises ont un lien « English » dans le menu, vers la page anglaise la plus proche. Les pages anglaises ont `<html lang="en">` : le formulaire y affiche ses messages en anglais et le client reçoit l'email de confirmation en anglais. Toute modification de tarif ou de FAQ sur une page appariée se reporte sur sa jumelle. Ajouter une page anglaise = l'ajouter au tableau, aux balises `hreflang` des deux pages, au menu et au pied de page anglais, et au sitemap.

## Ajouter une page gare

Modèle : `taxi-montparnasse-orly/index.html`. Une page par gare et par aéroport, URL `taxi-<gare>-<aeroport>/`. Chaque page doit dire quelque chose de propre à sa gare (accès, alternatives réelles en transports, comparaison avec la gare voisine) : des pages quasi identiques sont traitées comme des pages satellites par Google et pénalisent tout le site. Ne créer une page que si Search Console montre de la demande sur la gare.

1. Copier le dossier modèle, adapter title, meta, canonical, JSON-LD (TaxiService, BreadcrumbList, FAQPage), contenu et formulaire (champ `trajet` en liste à deux sens, adresse préremplie).
2. Prix selon la rive de la gare (voir tableau ci-dessus).
3. Ajouter la page à `sitemap.xml` avec un `<lastmod>`.
4. Ajouter le lien dans la colonne « Trajets » du pied de page de toutes les pages, dans la liste des gares des pages trajet concernées et dans `.see-also` de `tarifs/`.
5. Après déploiement, demander l'indexation de l'URL dans Search Console (Inspection d'URL).

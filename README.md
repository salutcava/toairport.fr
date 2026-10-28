# toairport.fr

Site statique (HTML/CSS/JS sans build) de réservation de taxi entre Paris et les aéroports CDG et Orly, servi par un petit serveur Node sur le VPS OVH (Coolify). Chaque `push` sur `main` déploie le site (voir « Hébergement »).

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Accueil |
| `tarifs/` | Forfaits officiels CDG et Orly. Page la plus visible dans Google : elle doit pointer vers toutes les pages trajet. |
| `taxi-paris-cdg/`, `taxi-cdg-paris/`, `taxi-paris-orly/`, `taxi-orly-paris/` | Pages trajet par sens |
| `taxi-montparnasse-orly/`, `taxi-austerlitz-orly/`, `taxi-gare-de-lyon-orly/` | Pages gare (voir « Ajouter une page gare ») |
| `taxi-orly-cdg/` | Transfert entre aéroports : pas de forfait, course au compteur |
| `taxi-ou-uber-aeroport/`, `taxi-ou-ligne-14-orly/`, `taxi-ou-rer-b-cdg/` | Pages comparatives (voir « Pages comparatives ») |
| `vtc-paris-cdg/`, `reservation/`, `mentions-legales/` | Autres pages |

Éditeur du site : LAMSTER, EURL au capital de 1 €, SIRET 944 775 337 00016, 60 rue François Ier, 75008 Paris, gérant Olivier Lam (vérifié sur l'Annuaire des Entreprises le 28 octobre 2026). Ces informations sont dans `mentions-legales/`, avec les sous-traitants qui reçoivent les données du formulaire (OVH, Meta pour l'alerte WhatsApp) : un nouveau sous-traitant s'y ajoute.
| `en/paris-airport-taxi-fares/`, `en/orly-airport-taxi/`, `en/cdg-airport-taxi/` | Version anglaise (voir « Version anglaise ») |
| `assets/style.css`, `assets/main.js` | Styles et comportements communs (menu, FAQ, apparition au défilement, envoi du formulaire) |
| `assets/anim.js`, `assets/vendor/gsap/` | Mouvement (voir « Images et mouvement ») |
| `assets/images/`, `scripts/` | Images d'ambiance et leur génération (voir « Images et mouvement ») |
| `assets/logo/`, `favicon.*`, `apple-touch-icon.png`, `assets/og-image.jpg` | Logo et ses déclinaisons, générés par `npm run logo` (voir « Logo ») |
| `assets/prix.js` | Calculateur de prix des formulaires et grille tarifaire `TARIFS` (voir « Calculateur de prix ») |
| `server/server.mjs` | Serveur de production : sert les pages, en-têtes de sécurité, redirections, `POST /api/reservation` |
| `server/reservation.mjs` | Traitement d'une demande : alerte WhatsApp puis emails (opérateur et client) via SMTP OVH |
| `server/whatsapp.mjs` | Alerte WhatsApp à l'opérateur (API Cloud de Meta) et calcul du délai avant prise en charge (voir « Alerte WhatsApp ») |
| `server/server.test.mjs` | Tests du serveur et de la réservation (`npm test`) |
| `Dockerfile` | Image construite par Coolify (Node 22, `npm ci --omit=dev`, fichiers internes retirés) |
| `sitemap.xml`, `robots.txt` | Référencement |
| `docs/` | Documents de travail SEO (fiche Google, partenaires). Jamais servis en ligne, comme `README.md`, `package.json`, `scripts/` et `server/` (absents de l'image et refusés par le serveur), mais visibles sur GitHub : le dépôt est public. |

Variables d'environnement de la ressource Coolify (modèle dans `.env.example`) : `OVH_SMTP_HOST`, `OVH_SMTP_PORT`, `OVH_EMAIL_USER`, `OVH_EMAIL_PASS`, `RECIPIENT_EMAIL` (boîte qui reçoit les demandes), et pour l'alerte WhatsApp `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_ALERTE_TO`.

## Contact WhatsApp

Bouton flottant `.wa-float` en bas à droite de toutes les pages, plus un lien « WhatsApp » dans la colonne Contact du pied de page : `https://wa.me/33761466823` avec un message prérempli (français, ou anglais sur les pages `en/`). Une nouvelle page doit reprendre le bloc `<a class="wa-float" …>` placé avant les scripts.

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

Les montants sont aussi dans le bloc `TARIFS` de `assets/prix.js`, qui calcule le prix affiché dans les formulaires. Les montants, l'année et la date de l'arrêté apparaissent sur toutes les pages (title, meta, JSON-LD, contenu, pied de page). À chaque nouvel arrêté annuel, tout mettre à jour d'un coup : `grep -rn "2026\|24 décembre 2025" --include=index.html .`

## Blocs de contenu des pages trajet

Classes définies en fin de `assets/style.css`, à utiliser plutôt que des styles en ligne (elles passent en une colonne sous 1024 px) :

- `.info-grid` : deux colonnes de blocs ; `.info-title`, `.info-text`, `.info-note` à l'intérieur.
- `.price-list` : liste libellé / montant. `<strong>` en doré pour un prix, `<strong class="plain">` pour une durée ou une info.
- `.see-also` : rangée de liens `.btn-ghost` sous une section.
- `.pp-block` : bloc « Prix par personne » en fin de section contenu des pages trajet (Paris ↔ CDG, Paris ↔ Orly, gares, pages anglaises CDG et Orly). Forfait + 7 € de réservation à l'avance, divisé par 1 à 4 voyageurs, face au ticket aéroports à 14 €. À recalculer à chaque nouvel arrêté ou nouveau prix du ticket.

Chaque FAQ existe deux fois : en HTML (`.faq-item`) et dans le JSON-LD `FAQPage` du `<head>`. Les deux doivent rester identiques (le JSON-LD est en texte brut, sans liens).

## Pages comparatives

Trois pages comparent le taxi au forfait aux autres façons d'aller à l'aéroport. Elles visent les requêtes que Google propose lui-même (« Uber ou taxi », « tarif ligne 14 Orly ») :

| Page | Compare | Données à tenir à jour |
|---|---|---|
| `taxi-ou-uber-aeroport/` | Taxi et Uber, CDG et Orly | Prix moyens Uber par catégorie, relevés sur les pages trajet d'Uber (`uber.com/global/fr/r/routes/paris-idf-fr-to-cdg/` et `…-to-ory/`) |
| `taxi-ou-ligne-14-orly/` | Taxi et métro 14 | Prix du ticket Paris Région - Aéroports, horaires du métro |
| `taxi-ou-rer-b-cdg/` | Taxi et RER B, avec la section `#perturbations` | Travaux, fermetures et grèves du RER B, RoissyBus, CDG Express |

Règles :

- **Chaque chiffre a sa source datée** dans la section « Sources » de la page, et la date de relevé figure dans le badge du hero et dans `dateModified` du JSON-LD `Article`. C'est une publicité comparative : elle doit rester objective et vérifiable (Code de la consommation, art. L122-1 et suivants). Pas de prix Uber inventé ni arrondi à l'avantage du taxi.
- **La page dit quand l'alternative est meilleure** (UberX moins cher en moyenne, métro imbattable seul) : c'est ce qui la rend crédible.
- **Section `#perturbations` de la page RER B** : à mettre à jour à chaque nouveau calendrier de travaux ou grève annoncée (sources : Bonjour RATP, maligneb.fr), avec la date dans le `section-label` et `dateModified`.
- **CDG Express** (gare de l'Est ↔ CDG, mise en service prévue le 28 mars 2027) : une page `taxi-ou-cdg-express/` est à créer en janvier ou février 2027, quand le prix du billet sera publié.

Composants (fin de `assets/style.css`) : `.verdict` (la réponse en une phrase), `.table-wrap` + `.compare-table` (colonne taxi en `.is-taxi`), `.pp-table` (prix par personne), `.price-bars` (barres de prix, largeur par `style="--v:<prix>"` sur l'échelle `--max` de la liste), `.hours-chart` (SVG des plages horaires sur 24 h, en deux versions : `.hours-chart--d` en 900 de large et `.hours-chart--m` en 360 de large pour les écrans de moins de 640 px), `.sources`.

Le pied de page des pages françaises a une colonne « Comparer » qui pointe vers les trois pages. Une nouvelle page comparative s'y ajoute, ainsi qu'au `.see-also` de `tarifs/` et au sitemap.

## Images et mouvement

**Images.** Générées sur fal.ai (`fal-ai/flux-pro/v1.1-ultra`) par `npm run images` (ou `npm run images -- nom1,nom2`), avec `FAL_KEY` dans `.env.local` (jamais commité). Script manuel, hors déploiement : les pages n'appellent jamais fal.ai. Un suffixe de style commun (nuit, noir profond, lumières dorées) garde les images cohérentes entre elles. Après génération : conversion WebP avec `cwebp` (commandes en tête de `scripts/generer-images.mjs`), versions `-m.webp` de 900 px pour le mobile, relecture de chaque image avant commit. Seuls les `.webp` se commitent : les `.jpg` et `.png` bruts sont ignorés par git.

toAirport est une plateforme de taxis indépendants, sans flotte : les images sont du décor (Paris la nuit, route d'aéroport, quai de Seine), jamais une fausse photo du service.

| Image | Usage |
|---|---|
| `paris-nuit(.webp, -m.webp)` | Fond des hero : accueil, tarifs, gares, réservation (`.hero-media--paris`) |
| `route-aeroport(.webp, -m.webp)` | Fond des hero des pages trajet et anglaises aéroport (`.hero-media--route`) |
| `quai-seine.webp` | Fond de la carte de la Seine, chargé à l'approche (`.is-near`) |
| `texture-grain.webp` | Grain carrelé sur toute la page (`body::before`, overlay), produit par `scripts/texture-carrelable.py` |

**Mouvement.** `assets/anim.js` charge GSAP 3.15 (cœur, ScrollTrigger, DrawSVG, hébergés dans `assets/vendor/gsap/`) **après l'événement `load`**, pour ne pas retarder la police du titre qui fait le LCP. Il anime la parallaxe des `.hero-media`, le tracé de la carte `.seine-map` au défilement (accueil, tarifs, tarifs anglais) et le compteur des `.tarif-price`. Rien ne bouge avec `prefers-reduced-motion`. Mesure Lighthouse mobile en local avant/après : accueil 100 -> 94-99, LCP 1,5 s -> 2,0-2,6 s.

## Logo

Le logo reprend le lumineux de taxi parisien : « toAirport.fr » en rouge, « PARIS » dessous, et les trois pastilles A, B, C (blanc, orange, bleu). On n'y écrit jamais « TAXI PARISIEN », qui est l'enseigne réglementée des taxis sous licence : toAirport est une plateforme de mise en relation.

Tout sort de `scripts/generer-logo.mjs`, lancé à la main par `npm run logo` (macOS : `sips` pour rastériser, `ffmpeg` pour les montages). Le texte est vectorisé avec opentype.js depuis les polices Barlow (OFL, dépendances de développement), donc les SVG ne chargent aucune police. Pour changer le logo, modifier le script, relancer, relire les images, commiter les sorties.

| Fichier | Usage |
|---|---|
| `assets/logo/lumineux.svg` | Logo complet, fond transparent : en-tête (52 px de haut) et pied de page (80 px) de toutes les pages, en `<img>` avec `alt="toAirport.fr"` |
| `assets/logo/lumineux-1200.png` | Logo complet en PNG, fond transparent (documents, réseaux, partenaires) |
| `assets/logo/lumineux-carre-1200.png` | Logo complet centré dans un carré 1200×1200, fond transparent (avatars, plateformes qui demandent un carré) |
| `assets/logo/icone.svg`, `icone-512.png` | Icône carrée « tA » dans le dôme |
| `assets/logo/icone-transparente-512.png` | Dôme « tA » seul, fond transparent |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Icônes du navigateur, déclarées dans le `<head>` de chaque page |
| `assets/logo/gmb-logo.png` | Logo de la fiche Google (720×720, le lumineux tient dans le rond que Google découpe) |
| `assets/logo/gmb-couverture.jpg` | Photo de couverture de la fiche Google (1080×608) |
| `assets/og-image.jpg` | Image de partage réseaux sociaux (1200×630), référencée par `og:image` |

Une nouvelle page reprend les trois balises d'icône du `<head>` et les deux `<img>` du logo d'une page existante.

## Calculateur de prix

`assets/prix.js` (chargé avant `main.js` sur toutes les pages avec formulaire) insère un encadré « Votre prix » sous le champ adresse de `#booking-form` :

1. Code postal lu dans l'adresse saisie, sinon trouvé par l'API Géoplateforme (`https://data.geopf.fr/geocodage/search`, gratuite, sans clé, suggestions d'adresses dans un `<datalist>`). L'ancienne `api-adresse.data.gouv.fr` est dépréciée.
2. Code postal 75001-75020 ou 75116 -> arrondissement -> rive -> forfait selon l'aéroport, déduit des champs `trajet` et `airport`. Hors Paris : « au compteur », sans montant.
3. Supplément de réservation : immédiate (4 €) si la prise en charge est à moins de `delaiImmediateMin` minutes, sinon à l'avance (7 €), plus 5,50 € par passager au-delà de 4. Le total est présenté comme un maximum.
4. Le détail du calcul part dans un champ caché `prix`, repris dans l'email opérateur (« Prix affiché »).

Désactivé par `data-calc="off"` sur le formulaire (pages VTC et Orly ↔ CDG, sans forfait). Textes en anglais sur les pages `lang="en"`.

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
5. Après déploiement, lancer `npm run check:live` puis demander l'indexation de l'URL dans Search Console (Inspection d'URL).

## Hébergement

Depuis le 27 octobre 2026, le site tourne sur le VPS OVH `141.94.205.4`, piloté par Coolify, comme les autres sites du VPS. Avant, il était sur Netlify : l'offre gratuite (300 crédits par mois, 15 par déploiement) a bloqué toutes les mises en ligne du 12 octobre au 2 novembre sans aucune erreur visible côté GitHub, d'où le départ.

- **Déploiement** : un push sur `main` déclenche le webhook GitHub, Coolify reconstruit l'image du `Dockerfile` et la remplace sans coupure (une vingtaine de secondes). Bouton « Redeploy » dans Coolify pour relancer à la main.
- **Domaines de la ressource Coolify** : `https://toairport.fr`, `https://www.toairport.fr` et `https://toairport.vps.olivierlam.fr` (adresse d'essai). Certificats Let's Encrypt gérés par Coolify, compression gzip activée dans la ressource.
- **DNS** (zone OVH `toairport.fr`) : `toairport.fr` et `www` en A vers `141.94.205.4`. MX et TXT (mail OVH, validations Search Console) ne dépendent pas de l'hébergement.
- **Serveur** (`server/server.mjs`, sans framework) : sert les dossiers du dépôt tels quels, redirige `/tarifs` vers `/tarifs/`, `…/index.html` vers son dossier (`/index.html` -> `/`) et `www` vers le domaine nu, pose les en-têtes de sécurité (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) et refuse les fichiers internes et les chemins commençant par un point. Le formulaire appelle `POST /api/reservation` (anciennement `/.netlify/functions/reservation`).
- **Domaine indexable** : seul `toairport.fr` est indexé. Toute autre adresse (l'adresse d'essai `toairport.vps.olivierlam.fr`) reçoit l'en-tête `X-Robots-Tag: noindex` sur chaque réponse, pour que Google ne la prenne pas pour un doublon du site. `localhost` et `127.0.0.1` en sont dispensés. Coolify pose aussi `X-Robots-Tag: noindex, nofollow` sur ses adresses `*.vps.olivierlam.fr` ; l'en-tête du serveur couvre toute autre adresse qui pointerait sur le conteneur.
- **http vers https** : redirection 302 faite par le middleware `redirect-to-https` que Coolify génère dans les étiquettes Traefik. La passer en 301 obligerait à gérer les étiquettes à la main (« Label management »), ce qui fige la configuration des domaines : laissé tel quel, Google suit la 302 et retient l'adresse https par le canonical.
- **Cache** : images, icônes, polices et `assets/vendor/` (GSAP) sont servis avec `Cache-Control: public, max-age=2592000` (30 jours). Une image régénérée sous le même nom peut donc rester l'ancienne jusqu'à 30 jours chez un visiteur déjà venu : changer son nom si la nouvelle doit se voir tout de suite. HTML, CSS et JS restent revalidés à chaque visite (`max-age=0`, ETag, réponse 304), leurs noms ne changeant pas d'un déploiement à l'autre.
- **En local** : `npm start` (port 3000, `PORT` pour en changer). Sans variables SMTP, le formulaire répond une erreur 500 à l'envoi.
- **Tests** : `npm test` (node:test, aucun envoi réel d'email). À lancer avant chaque push qui touche `server/`.

## Emails de réservation

`server/emails.mjs` fabrique les deux emails envoyés à chaque demande (`POST /api/reservation`), chacun en version texte et HTML :

- **Opérateur** (vers `RECIPIENT_EMAIL`) : objet `[Réservation TA-...] trajet - nom - date heure`, qui commence toujours par `[Réservation TA-...]` pour les filtres de messagerie. En titre, le trajet : celui du formulaire, ou « adresse → aéroport » quand le champ `trajet` ne nomme que la page (`Réservation`, `Accueil`, `Tarifs`). Sous le titre, la date et l'heure de **prise en charge**, libellées comme telles, avec le délai (« prise en charge dans 5 h 10 »). Lien Google Maps sur l'adresse, téléphone et email du client cliquables, détail complet du prix calculé. Pied : heure d'envoi de la demande, résultat de l'alerte WhatsApp, page d'origine et langue. `Reply-To` = email du client : « Répondre » lui écrit directement.
- **Client**, en français ou en anglais selon la page : récapitulatif, prix estimé (seulement le total, « 43 € au plus » ; la ligne disparaît si le calculateur n'a rien trouvé), boutons Appeler et WhatsApp.

**Course dans l'heure (URGENT).** Quand la prise en charge tombe dans 60 minutes ou moins (ou est déjà passée), calculé à l'heure de Paris : bandeau doré « URGENT, prise en charge dans 35 min » en tête de l'email opérateur, `URGENT - prise en charge dans 35 min` dans l'objet juste après `[Réservation TA-...]`, et l'email client dit que la course n'est pas encore confirmée, qu'on le rappelle, et quel numéro appeler sans rappel sous 10 minutes. Origine : le 28 octobre 2026, une demande pour une prise en charge 46 minutes plus tard est passée inaperçue, la date de prise en charge ressemblant à l'heure d'envoi du mail.

## Alerte WhatsApp

`server/whatsapp.mjs` envoie à chaque demande, avant les emails, un WhatsApp à l'opérateur par l'**API Cloud officielle de Meta** (pas de bibliothèque non officielle : Meta bannit les numéros pilotés ainsi). Le message reprend toutes les données de la demande : référence, délai (« URGENT, prise en charge dans 35 min »), trajet, aéroport et terminal, prise en charge, adresse, passagers, détail du prix, nom, téléphone et email du client, heure d'envoi, page d'origine et langue, avec un bouton « Voir l'adresse sur la carte » (Google Maps). Sur WhatsApp, le téléphone et l'email sont cliquables.

- **Modèles Meta** (catégorie Utilité, français). Un message envoyé en premier (hors fenêtre de 24 h) doit suivre un modèle validé par Meta.
  - `nouvelle_reservation_complete` : 13 variables dans l'ordre (référence, délai, trajet, aéroport / terminal, prise en charge, adresse, passagers, prix, nom, téléphone, email, heure d'envoi, « page (langue) ») et un bouton URL `https://www.google.com/maps/search/?api=1&query={{1}}` qui reçoit l'adresse encodée.
  - `nouvelle_reservation` : version courte à 9 variables (référence, délai, trajet, prise en charge, adresse, passagers, prix, nom, téléphone), en secours. Elle n'est envoyée que si Meta répond que le modèle complet n'existe pas ou n'est pas encore validé (code `132001`). Le pied de l'email opérateur indique alors « Alerte WhatsApp envoyée (modèle court) ».
  - Les noms sont fixés dans `MODELES` (`server/whatsapp.mjs`). Changer le texte ou l'ordre des variables : créer un nouveau modèle dans le Gestionnaire WhatsApp, attendre sa validation, puis adapter `MODELES` et `corpsAlerte()`. La variable `WHATSAPP_TEMPLATE` de la première version n'existe plus : la retirer de Coolify si elle y a été ajoutée.
- **Variables** : `WHATSAPP_TOKEN` (jeton permanent d'un utilisateur système du portefeuille Meta ToAirport, droits `whatsapp_business_messaging` et `whatsapp_business_management` ; jamais commité), `WHATSAPP_PHONE_ID` (identifiant du numéro qui envoie), `WHATSAPP_ALERTE_TO` (numéros qui reçoivent, séparés par des virgules, format international).
- **Sans `WHATSAPP_TOKEN`** (en local, par exemple), l'alerte est sautée sans bruit. **En cas d'échec** (jeton expiré, modèle refusé, Meta muet plus de 8 secondes), la réservation passe quand même et le pied de l'email opérateur porte « Alerte WhatsApp non envoyée : » suivi du message de Meta ; l'erreur part aussi dans les logs Coolify (`WhatsApp error:`).
- **Comptes Meta** : portefeuille business ToAirport (`1148862648093932`), app développeur `toairport-centrale` (`1429494439363335`). Pour l'instant, le numéro qui envoie est le numéro de test de Meta (`WHATSAPP_PHONE_ID=1398356673364468`), qui ne peut écrire qu'à 5 numéros déclarés dans l'app (Cas d'utilisation, WhatsApp, Étape 1). Passer au vrai numéro de la centrale : l'ajouter dans le Gestionnaire WhatsApp, renseigner un moyen de paiement, recréer les deux modèles sur ce compte si besoin, changer `WHATSAPP_PHONE_ID`.
- **Tests** : `npm test` couvre le calcul du délai (heure d'été, d'hiver, nuit du changement d'heure), le corps envoyé à Meta pour les deux modèles, le repli sur le modèle court, les échecs et leur trace dans l'email, sans aucun appel réseau.

Mise en page aux couleurs du site (noir `#0a0a0b`, doré `#c9a96e`), en tableaux et styles en ligne, polices système. Le logo est chargé depuis `https://toairport.fr/assets/logo/lumineux-1200.png` : ne pas déplacer ce fichier. Toute saisie du visiteur passe par `echapper()` avant d'entrer dans le HTML ; les tests (`npm test`) le vérifient, ainsi que le prix, la langue et le `Reply-To`. Pour relire un rendu, générer le HTML avec `emailClient()` / `emailOperateur()` et l'ouvrir dans un navigateur.

## Vérification en ligne

`npm run check:live` lit `sitemap.xml`, interroge chaque adresse en ligne et sort en erreur si une page ne répond pas 200 ou porte un `noindex`. À lancer après chaque push : une page du dépôt en 404 en ligne signale un déploiement qui n'est pas passé. `CHECK_BASE=https://toairport.vps.olivierlam.fr npm run check:live` vérifie la même liste sur une autre adresse (adresse d'essai, ou `http://localhost:3000`). Avec `CHECK_BASE`, l'en-tête `X-Robots-Tag: noindex` est attendu et ignoré : seule la balise meta `robots` compte. Le sitemap ne liste que des pages indexables (pas `mentions-legales/`, qui est en `noindex`).

## Répartition des requêtes de prix

Une requête, une page, pour éviter que deux pages se disputent la même recherche :

| Requête visée | Page |
|---|---|
| tarif taxi aéroport, forfait aéroport | `/tarifs/` |
| prix taxi Paris Orly | `/taxi-paris-orly/` |
| taxi Paris CDG | `/taxi-paris-cdg/` |
| taxi CDG Paris | `/taxi-cdg-paris/` |
| taxi Montparnasse Orly (prix, forfait, temps de trajet) | `/taxi-montparnasse-orly/` |

Les cartes de prix de `/tarifs/` sont des liens vers la page dédiée du trajet. Pas de `aggregateRating` dans les données structurées : Google ne l'accepte pas sur `TaxiService` (erreur « Type d'objet non valide » dans Search Console) et une note doit reposer sur des avis vérifiables. Aucun avis, note ni chiffre d'activité inventé sur le site : les témoignages, la note 4,9 et « 4k+ courses » du modèle de départ ont été retirés le 27 octobre 2026. Un avis n'est publié que s'il vient d'un vrai client (par exemple de la fiche Google), un chiffre que s'il est vérifiable. Les titres écrivent « Paris Orly » ou « CDG Paris » sans flèche, comme les requêtes tapées ; la flèche reste dans les H1.

Balises `<meta name="description">` : 160 caractères au plus (Google coupe au-delà), prix en tête. `og:description` et `twitter:description` peuvent rester plus longues. Les pages anglaises ont aussi un `BreadcrumbList` (toAirport.fr > Paris airport taxi fares 2026 > page).

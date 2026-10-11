const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  const { nom, email, telephone, adresse, date, heure, passagers, airport, trajet } = data;
  // Page d'origine et langue envoyées par assets/main.js : servent à savoir quelles pages convertissent.
  const page = String(data.page || '').slice(0, 120) || 'inconnue';
  const lang = data.lang === 'en' ? 'en' : 'fr';
  // Référence lisible, reprise dans l'objet des deux emails : une réservation = un email « [Réservation TA-...] ».
  const now = new Date();
  const ref = `TA-${now.toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  if (!nom || !email || !telephone || !adresse || !date || !heure) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Champs obligatoires manquants' }) };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.OVH_SMTP_HOST,
    port: parseInt(process.env.OVH_SMTP_PORT, 10),
    secure: true,
    auth: {
      user: process.env.OVH_EMAIL_USER,
      pass: process.env.OVH_EMAIL_PASS,
    },
  });

  const trajetLabel = trajet || 'Non précisé';
  const airportLabel = airport ? `\nAéroport / Terminal : ${airport}` : '';
  const passagersLabel = passagers || '1';

  const operatorBody = `
Nouvelle demande de réservation ${ref} - toAirport.fr

Trajet : ${trajetLabel}${airportLabel}
Adresse de départ : ${adresse}
Date : ${date}
Heure : ${heure}
Passagers : ${passagersLabel}

Contact
-------
Nom : ${nom}
Email : ${email}
Téléphone : ${telephone}

Suivi
-----
Page d'origine : ${page}
Langue : ${lang}
  `.trim();

  const clientBodyFr = `
Bonjour ${nom},

Nous avons bien reçu votre demande de réservation et vous recontacterons rapidement pour confirmer votre course.

Récapitulatif (réf. ${ref})
-------------
Trajet : ${trajetLabel}${airportLabel}
Adresse de départ : ${adresse}
Date : ${date} à ${heure}
Passagers : ${passagersLabel}

En cas de besoin, contactez-nous directement au 07 61 46 68 23.

À bientôt,
L'équipe toAirport.fr
  `.trim();

  const clientBodyEn = `
Hello ${nom},

We have received your booking request and will contact you shortly to confirm your ride.

Summary (ref. ${ref})
-------------
Route: ${trajetLabel}${airportLabel}
Paris address: ${adresse}
Date: ${date} at ${heure}
Passengers: ${passagersLabel}

If needed, call us directly on +33 7 61 46 68 23.

Best regards,
The toAirport.fr team
  `.trim();

  try {
    await transporter.sendMail({
      from: `toAirport.fr <${process.env.OVH_EMAIL_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
      subject: `[Réservation ${ref}] ${trajetLabel} - ${nom} - ${date} ${heure}`,
      text: operatorBody,
    });

    await transporter.sendMail({
      from: `toAirport.fr <${process.env.OVH_EMAIL_USER}>`,
      to: email,
      subject: lang === 'en'
        ? `Your booking request ${ref} - toAirport.fr`
        : `Votre demande de réservation ${ref} - toAirport.fr`,
      text: lang === 'en' ? clientBodyEn : clientBodyFr,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('SMTP error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erreur lors de l\'envoi de l\'email' }),
    };
  }
};

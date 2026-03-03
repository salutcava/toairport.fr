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
Nouvelle demande de réservation — toAirport.fr

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
  `.trim();

  const clientBody = `
Bonjour ${nom},

Nous avons bien reçu votre demande de réservation et vous recontacterons rapidement pour confirmer votre course.

Récapitulatif
-------------
Trajet : ${trajetLabel}${airportLabel}
Adresse de départ : ${adresse}
Date : ${date} à ${heure}
Passagers : ${passagersLabel}

En cas de besoin, contactez-nous directement au 01 00 000 000.

À bientôt,
L'équipe toAirport.fr
  `.trim();

  try {
    await transporter.sendMail({
      from: `toAirport.fr <${process.env.OVH_EMAIL_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
      subject: `[Réservation] ${trajetLabel} — ${nom} — ${date} ${heure}`,
      text: operatorBody,
    });

    await transporter.sendMail({
      from: `toAirport.fr <${process.env.OVH_EMAIL_USER}>`,
      to: email,
      subject: 'Votre demande de réservation — toAirport.fr',
      text: clientBody,
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

document.addEventListener('DOMContentLoaded', () => {
  // Active nav
  document.querySelectorAll('.nav-links a').forEach(l => {
    if (l.getAttribute('href') === window.location.pathname) l.classList.add('active');
  });
  // Default date
  const d = document.getElementById('dateInput');
  if (d) { const dt = new Date(); dt.setDate(dt.getDate()+1); d.value = dt.toISOString().split('T')[0]; }
  // Scroll reveal
  const obs = new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); }), {threshold:0.1});
  document.querySelectorAll('.reveal').forEach(r => obs.observe(r));
  // FAQ
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => {
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!open) item.classList.add('open');
    });
  });
  // Form submission
  const form = document.getElementById('booking-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.btn-book');
      const msg = document.getElementById('form-msg');
      const data = Object.fromEntries(new FormData(form));

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Envoi en cours…';

      try {
        const res = await fetch('/.netlify/functions/reservation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (res.ok && json.success) {
          msg.style.color = '#c9a96e';
          msg.textContent = 'Demande envoyée ! Vous recevrez une confirmation par email.';
          form.reset();
          if (d) { const dt = new Date(); dt.setDate(dt.getDate()+1); d.value = dt.toISOString().split('T')[0]; }
        } else {
          throw new Error(json.error || 'Erreur');
        }
      } catch {
        msg.style.color = '#e57373';
        msg.textContent = 'Erreur lors de l\'envoi. Appelez-nous directement.';
        btn.disabled = false;
        btn.textContent = originalText;
      }
      msg.style.display = 'block';
    });
  }
});

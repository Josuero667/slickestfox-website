(() => {
  async function load() {
    try {
      const response = await fetch('assets/data/settings.json', { cache: 'no-store' });
      if (!response.ok) return;
      const settings = await response.json();
      document.querySelectorAll('[data-commission-status]').forEach(element => {
        const open = settings.commissions_open === true;
        element.textContent = open ? 'COMMISSIONS OPEN' : 'COMMISSIONS CLOSED';
        element.classList.toggle('open', open);
        element.classList.toggle('closed', !open);
      });
    } catch { /* Keep the published fallback when the connection fails. */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      mobileNav.hidden = open;
    });
  }

  document.querySelectorAll('[data-outbound-product]').forEach((link) => {
    link.addEventListener('click', () => {
      if (typeof window.gtag !== 'function') return;
      window.gtag('event', 'affiliate_click', {
        product_id: link.dataset.outboundProduct || '',
        product_category: link.dataset.outboundCategory || '',
        destination_url: link.href
      });
    });
  });
});

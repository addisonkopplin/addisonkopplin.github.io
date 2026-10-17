/* ===== Shop settings: edit these values to change prices, delivery time and checkout links. ===== */
const SHOP = {
  currency: '$',
  turnaround: 'within 3 days',                   // shown in "How it works" and the FAQ
  photoInstructions: 'Instructions for sending your photo appear after checkout.',
  tiers: {
    standard: { name: 'Standard', price: 15 },
    premium:  { name: 'Premium',  price: 29 },
  },
};
// Paste a checkout URL (for example a Stripe or Gumroad payment link) to open orders.
// While a link is empty, its button shows "Coming soon" and is disabled.
const PAYMENT_LINKS = { standard: '', premium: '' };
/* ================================================================================================= */

(function () {
  'use strict';
  document.querySelectorAll('[data-price]').forEach((el) => {
    el.textContent = SHOP.currency + SHOP.tiers[el.dataset.price].price;
  });
  document.querySelectorAll('[data-tier-name]').forEach((el) => {
    el.textContent = SHOP.tiers[el.dataset.tierName].name;
  });
  document.querySelectorAll('[data-turnaround]').forEach((el) => { el.textContent = SHOP.turnaround; });
  document.querySelectorAll('[data-photo-instructions]').forEach((el) => { el.textContent = SHOP.photoInstructions; });

  let anyOpen = false;
  document.querySelectorAll('[data-buy]').forEach((a) => {
    const tier = a.dataset.buy, url = (PAYMENT_LINKS[tier] || '').trim();
    if (/^https:\/\//.test(url)) {
      anyOpen = true;
      a.href = url; a.rel = 'noopener'; a.removeAttribute('aria-disabled'); a.classList.remove('off');
      a.textContent = 'Buy ' + SHOP.tiers[tier].name + ' · ' + SHOP.currency + SHOP.tiers[tier].price;
    } else {
      a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.classList.add('off');
      a.textContent = 'Coming soon';
    }
  });
  document.querySelectorAll('[data-orders-closed]').forEach((el) => { el.hidden = anyOpen; });
})();

// Entry point: wires up every interactive piece of the page.
import { initTyping } from './typing.js';
import { initReveal } from './reveal.js';
import { initFlow } from './flow.js';

initTyping(document.querySelector('.typing-text'), ['C', 'Python', 'Networking', 'REST APIs']);
initReveal(document.querySelectorAll('.reveal'));
initFlow(document.querySelector('.flow'));
initHeader();
initCardGlow();
initCopyEmail();

document.querySelector('[data-year]').textContent = new Date().getFullYear();

// Header gets a border once the page is scrolled, and the nav highlights the current section.
function initHeader() {
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = new Map(
    [...document.querySelectorAll('.nav-links a')].map((a) => [a.getAttribute('href').slice(1), a])
  );
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('active'));
      links.get(entry.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

// Project cards: a soft glow follows the pointer.
function initCardGlow() {
  for (const card of document.querySelectorAll('.card')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

// "Copy email" button with a short confirmation.
function initCopyEmail() {
  const btn = document.querySelector('[data-copy]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = btn.dataset.copy;
    }
    setTimeout(() => { btn.textContent = 'Copy email'; }, 2000);
  });
}

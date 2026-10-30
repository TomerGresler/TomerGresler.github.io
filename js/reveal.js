// Scroll reveal: elements with .reveal fade/slide in the first time they enter the viewport.
// Siblings that appear together get a small stagger.
export function initReveal(elements) {
  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries
      .filter((e) => e.isIntersecting)
      .forEach((entry, i) => {
        entry.target.style.setProperty('--delay', `${i * 90}ms`);
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  elements.forEach((el) => observer.observe(el));
}

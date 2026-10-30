// Typing effect for the hero: types a word, pauses, deletes it, moves to the next.
// With reduced motion, words simply swap without the per-letter animation.
const TYPE_MS = 90;
const DELETE_MS = 45;
const HOLD_MS = 1600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function initTyping(el, words) {
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  for (let i = 0; ; i = (i + 1) % words.length) {
    const word = words[i];

    if (reduced.matches) {
      el.textContent = word;
      await sleep(HOLD_MS + 800);
      continue;
    }

    for (let n = 1; n <= word.length; n++) {
      el.textContent = word.slice(0, n);
      await sleep(TYPE_MS);
    }
    await sleep(HOLD_MS);
    for (let n = word.length - 1; n >= 0; n--) {
      el.textContent = word.slice(0, n);
      await sleep(DELETE_MS);
    }
    await sleep(250);
  }
}

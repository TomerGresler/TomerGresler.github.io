// Dark / light theme toggle. The choice is saved in localStorage.
// (The saved theme is applied early by a tiny inline script in <head> to avoid a flash.)
const KEY = 'theme';

export function initTheme(button) {
  const root = document.documentElement;

  const apply = (theme) => {
    root.dataset.theme = theme;
    const next = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', theme === 'dark' ? '#0b0d12' : '#f7f8fb');
  };

  apply(root.dataset.theme === 'light' ? 'light' : 'dark');

  button.addEventListener('click', () => {
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: still works for this visit */ }
  });
}

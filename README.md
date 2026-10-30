# tomergresler.github.io

My personal portfolio site: **https://tomergresler.github.io/**

Plain HTML, CSS and JavaScript (ES modules). No framework, no build step, and no dependencies
except Google Fonts. GitHub Pages serves the files from `main` as they are.

## Structure

| File | What it does |
|------|--------------|
| `index.html` | All page content and the SEO / Open Graph meta tags. |
| `styles.css` | Design tokens (colors, fonts) at the top, then one block per section. Dark theme by default, light theme under `[data-theme="light"]`. |
| `js/main.js` | Entry point. Starts every module, plus the sticky header, card hover glow and "copy email". |
| `js/theme.js` | Dark / light toggle, saved in `localStorage`. |
| `js/typing.js` | The typing effect in the hero. |
| `js/reveal.js` | Fades sections in on scroll with `IntersectionObserver`. |
| `js/flow.js` | The interactive MessageU diagram (Client A → Server → Client B). |
| `js/crypto.js` | Real RSA-OAEP and AES-128-CBC for the diagram, using the browser's Web Crypto API. |
| `assets/` | Favicon, touch icon and the Open Graph image used for link previews. |
| `cv.pdf` | My CV, linked from the "Download CV" buttons. |

## The MessageU demo

1. **Exchange key**: Alice asks the server for Bob's public key (request 602), makes a random AES key,
   wraps it with Bob's RSA public key and sends it (603, message type 2). Bob pulls it (604) and unwraps it
   with his private key.
2. **Send message**: Alice encrypts the text with the shared AES key and sends it (603, type 3). The server
   stores only ciphertext. Bob pulls it and decrypts it.

The request codes and packet layout match the real [MessageU](https://github.com/TomerGresler/MessageU) protocol.

## Accessibility and performance

- Keyboard friendly: skip link, visible focus rings, every control is a real button or link.
- Respects `prefers-reduced-motion`: animations are switched off and the demo doesn't start by itself.
- Lighthouse (mobile and desktop): 100 performance, 100 accessibility, 100 best practices, 100 SEO.

## Run locally

ES modules need a web server (opening the file directly won't load them):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

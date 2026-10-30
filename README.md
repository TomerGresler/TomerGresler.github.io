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

A six-step walkthrough. Press **Start demo**, then **Next** (or **Back**) to move one step at a time,
or **Play all** to run it automatically. Each step highlights only the active box and shows a short caption:

1. Alice asks the server for Bob's public key (request 602).
2. Alice makes a random AES key and locks it with Bob's RSA public key.
3. She sends it (603, message type 2). The server stores it but can't open it.
4. Bob pulls his messages (604) and unlocks the AES key with his private key.
5. Alice encrypts a message with the shared AES key.
6. The message goes through the server as ciphertext (603, type 3), and Bob decrypts it.

After the last step you can type your own message and send it. The protocol log and the byte
layout panel update together with each step.

The request codes and packet layout match the real [MessageU](https://github.com/TomerGresler/MessageU) protocol.

## Accessibility and performance

- Keyboard friendly: skip link, visible focus rings, every control is a real button or link.
- Respects `prefers-reduced-motion`: animations are switched off. The step caption is announced with `aria-live`.
- Lighthouse (mobile and desktop): 100 performance, 100 accessibility, 100 best practices, 100 SEO.

## Run locally

ES modules need a web server (opening the file directly won't load them):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

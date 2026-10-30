// Interactive MessageU diagram: Client A -> Server -> Client B, as a 6-step walkthrough.
// Steps 1-4 share an AES key wrapped with RSA, steps 5-6 send an AES-encrypted message
// through a server that stores it but can't read it. Afterwards the visitor can send their own.
import { createRsaKeyPair, createWrappedKey, unwrapKey, encryptText, decryptText, hex } from './crypto.js';

const HOP_MS = 1000;       // one packet hop between two boxes, when stepping by hand
const PLAY_HOP_MS = 550;   // faster hops during "Play all"
const PLAY_STEP_MS = 1800; // "Play all": time per step, including its animation
const DEMO_TEXT = 'Hi Bob, lunch at 1?';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thrown inside a step when Reset (or a newer run) made it out of date. Never shown to the user.
class Stale extends Error {}

export function initFlow(root) {
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const stage = $('.flow-stage');
  const packet = $('.packet');
  const packetLabel = $('.packet-label');
  const nodes = { a: $('#node-a'), s: $('#node-server'), b: $('#node-b') };
  const wires = { ab: $('[data-wire="ab"]'), bc: $('[data-wire="bc"]') };
  const log = $('.flow-log');
  const caption = $('[data-caption]');
  const progress = $('[data-progress]');
  const progressLabel = $('[data-step-label]');
  const bars = [...root.querySelectorAll('.flow-bars i')];
  const compose = $('[data-compose]');
  const input = $('#flow-msg');
  const btn = {
    start: $('[data-action="start"]'),
    back: $('[data-action="back"]'),
    next: $('[data-action="next"]'),
    play: $('[data-action="play"]'),
    reset: $('[data-action="reset"]'),
    send: compose.querySelector('button[type="submit"]'),
  };
  const inspector = { len: $('[data-len]'), cipher: $('[data-cipher]'), title: $('.inspector-title') };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Initial texts, so Reset and Back can restore them.
  const initial = {
    notes: Object.fromEntries(Object.entries(nodes).map(([k, el]) => [k, el.querySelector('[data-note]').innerHTML])),
    caption: caption.innerHTML,
    log: log.innerHTML,
  };

  let step = 0;          // 0 = not started, 1..6 = step shown
  let busy = false;      // a step (or "send your own") is running
  let playing = false;   // "Play all" is on
  let playId = 0;        // identifies the current "Play all" loop
  let run = 0;           // bumped on every reset, so older work stops
  let data = {};         // crypto results, made once and reused when stepping back
  let rsaPromise = null; // Bob's RSA key pair, made once on first use

  // Everything a step needs. check() throws Stale if Reset happened since the step began,
  // and is called after every await, before touching data or the page.
  function context(animate) {
    const myRun = run;
    return {
      animate,
      d: data, // this run's data object, even if Reset replaces `data` meanwhile
      fast: playing,
      stale: () => myRun !== run,
      check() { if (myRun !== run) throw new Stale(); },
    };
  }

  // ---------- small helpers ----------
  const note = (key, html) => { nodes[key].querySelector('[data-note]').innerHTML = html; };
  const showAes = (key) => { nodes[key].querySelector('[data-aes]').hidden = false; };
  const pause = (ms) => sleep(reduced.matches ? Math.min(ms, 200) : ms);

  // Highlight only the given boxes ('a', 's', 'b') and wires ('ab', 'bc').
  function highlight(...parts) {
    Object.entries(nodes).forEach(([k, el]) => el.classList.toggle('active', parts.includes(k)));
    Object.entries(wires).forEach(([k, el]) => el.classList.toggle('lit', parts.includes(k)));
  }

  function addLog(html, animate) {
    if (log.querySelector('.muted')) log.innerHTML = '';
    log.querySelectorAll('.new').forEach((li) => li.classList.remove('new'));
    const li = document.createElement('li');
    if (animate) li.className = 'new';
    li.innerHTML = html;
    log.append(li);
    log.scrollTop = log.scrollHeight;
  }

  function setInspector(type, bytes) {
    inspector.title.textContent = `Request 603 on the wire (message type ${type})`;
    inspector.len.textContent = `${bytes.length} B`;
    inspector.cipher.innerHTML = `content: <b>${hex(bytes, 24)}</b>`;
  }

  // Center of a node, relative to the stage.
  function centerOf(el) {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  }

  // Move the packet from one box to the next, lighting up both boxes and the wire between.
  // With ctx.animate = false (stepping back) it only sets the highlight.
  async function hop(from, to, label, kind, ctx) {
    const wireKey = [from, to].includes('a') ? 'ab' : 'bc';
    highlight(from, wireKey, to);
    if (!ctx.animate) return;

    packetLabel.textContent = label;
    packet.classList.toggle('rsa', kind === 'rsa');
    wires[wireKey].classList.add('active');

    const p0 = centerOf(nodes[from]);
    const p1 = centerOf(nodes[to]);
    const w = packet.offsetWidth / 2;
    const h = packet.offsetHeight / 2;
    const at = (p) => `translate(${p.x - w}px, ${p.y - h}px)`;

    const anim = packet.animate(
      [
        { transform: at(p0), opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { opacity: 1, offset: 0.85 },
        { transform: at(p1), opacity: 0 },
      ],
      {
        duration: reduced.matches ? 1 : ctx.fast ? PLAY_HOP_MS : HOP_MS,
        easing: 'cubic-bezier(.65,0,.35,1)',
        fill: 'forwards',
      }
    );
    await anim.finished.catch(() => {}); // cancelled by Reset: check() below stops us
    ctx.check();
    wires[wireKey].classList.remove('active');
    await pause(ctx.fast ? 120 : 250);
    ctx.check();
  }

  // ---------- the six steps ----------
  // Each step applies its changes on top of the previous one. ctx.animate is false
  // when we rebuild an earlier step after pressing Back.
  const steps = [
    {
      caption: 'Alice asks the server for Bob\'s public key.',
      async run(ctx) {
        const keys = await (rsaPromise ??= createRsaKeyPair());
        ctx.check();
        ctx.d.bobKeys ??= keys;
        addLog('Alice → Server: <b>602</b> give me Bob\'s public key', ctx.animate);
        await hop('a', 's', '602 · pub key?', 'rsa', ctx);
        note('s', 'Looks up Bob and sends back his public key.');
        await hop('s', 'a', '2102 · Bob\'s pub key', 'rsa', ctx);
        addLog('Server → Alice: <b>2102</b> Bob\'s RSA public key', ctx.animate);
        note('a', 'Got Bob\'s <strong>RSA public key</strong>.');
      },
    },
    {
      caption: 'Alice creates a random AES key and locks it with Bob\'s RSA public key.',
      async run(ctx) {
        highlight('a');
        const key = ctx.d.key ?? await createWrappedKey(ctx.d.bobKeys);
        ctx.check();
        ctx.d.key = key;
        showAes('a');
        note('a', 'Made a random <strong>AES-128</strong> key and locked it with Bob\'s public key.');
        addLog(`Alice locks a new AES key with RSA-OAEP → ${key.wrapped.length} B`, ctx.animate);
      },
    },
    {
      caption: 'The server stores the locked key, but it can\'t open it.',
      async run(ctx) {
        const { wrapped } = ctx.d.key;
        setInspector(2, wrapped);
        addLog('Alice → Server: <b>603</b> type 2 (symmetric key)', ctx.animate);
        await hop('a', 's', '603 · 🔒 RSA', 'rsa', ctx);
        highlight('s');
        note('s', `Stored for Bob:<br><strong>${hex(wrapped, 8)}</strong><br><span class="lock">No private key, can't open it.</span>`);
        addLog('Server → Alice: <b>2103</b> stored', ctx.animate);
      },
    },
    {
      caption: 'Bob pulls his messages and unlocks the AES key with his private RSA key.',
      async run(ctx) {
        addLog('Bob → Server: <b>604</b> any waiting messages?', ctx.animate);
        await hop('b', 's', '604 · inbox?', 'rsa', ctx);
        await hop('s', 'b', '2104 · 🔒 RSA', 'rsa', ctx);
        const aesB = ctx.d.aesB ?? await unwrapKey(ctx.d.bobKeys, ctx.d.key.wrapped, ctx.d.key.raw);
        ctx.check();
        ctx.d.aesB = aesB;
        highlight('b');
        showAes('b');
        note('s', 'Forwarded it. It never saw the AES key.');
        note('b', 'Unlocked the AES key with his <strong>RSA private key</strong>.');
        addLog('Bob unlocks it with his private key. <b>Both now share the AES key.</b>', ctx.animate);
      },
    },
    {
      caption: 'Now Alice and Bob share a secret key. Alice\'s message is encrypted with AES.',
      async run(ctx) {
        highlight('a');
        const msg = ctx.d.msg ?? await encryptText(ctx.d.key.raw, DEMO_TEXT);
        ctx.check();
        ctx.d.msg = msg;
        note('a', `Encrypted <strong>"${DEMO_TEXT}"</strong> with the shared AES key.`);
        addLog(`Alice encrypts "${DEMO_TEXT}" with AES-128-CBC → ${msg.cipher.length} B`, ctx.animate);
      },
    },
    {
      caption: 'The server only sees ciphertext. Bob decrypts it and reads the message.',
      async run(ctx) {
        await deliver(ctx.d.msg, ctx);
      },
    },
  ];

  // Step 6 and "send your own": the encrypted message goes A -> server -> B.
  async function deliver(msg, ctx) {
    setInspector(3, msg.cipher);
    addLog('Alice → Server: <b>603</b> type 3 (text message)', ctx.animate);
    await hop('a', 's', '603 · 🔒 AES', 'aes', ctx);
    note('s', `Stored for Bob:<br><strong>${hex(msg.cipher, 8)}</strong><br><span class="lock">No AES key: just noise to the server.</span>`);
    addLog('Server → Alice: <b>2103</b> stored', ctx.animate);
    if (ctx.animate) { await pause(ctx.fast ? 150 : 400); ctx.check(); }
    addLog('Bob → Server: <b>604</b> any waiting messages?', ctx.animate);
    await hop('b', 's', '604 · inbox?', 'aes', ctx);
    await hop('s', 'b', '2104 · 🔒 AES', 'aes', ctx);
    const plain = await decryptText(ctx.d.aesB, msg);
    ctx.check();
    note('b', `Decrypted with the shared AES key:<br><strong>"${escapeHtml(plain)}"</strong>`);
    addLog(`Bob decrypts it: <b>"${escapeHtml(plain)}"</b>`, ctx.animate);
  }

  // Errors from a run that Reset made stale are expected and ignored.
  function report(err, ctx) {
    if (err instanceof Stale || ctx.stale()) return;
    addLog(`Something went wrong: ${escapeHtml(err.message)}`, true);
  }

  // ---------- rendering the current position ----------
  function clearDiagram() {
    packet.getAnimations().forEach((a) => a.cancel());
    highlight();
    Object.values(wires).forEach((w) => w.classList.remove('active'));
    Object.entries(nodes).forEach(([k, el]) => {
      el.querySelector('[data-note]').innerHTML = initial.notes[k];
      const aes = el.querySelector('[data-aes]');
      if (aes) aes.hidden = true;
    });
    log.innerHTML = initial.log;
    inspector.title.textContent = 'Request 603 on the wire';
    inspector.len.textContent = 'n B';
    inspector.cipher.textContent = 'No packet sent yet.';
  }

  function updateControls() {
    const hadFocus = root.contains(document.activeElement);
    const started = step > 0;
    root.classList.toggle('running', started);
    btn.start.hidden = started;
    btn.back.hidden = btn.next.hidden = btn.reset.hidden = !started;
    progress.hidden = !started;
    compose.hidden = step < steps.length;

    btn.back.disabled = playing || step <= 1;
    btn.next.disabled = playing || step >= steps.length;
    btn.send.disabled = playing;
    btn.play.textContent = playing ? 'Pause' : 'Play all';
    btn.play.setAttribute('aria-pressed', String(playing));

    progressLabel.textContent = `Step ${step} of ${steps.length}`;
    bars.forEach((bar, i) => bar.classList.toggle('on', i < step));
    if (started) caption.textContent = steps[step - 1].caption;
    else caption.innerHTML = initial.caption;

    // Never leave keyboard focus on a button that just got hidden or disabled.
    // (Browsers move focus to <body> as soon as the focused button is hidden.)
    const f = document.activeElement;
    if (hadFocus && (!root.contains(f) || f.disabled || f.hidden)) {
      (step >= steps.length && !playing ? input : started ? btn.next : btn.start).focus();
    }
  }

  function setBusy(on) {
    busy = on;
    if (on) root.setAttribute('aria-busy', 'true');
    else root.removeAttribute('aria-busy');
  }

  // Show step n. Going forward one step animates it; any other jump rebuilds silently.
  async function goTo(n) {
    if (busy || n < 1 || n > steps.length) return;
    const forward = n === step + 1;
    setBusy(true);
    const ctx = context(false);
    try {
      if (!forward) {
        clearDiagram();
        for (let i = 0; i < n - 1; i++) await steps[i].run(ctx);
      }
      step = n;
      updateControls();
      await steps[n - 1].run({ ...ctx, animate: forward });
    } catch (err) {
      report(err, ctx);
    } finally {
      if (!ctx.stale()) setBusy(false);
    }
  }

  async function playAll() {
    if (playing) { playing = false; updateControls(); return; } // acts as "Pause"
    const myRun = run;
    const myPlay = ++playId;
    playing = true;
    updateControls();
    const stillPlaying = () => playing && myRun === run && myPlay === playId;

    while (busy && stillPlaying()) await sleep(50); // let a step that's already running finish
    if (stillPlaying() && step >= steps.length) {   // at the end: start over
      reset();
      return playAll();
    }
    while (stillPlaying() && step < steps.length) {
      const t0 = performance.now();
      await goTo(step + 1);
      if (!stillPlaying() || step >= steps.length) break;
      await sleep(Math.max(400, PLAY_STEP_MS - (performance.now() - t0)));
    }
    if (stillPlaying()) { playing = false; updateControls(); }
  }

  async function sendOwn(e) {
    e.preventDefault();
    if (busy || playing || step < steps.length) return;
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    setBusy(true);
    const ctx = context(true);
    try {
      caption.textContent = 'Your message takes the same path: Alice encrypts it, the server only stores ciphertext, Bob decrypts it.';
      highlight('a');
      const msg = await encryptText(ctx.d.key.raw, text);
      ctx.check();
      note('a', `Encrypted <strong>"${escapeHtml(text)}"</strong> with the shared AES key.`);
      addLog(`Alice encrypts "${escapeHtml(text)}" with AES-128-CBC → ${msg.cipher.length} B`, true);
      await pause(600);
      ctx.check();
      await deliver(msg, ctx);
    } catch (err) {
      report(err, ctx);
    } finally {
      if (!ctx.stale()) setBusy(false);
    }
  }

  // Back to the start. Bumping `run` makes any running step or "Play all" loop stop.
  function reset() {
    run++;
    playing = false;
    step = 0;
    data = {};
    setBusy(false);
    clearDiagram();
    updateControls();
  }

  btn.start.addEventListener('click', () => goTo(1));
  btn.next.addEventListener('click', () => goTo(step + 1));
  btn.back.addEventListener('click', () => goTo(step - 1));
  btn.play.addEventListener('click', playAll);
  btn.reset.addEventListener('click', () => {
    reset();
    btn.start.focus();
  });
  compose.addEventListener('submit', sendOwn);

  updateControls();
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

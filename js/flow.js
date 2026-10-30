// Interactive MessageU diagram: Client A -> Server -> Client B, as a 6-step walkthrough.
// Steps 1-4 share an AES key wrapped with RSA, steps 5-6 send an AES-encrypted message
// through a server that stores it but can't read it. Afterwards the visitor can send their own.
import { createRsaKeyPair, createWrappedKey, unwrapKey, encryptText, decryptText, hex } from './crypto.js';

const HOP_MS = 1000;      // one packet hop between two boxes
const PLAY_STEP_MS = 3000; // "Play all": time per step, including its animation
const DEMO_TEXT = 'Hi Bob, lunch at 1?';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let busy = false;      // an animation is running
  let playing = false;   // "Play all" is on
  let playId = 0;        // identifies the current "Play all" loop
  let run = 0;           // bumped on every reset, so old animations stop
  let data = {};         // crypto results, made once and reused when stepping back
  let rsaPromise = null; // Bob's RSA key pair, made once on first use

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
  // With animate = false (stepping back) it only sets the highlight.
  async function hop(from, to, label, kind, animate) {
    const wireKey = [from, to].includes('a') ? 'ab' : 'bc';
    highlight(from, wireKey, to);
    if (!animate) return;

    const myRun = run;
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
      { duration: reduced.matches ? 1 : HOP_MS, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }
    );
    await anim.finished.catch(() => {});
    wires[wireKey].classList.remove('active');
    if (myRun !== run) throw new Error('reset'); // Reset was pressed mid-animation
    await pause(250);
  }

  // ---------- the six steps ----------
  // Each step applies its changes on top of the previous one. "animate" is false
  // when we rebuild an earlier step after pressing Back.
  const steps = [
    {
      caption: 'Alice asks the server for Bob\'s public key.',
      async run(animate) {
        data.bobKeys ??= await (rsaPromise ??= createRsaKeyPair());
        addLog('Alice → Server: <b>602</b> give me Bob\'s public key', animate);
        await hop('a', 's', '602 · pub key?', 'rsa', animate);
        note('s', 'Looks up Bob and sends back his public key.');
        await hop('s', 'a', '2102 · Bob\'s pub key', 'rsa', animate);
        addLog('Server → Alice: <b>2102</b> Bob\'s RSA public key', animate);
        note('a', 'Got Bob\'s <strong>RSA public key</strong>.');
      },
    },
    {
      caption: 'Alice creates a random AES key and locks it with Bob\'s RSA public key.',
      async run(animate) {
        highlight('a');
        data.key ??= await createWrappedKey(data.bobKeys);
        showAes('a');
        note('a', 'Made a random <strong>AES-128</strong> key and locked it with Bob\'s public key.');
        addLog(`Alice locks a new AES key with RSA-OAEP → ${data.key.wrapped.length} B`, animate);
      },
    },
    {
      caption: 'The server stores the locked key, but it can\'t open it.',
      async run(animate) {
        setInspector(2, data.key.wrapped);
        addLog('Alice → Server: <b>603</b> type 2 (symmetric key)', animate);
        await hop('a', 's', '603 · 🔒 RSA', 'rsa', animate);
        highlight('s');
        note('s', `Stored for Bob:<br><strong>${hex(data.key.wrapped, 8)}</strong><br><span class="lock">No private key, can't open it.</span>`);
        addLog('Server → Alice: <b>2103</b> stored', animate);
      },
    },
    {
      caption: 'Bob pulls his messages and unlocks the AES key with his private RSA key.',
      async run(animate) {
        addLog('Bob → Server: <b>604</b> any waiting messages?', animate);
        await hop('b', 's', '604 · inbox?', 'rsa', animate);
        await hop('s', 'b', '2104 · 🔒 RSA', 'rsa', animate);
        data.aesB ??= await unwrapKey(data.bobKeys, data.key.wrapped, data.key.raw);
        highlight('b');
        showAes('b');
        note('s', 'Forwarded it. It never saw the AES key.');
        note('b', 'Unlocked the AES key with his <strong>RSA private key</strong>.');
        addLog('Bob unlocks it with his private key. <b>Both now share the AES key.</b>', animate);
      },
    },
    {
      caption: 'Now Alice and Bob share a secret key. Alice\'s message is encrypted with AES.',
      async run(animate) {
        highlight('a');
        data.msg ??= await encryptText(data.key.raw, DEMO_TEXT);
        note('a', `Encrypted <strong>"${DEMO_TEXT}"</strong> with the shared AES key.`);
        addLog(`Alice encrypts "${DEMO_TEXT}" with AES-128-CBC → ${data.msg.cipher.length} B`, animate);
      },
    },
    {
      caption: 'The server only sees ciphertext. Bob decrypts it and reads the message.',
      async run(animate) {
        await deliver(data.msg, animate);
      },
    },
  ];

  // Steps 6 and "send your own": the encrypted message goes A -> server -> B.
  async function deliver(msg, animate) {
    setInspector(3, msg.cipher);
    addLog('Alice → Server: <b>603</b> type 3 (text message)', animate);
    await hop('a', 's', '603 · 🔒 AES', 'aes', animate);
    note('s', `Stored for Bob:<br><strong>${hex(msg.cipher, 8)}</strong><br><span class="lock">No AES key: just noise to the server.</span>`);
    addLog('Server → Alice: <b>2103</b> stored', animate);
    if (animate) await pause(400);
    addLog('Bob → Server: <b>604</b> any waiting messages?', animate);
    await hop('b', 's', '604 · inbox?', 'aes', animate);
    await hop('s', 'b', '2104 · 🔒 AES', 'aes', animate);
    const plain = await decryptText(data.aesB, msg);
    note('b', `Decrypted with the shared AES key:<br><strong>"${escapeHtml(plain)}"</strong>`);
    addLog(`Bob decrypts it: <b>"${escapeHtml(plain)}"</b>`, animate);
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
    btn.back.hidden = btn.next.hidden = !started;
    progress.hidden = !started;
    compose.hidden = step < steps.length;

    btn.back.disabled = playing || step <= 1;
    btn.next.disabled = playing || step >= steps.length;
    btn.play.textContent = playing ? 'Pause' : 'Play all';
    btn.play.setAttribute('aria-pressed', String(playing));

    progressLabel.textContent = `Step ${step} of ${steps.length}`;
    bars.forEach((bar, i) => bar.classList.toggle('on', i < step));
    caption.textContent = started ? steps[step - 1].caption : '';
    if (!started) caption.innerHTML = initial.caption;

    // Never leave keyboard focus on a button that just got hidden or disabled.
    // (Browsers move focus to <body> as soon as the focused button is hidden.)
    const f = document.activeElement;
    if (hadFocus && (!root.contains(f) || f.disabled || f.hidden)) {
      (step >= steps.length && !playing ? input : started ? btn.next : btn.start).focus();
    }
  }

  // Show step n. Going forward one step animates it; any other jump rebuilds silently.
  async function goTo(n) {
    if (busy) return;
    const forward = n === step + 1;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    const myRun = run;
    try {
      if (!forward) {
        clearDiagram();
        for (let i = 0; i < n - 1; i++) await steps[i].run(false);
      }
      step = n;
      updateControls();
      await steps[n - 1].run(forward);
    } catch (err) {
      if (err.message !== 'reset') addLog(`Something went wrong: ${err.message}`, true);
    } finally {
      if (myRun === run) {
        busy = false;
        root.removeAttribute('aria-busy');
      }
    }
  }

  async function playAll() {
    if (playing) { playing = false; updateControls(); return; } // acts as "Pause"
    if (busy) return;
    if (step >= steps.length) reset();
    playing = true;
    updateControls();
    const myRun = run;
    const myPlay = ++playId;
    const stillPlaying = () => playing && myRun === run && myPlay === playId;
    while (stillPlaying() && step < steps.length) {
      const t0 = performance.now();
      await goTo(step + 1);
      if (step >= steps.length) break;
      await sleep(Math.max(1200, PLAY_STEP_MS - (performance.now() - t0)));
    }
    if (stillPlaying()) { playing = false; updateControls(); }
  }

  async function sendOwn(e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (busy) return;
    busy = true;
    const myRun = run;
    try {
      caption.textContent = 'Your message takes the same path: Alice encrypts it, the server only stores ciphertext, Bob decrypts it.';
      highlight('a');
      const msg = await encryptText(data.key.raw, text);
      note('a', `Encrypted <strong>"${escapeHtml(text)}"</strong> with the shared AES key.`);
      addLog(`Alice encrypts "${escapeHtml(text)}" with AES-128-CBC → ${msg.cipher.length} B`, true);
      await pause(600);
      await deliver(msg, true);
    } catch (err) {
      if (err.message !== 'reset') addLog(`Something went wrong: ${err.message}`, true);
    } finally {
      if (myRun === run) busy = false;
    }
  }

  function reset() {
    run++;
    busy = false;
    playing = false;
    step = 0;
    data = {};
    root.removeAttribute('aria-busy');
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

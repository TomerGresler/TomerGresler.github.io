// Interactive MessageU diagram: Client A -> Server -> Client B.
// Step 1 exchanges an AES key wrapped with RSA. Step 2 sends AES-encrypted messages
// through a server that stores them but can't read them.
import { createRsaKeyPair, createWrappedKey, unwrapKey, encryptText, decryptText, hex } from './crypto.js';

const HOP_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function initFlow(root) {
  if (!root) return;

  const $ = (sel) => root.querySelector(sel);
  const stage = $('.flow-stage');
  const packet = $('.packet');
  const packetLabel = $('.packet-label');
  const nodes = { a: $('#node-a'), s: $('#node-server'), b: $('#node-b') };
  const wires = { as: $('[data-wire="ab"]'), sb: $('[data-wire="bc"]') };
  const log = $('.flow-log');
  const input = $('#flow-msg');
  const btn = {
    exchange: $('[data-action="exchange"]'),
    send: $('[data-action="send"]'),
    reset: $('[data-action="reset"]'),
  };
  const inspector = { len: $('[data-len]'), cipher: $('[data-cipher]'), title: $('.inspector-title') };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Initial texts, so Reset can restore them.
  const initialNotes = Object.fromEntries(
    Object.entries(nodes).map(([k, el]) => [k, el.querySelector('[data-note]').innerHTML])
  );

  let state = fresh();
  let rsaPromise = null; // Bob's RSA key pair, made once on first use

  function fresh() {
    return { busy: false, aesA: null, aesB: null, run: 0 };
  }

  // ---------- small helpers ----------
  const note = (key, html) => { nodes[key].querySelector('[data-note]').innerHTML = html; };
  const showAes = (key) => { nodes[key].querySelector('[data-aes]').hidden = false; };

  function addLog(html) {
    if (log.querySelector('.muted')) log.innerHTML = '';
    log.querySelectorAll('.new').forEach((li) => li.classList.remove('new'));
    const li = document.createElement('li');
    li.className = 'new';
    li.innerHTML = html;
    log.append(li);
    log.scrollTop = log.scrollHeight;
  }

  function setInspector(code, type, bytes) {
    inspector.title.textContent = `Request ${code} on the wire (message type ${type})`;
    inspector.len.textContent = `${bytes.length} B`;
    inspector.cipher.innerHTML = `content: <b>${hex(bytes, 24)}</b>`;
  }

  // Center of a node, relative to the stage.
  function centerOf(el) {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  }

  // Animate the packet from one node to another along the wire between them.
  async function hop(from, to, label, kind = 'aes') {
    const run = state.run;
    const wire = from === 's' ? wires[to === 'a' ? 'as' : 'sb'] : wires[from === 'a' ? 'as' : 'sb'];
    packetLabel.textContent = label;
    packet.classList.toggle('rsa', kind === 'rsa');
    nodes[from].classList.add('active');
    wire.classList.add('active');

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

    nodes[from].classList.remove('active');
    wire.classList.remove('active');
    nodes[to].classList.add('active');
    await pause(450);
    nodes[to].classList.remove('active');
    if (run !== state.run) throw new Error('reset'); // Reset was pressed mid-animation
  }

  const pause = (ms) => sleep(reduced.matches ? Math.min(ms, 300) : ms);

  // Run one sequence, keeping buttons disabled while it plays.
  async function play(sequence) {
    if (state.busy) return;
    const current = state;
    current.busy = true;
    btn.exchange.disabled = true;
    btn.send.disabled = true;
    btn.send.classList.remove('pulse');
    try {
      await sequence();
    } catch (err) {
      if (err.message !== 'reset') addLog(`Something went wrong: ${err.message}`);
      return;
    } finally {
      current.busy = false;
    }
    btn.send.disabled = !state.aesB;
    btn.exchange.disabled = !!state.aesB;
  }

  // ---------- Step 1: key exchange ----------
  const exchange = () => play(async () => {
    const bobKeys = await (rsaPromise ??= createRsaKeyPair());

    addLog('Alice → Server: <b>602</b> give me Bob\'s public key');
    await hop('a', 's', '602 · pub key?', 'rsa');
    note('s', 'Looks up Bob in its clients table.');
    await hop('s', 'a', '2102 · Bob\'s pub key', 'rsa');
    addLog('Server → Alice: <b>2102</b> Bob\'s RSA public key');

    const { raw, wrapped } = await createWrappedKey(bobKeys);
    state.aesA = raw;
    showAes('a');
    note('a', 'Made a random <strong>AES-128</strong> key and wrapped it with Bob\'s public key.');
    addLog(`Alice wraps a new AES key with RSA-OAEP → ${wrapped.length} B`);
    setInspector(603, 2, wrapped);
    await pause(500);

    addLog('Alice → Server: <b>603</b> type 2 (symmetric key)');
    await hop('a', 's', '603 · 🔒 RSA', 'rsa');
    note('s', `Stored for Bob:<br><strong>${hex(wrapped, 8)}</strong><br><span class="lock">No private key, can't unwrap.</span>`);
    addLog('Server → Alice: <b>2103</b> stored');
    await pause(600);

    addLog('Bob → Server: <b>604</b> any waiting messages?');
    await hop('s', 'b', '2104 · 🔒 RSA', 'rsa');
    state.aesB = await unwrapKey(bobKeys, wrapped, raw);
    showAes('b');
    note('b', 'Unwrapped the AES key with his <strong>RSA private key</strong>.');
    addLog('Bob unwraps it with his private key. <b>Both now share the AES key.</b>');
    note('s', 'Waiting. It never saw the AES key.');
    btn.send.classList.add('pulse');
  });

  // ---------- Step 2: send an encrypted message ----------
  const send = () => play(async () => {
    const text = input.value.trim() || 'Hi Bob!';
    const msg = await encryptText(state.aesA, text);
    setInspector(603, 3, msg.cipher);
    note('a', `Encrypted <strong>"${escapeHtml(text)}"</strong> with the shared AES key.`);
    addLog(`Alice encrypts "${escapeHtml(text)}" with AES-128-CBC → ${msg.cipher.length} B`);

    addLog('Alice → Server: <b>603</b> type 3 (text message)');
    await hop('a', 's', '603 · 🔒 AES');
    note('s', `Stored for Bob:<br><strong>${hex(msg.cipher, 8)}</strong><br><span class="lock">No AES key: just noise to the server.</span>`);
    addLog('Server → Alice: <b>2103</b> stored');
    await pause(700);

    addLog('Bob → Server: <b>604</b> any waiting messages?');
    await hop('s', 'b', '2104 · 🔒 AES');
    const plain = await decryptText(state.aesB, msg);
    note('b', `Decrypted with the shared AES key:<br><strong>"${escapeHtml(plain)}"</strong>`);
    addLog(`Bob decrypts it: <b>"${escapeHtml(plain)}"</b>`);
  });

  function reset() {
    state = { ...fresh(), run: state.run + 1 };
    packet.getAnimations().forEach((a) => a.cancel());
    Object.entries(nodes).forEach(([k, el]) => {
      el.classList.remove('active');
      el.querySelector('[data-note]').innerHTML = initialNotes[k];
      const aes = el.querySelector('[data-aes]');
      if (aes) aes.hidden = true;
    });
    Object.values(wires).forEach((w) => w.classList.remove('active'));
    log.innerHTML = '<li class="muted">Press "Exchange key" to start.</li>';
    inspector.title.textContent = 'Request 603 on the wire';
    inspector.len.textContent = 'n B';
    inspector.cipher.textContent = 'No packet sent yet.';
    btn.exchange.disabled = false;
    btn.send.disabled = true;
    btn.send.classList.remove('pulse');
  }

  btn.exchange.addEventListener('click', exchange);
  btn.send.addEventListener('click', send);
  btn.reset.addEventListener('click', reset);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btn.send.disabled) send();
  });

  // Start the key exchange by itself the first time the demo is in view.
  if (!reduced.matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setTimeout(() => { if (!btn.exchange.disabled && !state.aesB) exchange(); }, 700);
    }, { threshold: 0.55 });
    io.observe(stage);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

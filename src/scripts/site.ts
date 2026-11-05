const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

// ---------- sound: a knock, and an echo that says the head is empty ----------
let audio: AudioContext | undefined;
let muted = false;
const soundBtn = document.querySelector<HTMLButtonElement>('[data-sound]');
soundBtn?.addEventListener('click', () => {
  muted = !muted;
  soundBtn.textContent = muted ? '🔇' : '🔊';
  soundBtn.setAttribute('aria-pressed', String(!muted));
  if (muted) clip?.pause();
});

function beep() {
  if (muted) return;
  audio ||= new AudioContext();
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.value = 1046;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + 0.2);
}

function knockSound(echo: number) {
  if (muted) return;
  audio ||= new AudioContext();
  const ctx = audio;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.8;
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.19;
  const feedback = ctx.createGain();
  feedback.gain.value = echo;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1400;
  delay.connect(tone).connect(feedback).connect(delay);
  out.connect(ctx.destination);
  out.connect(delay);
  tone.connect(ctx.destination);

  for (const [at, pitch] of [[0, 230], [0.13, 190]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(pitch, t + at);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + at + 0.12);
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.75, t + at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.13);
    osc.connect(g).connect(out);
    osc.start(t + at);
    osc.stop(t + at + 0.15);

    // the wooden click on top of the thump
    const len = Math.floor(ctx.sampleRate * 0.02);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(band).connect(ng).connect(out);
    noise.start(t + at);
  }
  setTimeout(() => out.disconnect(), 4000);
}

let clip: HTMLAudioElement | undefined;
// a clip plays with its own words in the bubble, each one shown as it's said
// (timings from Whisper, saved beside each clip by tools/clips.py)
let syncRaf = 0;
function stopClip() {
  clip?.pause();
  cancelAnimationFrame(syncRaf);
}
async function playClip(src: string | undefined, into?: HTMLElement) {
  stopClip();
  if (!src || muted) return false;
  let words: { w: string; t: number }[] = [];
  let rtl = false;
  try {
    const timing = await fetch(src.replace(/\.mp3(\?.*)?$/, '.json')).then((r) => r.json());
    words = timing.words;
    rtl = !!timing.rtl;
  } catch {
    // no timings: the bubble keeps its punch line
  }
  const a = new Audio(src);
  clip = a;
  // Hebrew clips keep the English punch line; the note says what you're hearing
  if (into && rtl) {
    const src = into.parentElement?.querySelector('[data-cap-src]');
    if (src && !src.textContent!.includes('Hebrew')) src.textContent += ' · in Hebrew';
  }
  if (into && words.length && !rtl) {
    into.dir = rtl ? 'rtl' : 'ltr';
    into.replaceChildren(...words.map((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = (i ? ' ' : '\u201c') + w.w + (i === words.length - 1 ? '\u201d' : '');
      return span;
    }));
    const spans = [...into.children] as HTMLElement[];
    const tick = () => {
      if (clip !== a) return;
      const now = a.currentTime;
      spans.forEach((sp, i) => sp.classList.toggle('said', words[i].t <= now + 0.05));
      if (!a.paused && !a.ended) syncRaf = requestAnimationFrame(tick);
      else if (a.ended) spans.forEach((sp) => sp.classList.add('said'));
    };
    a.addEventListener('playing', () => { syncRaf = requestAnimationFrame(tick); });
    // a backup that keeps going when frames are throttled (background tabs)
    a.addEventListener('timeupdate', () => clip === a && spans.forEach((sp, i) => sp.classList.toggle('said', words[i].t <= a.currentTime + 0.05)));
    a.addEventListener('ended', () => spans.forEach((sp) => sp.classList.add('said')));
  }
  // wait for the bubble to pop before speaking
  setTimeout(() => clip === a && a.play().catch(() => into?.querySelectorAll('.w').forEach((w) => w.classList.add('said'))), 350);
  return words.length > 0;
}

// ---------- shared ----------
const totalEl = document.querySelector<HTMLElement>('[data-total]')!;
const countBox = document.querySelector<HTMLElement>('.bar__count')!;
let total = 0;
const statsEl = document.querySelector<HTMLElement>('[data-stats]');
function bumpTotal() {
  total++;
  totalEl.textContent = String(total);
  if (statsEl) statsEl.textContent = `You knocked ${total} time${total === 1 ? '' : 's'}. Brains found: 0.`;
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(18);
  countBox.classList.remove('bump');
  void countBox.offsetWidth;
  countBox.classList.add('bump');
}

const toast = document.querySelector<HTMLElement>('.toast')!;
let toastTimer = 0;
function say(msg: string) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

async function share(title: string, hash = '') {
  const url = `${location.origin}${location.pathname}${hash}`;
  const text = 'Knock on their heads. Listen to the echo.';
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      // cancelled: fall through to copying
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied');
  } catch {
    say(url);
  }
}

document.querySelector('[data-share-all]')?.addEventListener('click', () => share('The stupidest thing you can do is pay your taxes'));

const ECHOES = ['echo…', 'hello?', '…echo', 'anyone?', 'echo… echo…'];

// ---------- one chapter per head ----------
const knockers = new Map<HTMLElement, () => void>();
const onShow = new Map<HTMLElement, (on: boolean) => void>();
for (const chapter of document.querySelectorAll<HTMLElement>('[data-person]')) {
  const stage = chapter.querySelector<HTMLElement>('[data-stage]')!;
  const fx = stage.querySelector<HTMLElement>('.fx')!;
  const cards = [...chapter.querySelectorAll<HTMLElement>('[data-card]')];
  const dots = [...chapter.querySelectorAll<HTMLElement>('.dots li')];
  const name = chapter.dataset.name!;
  const vars = getComputedStyle(stage);
  const pct = (v: string) => parseFloat(vars.getPropertyValue(v)) / 100;
  const head = { cx: pct('--cx'), rx: pct('--rx'), top: pct('--top'), cut: pct('--cut'), mid: pct('--mid') };

  // step 0: hint; 1: scan (the head opens); 2..: quotes
  let step = 0;
  let timers: number[] = [];

  function show(next: number) {
    timers.forEach(clearTimeout);
    timers = [];
    step = next;
    cards.forEach((card, i) => {
      const d = step - i;
      card.style.setProperty('--d', String(Math.max(0, d)));
      card.dataset.state = d === 0 ? 'now' : d > 0 ? (i === 0 ? 'gone' : 'past') : 'next';
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('on', i < step);
      dot.classList.toggle('now', i === step - 1);
    });
    const card = cards[step];
    stopClip();
    setCaption(card);

    // a line said more than once is said again, a beat apart
    card.querySelectorAll<HTMLElement>('[data-rep]').forEach((rep, k) => {
      rep.classList.remove('show');
      timers.push(window.setTimeout(() => rep.classList.add('show'), 1300 * (k + 1)));
    });
    const count = card.querySelector<HTMLElement>('[data-count]');
    if (count) rollTo(count, Number(count.dataset.count));
    if (step > 1) echoWord(card.dataset.echo ?? '');
  }

  // the one line under the head: what he said, and where
  const capText = chapter.querySelector<HTMLElement>('[data-cap-text]')!;
  const capSrc = chapter.querySelector<HTMLElement>('[data-cap-src]')!;
  const capBox = capText.parentElement!;
  function setCaption(card: HTMLElement) {
    let text = '';
    let src = '';
    const t = (sel: string) => card.querySelector(sel)?.textContent?.trim() ?? '';
    if (card.classList.contains('card--listing')) {
      text = 'Knock on his head.';
      src = t('header span');
    } else if (card.classList.contains('card--scan')) {
      text = [...card.querySelectorAll('dl > div')].map((r) => `${r.querySelector('dt')!.textContent}: ${r.querySelector('dd')!.textContent}`).join(' · ');
      src = 'Head scan';
    } else if (card.dataset.kind === 'chat') {
      const msgs = [...card.querySelectorAll('.chat__msg')];
      text = msgs.map((m) => `${m.querySelector('.chat__from')!.textContent}: ${m.querySelector('p')!.textContent}`).join('  /  ');
      src = `${t('header b')} · ${t('footer')}`;
    } else if (card.dataset.kind === 'stat') {
      text = `${card.querySelector('[data-count]')!.getAttribute('data-count')} seats. Needed 61.`;
      src = t('header span:last-child');
    } else {
      text = `“${t('.card__text, .tv__quote').replace(/^[A-Z]+:\s*/, '').replace(/\s*\((again|yes, again)\)$/, '')}”`;
      src = t('header span:last-child') || t('.tv__show') || t('footer');
    }
    // the short punch, not the paragraph
    if (card.dataset.punch) text = card.dataset.kind === 'chat' || card.dataset.kind === 'stat' ? card.dataset.punch : `\u201c${card.dataset.punch}\u201d`;
    if (card.classList.contains('card--scan')) text = 'Brain: not detected.';
    if (card.classList.contains('card--scan')) src = 'Head scan';
    capBox.classList.toggle('empty', card.classList.contains('card--listing'));
    capBox.classList.toggle('talking', !!card.dataset.audio && !muted);
    capBox.classList.remove('swap');
    void capBox.offsetWidth;
    capBox.classList.add('swap');
    capText.dir = 'ltr';
    capText.textContent = text;
    playClip(card.dataset.audio, capText);
    capSrc.textContent = src;
  }

  function rollTo(el: HTMLElement, to: number) {
    const start = performance.now();
    const dur = reduced ? 0 : 1600;
    const tick = (now: number) => {
      const t = dur ? Math.min(1, (now - start) / dur) : 1;
      const e = 1 - (1 - t) ** 4;
      el.textContent = String(Math.round(to * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function rings(x: number, y: number, open: boolean) {
    if (reduced) return;
    const n = open ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const r = document.createElement('span');
      r.className = 'ring';
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      r.style.animationDelay = `${i * 170}ms`;
      fx.appendChild(r);
      setTimeout(() => r.remove(), 1500 + i * 170);
    }
    const e = document.createElement('span');
    e.className = 'echo';
    e.textContent = ECHOES[Math.floor(Math.random() * ECHOES.length)];
    e.style.left = `${x}px`;
    e.style.top = `${y - 30}px`;
    fx.appendChild(e);
    setTimeout(() => e.remove(), 1600);
  }

  function motes() {
    if (reduced) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (let i = 0; i < 22; i++) {
      const m = document.createElement('span');
      m.className = 'mote';
      m.style.left = `${(head.cx + (Math.random() - 0.5) * head.rx * 1.4) * w}px`;
      m.style.top = `${head.cut * h}px`;
      m.style.setProperty('--s', `${1.5 + Math.random() * 3}px`);
      m.style.setProperty('--x', `${(Math.random() - 0.5) * 120}px`);
      m.style.setProperty('--y', `${-80 - Math.random() * 200}px`);
      m.style.setProperty('--d', `${2 + Math.random() * 2.5}s`);
      m.style.animationDelay = `${200 + Math.random() * 600}ms`;
      fx.appendChild(m);
      setTimeout(() => m.remove(), 5500);
    }
  }

  // ---------- what each head does when knocked ----------
  const inside = stage.dataset.inside;
  const live = chapter.querySelector<HTMLElement>('[data-live="poops"]');
  const poopBox = stage.querySelector<HTMLElement>('.poops');
  const badges = [...stage.querySelectorAll<HTMLElement>('.badges li')];
  let poops = 0;
  const paras = [...stage.querySelectorAll<HTMLElement>('.para')];
  let para = 0;

  function plopSound() {
    if (muted) return;
    audio ||= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.frequency.setValueAtTime(520, t + 0.45);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.62);
    g.gain.setValueAtTime(0.0001, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.47);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
    osc.connect(g).connect(audio.destination);
    osc.start(t + 0.45);
    osc.stop(t + 0.7);
  }

  function nuts(n: number) {
    if (reduced) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const g = h * 0.0011;
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img');
      img.className = 'nut';
      img.src = `/img/objects/peanut-${1 + (i % 2)}.webp`;
      img.alt = '';
      fx.appendChild(img);
      let x = head.cx * w + (Math.random() - 0.5) * w * 0.08;
      let y = head.top * h - w * 0.12;
      let vx = (Math.random() - 0.5) * w * 0.022;
      let vy = -(0.012 + Math.random() * 0.016) * h;
      let r = Math.random() * 360;
      const vr = (Math.random() - 0.5) * 22;
      const born = performance.now() + i * 40;
      const frame = (now: number) => {
        if (now < born) return requestAnimationFrame(frame);
        vy += g;
        x += vx;
        y += vy;
        r += vr;
        img.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${r}deg)`;
        if (y < h + 80) requestAnimationFrame(frame);
        else img.remove();
      };
      requestAnimationFrame(frame);
    }
  }

  function poop() {
    if (!poopBox) return;
    poops++;
    if (live) live.textContent = String(poops);
    const p = document.createElement('span');
    p.className = 'poop';
    p.textContent = '💩';
    // behind the cat, on the floor of the skull, piling up
    const spread = ((poops - 1) % 5) - 2;
    p.style.left = `${(head.cx - head.rx * 0.42 + spread * head.rx * 0.07) * 100}%`;
    p.style.top = `${head.cut * 100 + 0.6 - Math.floor((poops - 1) / 5) * 2.2}%`;
    poopBox.appendChild(p);
    plopSound();
  }

  const HAS = ['HA', 'HAHA', 'HA HA HA', 'hehe', 'HAHAHA', 'lol'];
  function laugh(n: number) {
    if (reduced) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (let i = 0; i < n; i++) {
      const t = document.createElement('span');
      t.className = 'ha';
      t.textContent = HAS[Math.floor(Math.random() * HAS.length)];
      t.style.left = `${(head.cx + (i - (n - 1) / 2) * head.rx * 0.55 + (Math.random() - 0.5) * head.rx * 0.2) * w}px`;
      t.style.top = `${(head.top + Math.random() * (head.cut - head.top) * 0.6) * h}px`;
      t.style.setProperty('--r', `${(Math.random() - 0.5) * 24}deg`);
      t.style.setProperty('--x', `${(Math.random() - 0.5) * 80}px`);
      t.style.animationDelay = `${i * 160}ms`;
      fx.appendChild(t);
      setTimeout(() => t.remove(), 1600 + i * 160);
    }
  }

  function react(opening: boolean) {
    if (inside === 'bucket') nuts(opening ? 14 : 8);
    if (inside === 'cat' && !opening) poop();
    if (inside === 'bomb') {
      // a different worry every knock; only the Ayatollah laughs
      para = opening ? 0 : (para + 1) % paras.length;
      paras.forEach((el, i) => el.classList.toggle('on', i === para));
      stage.classList.toggle('para-bomb', para === 0);
      if (para === 0) setTimeout(() => laugh(opening ? 3 : 4), opening ? 1100 : 300);
    }
    if (inside === 'bottle') {
      const next = badges.find((b) => !b.classList.contains('on'));
      if (next) setTimeout(() => next.classList.add('on'), opening ? 900 : 0);
    }
  }

  function reset() {
    poops = 0;
    if (live) live.textContent = '0';
    poopBox?.replaceChildren();
    badges.forEach((b) => b.classList.remove('on'));
  }

  // ---------- the face reacts: ML-warped expressions, swapped in on a knock ----------
  const faces = [...stage.querySelectorAll<HTMLElement>('[data-face]')];
    // once knocked, the face stays pulled; it only relaxes when the head closes
  function express(kind: 'shock' | 'wince' | null) {
    if (!faces.length) return;
    faces.forEach((f) => f.classList.toggle('on', f.dataset.face === kind));
  }

  // the last word of a quote bounces round the empty skull
  function echoWord(word: string) {
    if (reduced || !word) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (let i = 0; i < 3; i++) {
      const e = document.createElement('span');
      e.className = 'word-echo';
      e.textContent = `…${word}`;
      e.style.left = `${(head.cx + (i - 1) * head.rx * 0.5) * w}px`;
      e.style.top = `${(head.top + (head.cut - head.top) * (0.25 + i * 0.2)) * h}px`;
      e.style.fontSize = `${Math.max(14, w * (0.07 - i * 0.015))}px`;
      e.style.setProperty('--o', String(1 - i * 0.28));
      e.style.setProperty('--x', `${(i - 1) * 30}px`);
      e.style.animationDelay = `${300 + i * 380}ms`;
      fx.appendChild(e);
      setTimeout(() => e.remove(), 2400 + i * 380);
    }
  }

  // ---------- brain activity: flat, with a blip when knocked ----------
  const eeg = stage.querySelector<HTMLCanvasElement>('.eeg canvas')!;
  const g2 = eeg.getContext('2d')!;
  const trace: number[] = [];
  const pending: number[] = [];
  let eegOn = false;
  function blip() {
    pending.push(0, -0.15, 0.9, -0.55, 0.25, -0.1, 0);
    setTimeout(beep, 260);
  }
  function drawEeg() {
    if (!eegOn) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = eeg.clientWidth * dpr;
    const ch = eeg.clientHeight * dpr;
    if (eeg.width !== cw || eeg.height !== ch) {
      eeg.width = cw;
      eeg.height = ch;
      trace.length = 0;
    }
    const step = 3 * dpr;
    const n = Math.ceil(cw / step) + 1;
    for (let k = 0; k < 2; k++) trace.push(pending.length ? pending.shift()! : (Math.random() - 0.5) * 0.02);
    while (trace.length > n) trace.shift();
    g2.clearRect(0, 0, cw, ch);
    g2.lineWidth = 2 * dpr;
    g2.strokeStyle = '#39ff88';
    g2.shadowColor = '#39ff88';
    g2.shadowBlur = 8 * dpr;
    g2.beginPath();
    const base = ch * 0.68;
    trace.forEach((v, i) => {
      const x = cw - (trace.length - 1 - i) * step;
      const y = base - v * ch * 0.45;
      i ? g2.lineTo(x, y) : g2.moveTo(x, y);
    });
    g2.stroke();
    requestAnimationFrame(drawEeg);
  }
  // the monitor only runs for the head on screen
  function eegRun(on: boolean) {
    const was = eegOn;
    eegOn = on && !reduced;
    if (eegOn && !was) requestAnimationFrame(drawEeg);
  }

  // ---------- a meme of the moment, as an image to save or share ----------
  const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
  function caption(): [string, string] {
    const card = cards[step];
    const q = card.querySelector('.card__text, .tv__quote, .chat__msg:last-child p, .stat__note');
    if (q && step > 1) {
      const src = card.querySelector('header span:last-child, .tv__show, footer')?.textContent ?? '';
      return [q.textContent!.trim().replace(/^[A-Z]+:\s*/, ''), src.trim()];
    }
    return ['Knock knock.', 'Nobody home.'];
  }
  async function meme() {
    const id = chapter.id;
    const W = 1080;
    const body = await load(`/img/cut/${id}-body.webp`);
    const H = Math.round((W * body.naturalHeight) / body.naturalWidth);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d')!;
    const tone = getComputedStyle(stage).getPropertyValue('--tone').trim();
    x.fillStyle = tone;
    x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.8);
    glow.addColorStop(0, 'rgba(255,255,255,.28)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = glow;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,.14)';
    x.font = `italic ${W * 0.34}px "Instrument Serif", serif`;
    x.textAlign = 'center';
    x.fillText(chapter.querySelector('.stage__name')!.textContent!, W / 2, H * 0.3);
    x.drawImage(body, 0, 0, W, H);
    x.drawImage(await load(`/img/cut/${id}-head.webp`), 0, 0, W, H);
    const face = stage.querySelector<HTMLImageElement>('.face.on') ?? stage.querySelector<HTMLImageElement>('[data-face="shock"]')!;
    const fs = face.style;
    x.drawImage(await load(face.src), (parseFloat(fs.left) / 100) * W, (parseFloat(fs.top) / 100) * H, (parseFloat(fs.width) / 100) * W, (parseFloat(fs.height) / 100) * H);
    // the stamp
    x.save();
    x.translate(W * 0.74, H * 0.1);
    x.rotate(-0.12);
    x.strokeStyle = '#ff2a1a';
    x.lineWidth = 8;
    x.strokeRect(-210, -52, 420, 104);
    x.fillStyle = '#ff2a1a';
    x.font = `700 44px "JetBrains Mono", monospace`;
    x.fillText('BRAIN: NONE', 0, 16);
    x.restore();
    // the quote, on a dark band over the suit
    const [quote, source] = caption();
    const band = x.createLinearGradient(0, H * 0.55, 0, H);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.35, 'rgba(0,0,0,.78)');
    band.addColorStop(1, 'rgba(0,0,0,.92)');
    x.fillStyle = band;
    x.fillRect(0, H * 0.55, W, H * 0.45);
    x.textAlign = 'left';
    x.fillStyle = '#fff';
    let size = 64;
    let lines: string[] = [];
    do {
      x.font = `${size}px "Instrument Serif", serif`;
      lines = [];
      let line = '';
      for (const word of `“${quote}”`.split(' ')) {
        const t = line ? `${line} ${word}` : word;
        if (x.measureText(t).width > W - 120 && line) {
          lines.push(line);
          line = word;
        } else line = t;
      }
      lines.push(line);
      size -= 4;
    } while (lines.length * size * 1.15 > H * 0.26 && size > 30);
    const lh = (size + 4) * 1.12;
    let y = H - 130 - (lines.length - 1) * lh;
    for (const l of lines) {
      x.fillText(l, 60, y);
      y += lh;
    }
    x.font = `500 26px "JetBrains Mono", monospace`;
    x.fillStyle = 'rgba(255,255,255,.65)';
    const full = `${chapter.dataset.name} · ${source}`;
    let foot = full;
    while (x.measureText(foot).width > W - 120 - 260 && foot.length > 10) foot = foot.slice(0, -2);
    x.fillText(foot === full ? foot : `${foot.trimEnd()}…`, 60, H - 70);
    x.textAlign = 'right';
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillText('anyone home?', W - 60, H - 70);

    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    const file = new File([blob], `anyone-home-${id}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'The stupidest thing you can do is pay your taxes' });
        return;
      } catch {
        // cancelled: fall back to saving it
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say('Meme saved');
  }

  function knock(x?: number, y?: number) {
    bumpTotal();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const px = x ?? head.cx * w;
    const py = y ?? head.mid * h;

    stage.classList.remove('knock');
    void stage.offsetWidth;
    stage.classList.add('knock', 'knocked');
    blip();

    if (step >= cards.length - 1) {
      // out of material: close up, start over
      stage.classList.remove('open');
      knockSound(0.15);
      rings(px, py, false);
      express(null);
      setTimeout(reset, 900);
      show(0);
      return;
    }
    const opening = step === 0;
    knockSound(opening ? 0.62 : 0.5);
    rings(px, py, true);
    if (opening) {
      // the lid always drops cleanly to the left
      // the cap lands beside the head, on screen, so you can see it
      const side = -1;
      const sw = stage.clientWidth;
      const sr = stage.getBoundingClientRect();
      const lidHalf = head.rx * sw;
      const centre = sr.left + head.cx * sw;
      const room = side > 0 ? innerWidth - 90 - centre : centre - 12;
      const dx = Math.max(lidHalf * 0.6, Math.min(lidHalf * 2.05, room - lidHalf * 0.9));
      stage.style.setProperty('--lid-x', `${side * dx}px`);
      stage.style.setProperty('--lid-y', `${(head.cut - head.top) * stage.clientHeight * 0.7}px`);
      stage.style.setProperty('--lid-r', `${side * 35}deg`);
      stage.classList.add('open');
      stage.classList.remove('scanning');
      motes();
    }
    express(opening ? 'shock' : 'wince');
    react(opening);
    show(step + 1);
  }

  // the button is the keyboard way in; a click anywhere on the photo knocks too
  stage.addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect();
    const fromPointer = e.detail > 0;
    knock(fromPointer ? e.clientX - r.left : undefined, fromPointer ? e.clientY - r.top : undefined);
  });
  chapter.querySelector('[data-knock]')!.addEventListener('click', () => knock());
  chapter.querySelector('[data-xray]')!.addEventListener('click', () => sweep(true));
  chapter.querySelector('[data-meme]')!.addEventListener('click', () => meme().catch(() => say('Could not make the meme')));
  knockers.set(chapter, () => knock());
  chapter.querySelector('[data-share]')!.addEventListener('click', () => share(`Knock on ${name}'s head`, `#${chapter.id}`));

  // x-ray lens follows the pointer while the head is closed
  const setLens = (clientX: number, clientY: number) => {
    const r = stage.getBoundingClientRect();
    stage.style.setProperty('--mx', `${((clientX - r.left) / r.width) * 100}%`);
    stage.style.setProperty('--my', `${((clientY - r.top) / r.height) * 100}%`);
  };
  stage.addEventListener('pointermove', (e) => {
    // a mouse scans on hover; a finger scans while it's dragging
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    sweeping = false;
    setLens(e.clientX, e.clientY);
    stage.classList.add('scanning');
  });
  stage.addEventListener('pointerleave', () => stage.classList.remove('scanning'));

  // the first time the head comes into view, the scanner sweeps it once
  let swept = false;
  let sweeping = false;
  function sweep(force = false) {
    if (reduced || (swept && !force)) return;
    swept = true;
    sweeping = true;
    stage.classList.add('scanning');
    const start = performance.now();
    const dur = 2200;
    const frame = (now: number) => {
      if (!sweeping) return;
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = head.cx - head.rx * 0.9 + head.rx * 1.8 * e;
      const y = head.mid + Math.sin(e * Math.PI) * -0.03;
      stage.style.setProperty('--mx', `${x * 100}%`);
      stage.style.setProperty('--my', `${y * 100}%`);
      if (t < 1) requestAnimationFrame(frame);
      else setTimeout(() => sweeping && stage.classList.remove('scanning'), 500);
    };
    requestAnimationFrame(frame);
  }

  let seen = false;
  onShow.set(chapter, (on) => {
    eegRun(on);
    if (on && !seen) {
      seen = true;
      setTimeout(() => !stage.classList.contains('open') && sweep(), 700);
    }
  });

  show(0);
}

// ---------- ambient motion ----------
const hero = document.querySelector<HTMLElement>('.hero__light');
if (hero && finePointer && !reduced) {
  addEventListener('pointermove', (e) => {
    hero.style.setProperty('--hx', `${(e.clientX / innerWidth) * 100}%`);
    hero.style.setProperty('--hy', `${(e.clientY / innerHeight) * 100}%`);
  });
}

// ---------- one head on screen: pick it in the dock, search for it, or arrow through ----------
const chapters = [...knockers.keys()];
const picks = [...document.querySelectorAll<HTMLButtonElement>('[data-pick]')];
let current = chapters[0];
function activate(ch: HTMLElement) {
  if (ch === current && ch.classList.contains('is-active')) return;
  for (const c of chapters) {
    const on = c === ch;
    c.classList.toggle('is-active', on);
    c.classList.toggle('in-view', on);
    c.setAttribute('aria-hidden', String(!on));
    onShow.get(c)!(on);
  }
  for (const b of picks) b.setAttribute('aria-current', String(b.dataset.pick === ch.id));
  stopClip();
  current = ch;
  history.replaceState(null, '', `#${ch.id}`);
}
for (const b of picks) b.addEventListener('click', () => activate(document.getElementById(b.dataset.pick!)!));
const start = chapters.find((c) => `#${c.id}` === location.hash) ?? chapters[0];
current = undefined as unknown as HTMLElement;
activate(start);
scrollTo(0, 0);
// a shared link to another head (#vance) switches to it, even without a reload
addEventListener('hashchange', () => {
  const ch = chapters.find((c) => `#${c.id}` === location.hash);
  if (ch) activate(ch);
  scrollTo(0, 0);
});

const search = document.querySelector<HTMLInputElement>('[data-search]');
const none = document.querySelector<HTMLElement>('[data-none]')!;
search?.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  const hits = picks.filter((b) => !q || b.dataset.search!.includes(q));
  for (const b of picks) b.parentElement!.hidden = !hits.includes(b);
  none.hidden = hits.length > 0;
  if (q && hits.length) activate(document.getElementById(hits[0].dataset.pick!)!);
});
// the search stays tucked behind its icon until asked for
const searchBox = document.querySelector<HTMLElement>('[data-search-box]')!;
const searchBtn = document.querySelector<HTMLButtonElement>('[data-search-toggle]')!;
function openSearch(open: boolean) {
  searchBox.classList.toggle('open', open);
  searchBtn.setAttribute('aria-expanded', String(open));
  if (open) search?.focus();
  else if (search) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
    search.blur();
  }
}
searchBtn.addEventListener('click', () => openSearch(!searchBox.classList.contains('open')));
search?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') openSearch(false);
});
search?.addEventListener('blur', () => setTimeout(() => {
  if (!searchBox.contains(document.activeElement)) openSearch(false);
}, 150));

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea')) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = chapters.indexOf(current);
  activate(chapters[(i + (e.key === 'ArrowRight' ? 1 : chapters.length - 1)) % chapters.length]);
});

// space knocks on the head on screen
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || (e.target as HTMLElement).closest('input, textarea, button')) return;
  e.preventDefault();
  knockers.get(current)!();
});

// ?knock=3 knocks that many times on load (for previews and screenshots)
const auto = Number(new URLSearchParams(location.search).get('knock') || 0);
for (let i = 0; i < Math.min(auto, 20); i++) setTimeout(() => knockers.get(current)!(), 600 + i * 900);

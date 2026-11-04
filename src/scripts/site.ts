const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

// ---------- sound: a knock, and an echo that says the head is empty ----------
let audio: AudioContext | undefined;
function knockSound(echo: number) {
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
function playClip(src?: string) {
  if (!src) return;
  clip?.pause();
  clip = new Audio(src);
  clip.play().catch(() => {});
}

// ---------- shared ----------
const totalEl = document.querySelector<HTMLElement>('[data-total]')!;
const countBox = document.querySelector<HTMLElement>('.bar__count')!;
let total = 0;
function bumpTotal() {
  total++;
  totalEl.textContent = String(total);
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

document.querySelector('[data-share-all]')?.addEventListener('click', () => share('Anyone home?'));

const ECHOES = ['echo…', 'hello?', '…echo', 'anyone?', 'echo… echo…'];

// ---------- one chapter per head ----------
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
    playClip(card.dataset.audio);

    // a line said more than once is said again, a beat apart
    card.querySelectorAll<HTMLElement>('[data-rep]').forEach((rep, k) => {
      rep.classList.remove('show');
      timers.push(window.setTimeout(() => rep.classList.add('show'), 1300 * (k + 1)));
    });
    const count = card.querySelector<HTMLElement>('[data-count]');
    if (count) rollTo(count, Number(count.dataset.count));
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

  function knock(x?: number, y?: number) {
    bumpTotal();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const px = x ?? head.cx * w;
    const py = y ?? head.mid * h;

    stage.classList.remove('knock');
    void stage.offsetWidth;
    stage.classList.add('knock');

    if (step >= cards.length - 1) {
      // out of material: close up, start over
      stage.classList.remove('open');
      knockSound(0.15);
      rings(px, py, false);
      show(0);
      return;
    }
    const opening = step === 0;
    knockSound(opening ? 0.62 : 0.5);
    rings(px, py, true);
    if (opening) {
      stage.classList.add('open');
      stage.classList.remove('scanning');
      motes();
    }
    show(step + 1);
  }

  // the button is the keyboard way in; a click anywhere on the photo knocks too
  stage.addEventListener('click', (e) => {
    const r = stage.getBoundingClientRect();
    const fromPointer = e.detail > 0;
    knock(fromPointer ? e.clientX - r.left : undefined, fromPointer ? e.clientY - r.top : undefined);
  });
  chapter.querySelector('[data-knock]')!.addEventListener('click', () => knock());
  chapter.querySelector('[data-share]')!.addEventListener('click', () => share(`Knock on ${name}'s head`, `#${chapter.id}`));

  // x-ray lens follows the pointer while the head is closed
  const setLens = (clientX: number, clientY: number) => {
    const r = stage.getBoundingClientRect();
    stage.style.setProperty('--mx', `${((clientX - r.left) / r.width) * 100}%`);
    stage.style.setProperty('--my', `${((clientY - r.top) / r.height) * 100}%`);
  };
  stage.addEventListener('pointermove', (e) => {
    if (stage.classList.contains('open')) return;
    sweeping = false;
    setLens(e.clientX, e.clientY);
    stage.classList.add('scanning');
  });
  stage.addEventListener('pointerleave', () => stage.classList.remove('scanning'));

  // the first time the head comes into view, the scanner sweeps it once
  let swept = false;
  let sweeping = false;
  function sweep() {
    if (reduced || swept) return;
    swept = true;
    sweeping = true;
    stage.classList.add('scanning');
    const start = performance.now();
    const dur = 2200;
    const frame = (now: number) => {
      if (!sweeping || stage.classList.contains('open')) return;
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

  new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        chapter.classList.add('in-view');
        setTimeout(sweep, 900);
        obs.disconnect();
      }
    },
    { threshold: 0.35 },
  ).observe(chapter);

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

// the giant outlined name drifts as its chapter scrolls by
const ghosts = [...document.querySelectorAll<HTMLElement>('.chapter__ghost')];
if (!reduced) {
  let ticking = false;
  const update = () => {
    ticking = false;
    for (const g of ghosts) {
      const r = g.parentElement!.getBoundingClientRect();
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      g.style.setProperty('--p', p.toFixed(3));
    }
  };
  addEventListener('scroll', () => {
    if (!ticking) requestAnimationFrame(update);
    ticking = true;
  }, { passive: true });
  update();
}

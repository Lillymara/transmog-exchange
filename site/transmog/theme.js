// ── Theme: accent color + background, saved per browser ──────────────────────
// Loaded in <head> so the saved theme is painted before the page shows.
// Same choices as the SxS Tools site, plus Antique Gold (this site's default).

(function () {
  const ACCENTS = [
    { id: 'antique',  name: 'Antique Gold', light: ['#7a5a12', '#a6781a'], dark: ['#d4b25a', '#e8cf8a'] },
    { id: 'indigo',   name: 'Indigo',   light: ['#5046e5', '#0ea5b7'], dark: ['#8b85ff', '#3dd4e4'] },
    { id: 'cobalt',   name: 'Cobalt',   light: ['#1d4ed8', '#3b82f6'], dark: ['#6b9bff', '#93c5fd'] },
    { id: 'ocean',    name: 'Ocean',    light: ['#0369a1', '#06b6d4'], dark: ['#38bdf8', '#22d3ee'] },
    { id: 'seafoam',  name: 'Seafoam',  light: ['#0d7f73', '#2bb39a'], dark: ['#7ae8cc', '#a5f3e0'] },
    { id: 'emerald',  name: 'Emerald',  light: ['#047857', '#65a30d'], dark: ['#34d399', '#a3e635'] },
    { id: 'lime',     name: 'Lime',     light: ['#4d7c0f', '#ca8a04'], dark: ['#a3e635', '#facc15'] },
    { id: 'gold',     name: 'Gold',     light: ['#a16207', '#d97706'], dark: ['#facc15', '#fcd34d'] },
    { id: 'amber',    name: 'Amber',    light: ['#b45309', '#e11d48'], dark: ['#fbbf24', '#fb7185'] },
    { id: 'coral',    name: 'Coral',    light: ['#c2410c', '#f43f5e'], dark: ['#ff8a65', '#fda4af'] },
    { id: 'crimson',  name: 'Crimson',  light: ['#b91c1c', '#ea580c'], dark: ['#f87171', '#fb923c'] },
    { id: 'rose',     name: 'Rose',     light: ['#be185d', '#f97316'], dark: ['#f472b6', '#fb923c'] },
    { id: 'fuchsia',  name: 'Fuchsia',  light: ['#a21caf', '#7c3aed'], dark: ['#e879f9', '#c4b5fd'] },
    { id: 'violet',   name: 'Violet',   light: ['#7c3aed', '#db2777'], dark: ['#a78bfa', '#f472b6'] },
    { id: 'lavender', name: 'Lavender', light: ['#6d5bd0', '#a78bfa'], dark: ['#c4b5fd', '#e9d5ff'] },
    { id: 'copper',   name: 'Copper',   light: ['#9a4a24', '#c2703d'], dark: ['#e6a072', '#f2c29b'] },
    { id: 'onyx',     name: 'Onyx',     light: ['#000000', '#3f3f46'], dark: ['#404040', '#5a5a5a'], swatch: ['#000000', '#3f3f46'] },
    { id: 'slate',    name: 'Slate',    light: ['#475569', '#64748b'], dark: ['#cbd5e1', '#94a3b8'] },
  ];

  const BACKGROUNDS = [
    { id: 'midnight', name: 'Midnight',   tone: 'dark',  bg: '#0c0f1c', surface: '#141829', surface2: '#1b2036', text: '#e9ebf5', muted: '#9fa5c0', line: '#262c45' },
    { id: 'charcoal', name: 'Charcoal',   tone: 'dark',  bg: '#111214', surface: '#1a1b1f', surface2: '#222328', text: '#ececef', muted: '#a3a4ac', line: '#2c2d33' },
    { id: 'black',    name: 'Pure Black', tone: 'dark',  bg: '#000000', surface: '#000000', surface2: '#141414', text: '#ededed', muted: '#9c9c9c', line: '#2a2a2a' },
    { id: 'abyss',    name: 'Abyss',      tone: 'dark',  bg: '#071618', surface: '#0e2226', surface2: '#142b30', text: '#e3f1f1', muted: '#9bbbbd', line: '#1f3a3f' },
    { id: 'forest',   name: 'Forest',     tone: 'dark',  bg: '#0b140f', surface: '#132019', surface2: '#1a2a21', text: '#e6f0e9', muted: '#a0b6a7', line: '#24382c' },
    { id: 'plum',     name: 'Plum',       tone: 'dark',  bg: '#150d1c', surface: '#1f1529', surface2: '#281c35', text: '#efe7f5', muted: '#b3a4c1', line: '#352847' },
    { id: 'espresso', name: 'Espresso',   tone: 'dark',  bg: '#17110d', surface: '#211915', surface2: '#2b211c', text: '#f2ebe5', muted: '#b8aa9f', line: '#3a2e27' },
    { id: 'daylight', name: 'Daylight',   tone: 'light', bg: '#f5f6fb', surface: '#ffffff', surface2: '#eceff7', text: '#171a2c', muted: '#555c75', line: '#d9dde9' },
    { id: 'mist',     name: 'Mist',       tone: 'light', bg: '#eaeff4', surface: '#fbfcfe', surface2: '#e1e8ef', text: '#16202b', muted: '#4f5c6a', line: '#cdd6e0' },
    { id: 'paper',    name: 'Paper',      tone: 'light', bg: '#f4f0e8', surface: '#fffdf8', surface2: '#ece5d8', text: '#231f1a', muted: '#5f584e', line: '#ddd3c2' },
  ];

  const SYSTEM = 'system';
  const DEFAULT_ACCENT = 'antique';
  const DEFAULT_BACKGROUND = 'midnight';
  const ACCENT_KEY = 'transmog.accent';
  const BACKGROUND_KEY = 'transmog.background';

  function read(key, valid, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v && valid(v) ? v : fallback;
    } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch { /* lasts for this visit */ }
  }

  const savedAccent = () => read(ACCENT_KEY, v => ACCENTS.some(a => a.id === v), DEFAULT_ACCENT);
  const savedBackground = () =>
    read(BACKGROUND_KEY, v => v === SYSTEM || BACKGROUNDS.some(b => b.id === v), DEFAULT_BACKGROUND);

  const systemDark = () => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  function resolveBackground(id) {
    if (id === SYSTEM) id = systemDark() ? 'midnight' : 'daylight';
    return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
  }
  const accentColors = (a, tone) => (tone === 'dark' ? a.dark : a.light);

  // WCAG contrast ratio between two #rrggbb colors.
  function lum(hex) {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  // Blend two #rrggbb colors: t = 0 gives a, t = 1 gives b.
  function mix(a, b, t) {
    const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  // Accent used for text: nudged toward the body text color until it reads at
  // 4.5:1 or better on every surface (e.g. Gold on Paper, Onyx on Midnight).
  function readableAccent(color, bg) {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const c = mix(color, bg.text, t);
      const worst = Math.min(contrast(c, bg.bg), contrast(c, bg.surface), contrast(c, bg.surface2));
      if (worst >= 4.5) return c;
    }
    return bg.text;
  }

  function paint() {
    const bg = resolveBackground(savedBackground());
    const accent = ACCENTS.find(a => a.id === savedAccent()) || ACCENTS[0];
    const [a1, a2] = accentColors(accent, bg.tone);
    const dark = bg.tone === 'dark';
    const onAccent = contrast(a1, '#ffffff') >= contrast(a1, '#0b0b0b') ? '#ffffff' : '#0b0b0b';
    const vars = {
      '--bg': bg.bg,
      '--surface': bg.surface,
      '--surface-2': bg.surface2,
      '--text': bg.text,
      '--muted': bg.muted,
      '--line': bg.line,
      '--accent': a1,
      '--accent-2': a2,
      '--accent-text': readableAccent(a1, bg),
      '--accent-soft': `color-mix(in srgb, ${a1} ${dark ? 18 : 12}%, ${bg.surface})`,
      '--on-accent': onAccent,
      '--focus': readableAccent(a1, bg),
      '--shadow': dark
        ? '0 1px 2px rgb(0 0 0 / 0.3), 0 12px 32px -16px rgb(0 0 0 / 0.6)'
        : '0 1px 2px rgb(23 26 44 / 0.05), 0 8px 24px -12px rgb(23 26 44 / 0.15)',
    };
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.style.colorScheme = bg.tone;
    root.dataset.tone = bg.tone;
    root.dataset.accent = accent.id;
    root.dataset.background = bg.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg.bg);
  }

  // ── Picker UI ──────────────────────────────────────────────────────────────

  function swatch(background) {
    const s = document.createElement('span');
    s.className = 'swatch';
    s.setAttribute('aria-hidden', 'true');
    s.style.background = background;
    return s;
  }
  const split = (a, b) => `linear-gradient(135deg, ${a} 50%, ${b} 50%)`;

  function accentOptions() {
    const tone = resolveBackground(savedBackground()).tone;
    return ACCENTS.map(a => {
      const [c1, c2] = a.swatch || accentColors(a, tone);
      return { id: a.id, name: a.name, bg: a.swatch ? split(c1, c2) : `linear-gradient(135deg, ${c1}, ${c2})` };
    });
  }
  function backgroundOptions() {
    return [
      ...BACKGROUNDS.map(b => ({ id: b.id, name: b.name, bg: split(b.bg, b.surface2) })),
      { id: SYSTEM, name: 'Device', bg: split(resolveBackground('midnight').bg, resolveBackground('daylight').bg) },
    ];
  }

  const pickers = [];

  function makePicker({ label, title, options, value, defaultId, onPick }) {
    const wrap = document.createElement('div');
    wrap.className = 'color-chooser';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'color-menu';
    menu.setAttribute('role', 'radiogroup');
    menu.setAttribute('aria-label', title);
    menu.hidden = true;
    wrap.append(btn, menu);

    function render() {
      const opts = options();
      const cur = opts.find(o => o.id === value()) || opts[0];
      btn.replaceChildren(swatch(cur.bg), document.createTextNode(label));
      btn.title = `${title}: ${cur.name}`;
      btn.setAttribute('aria-label', `${title}: ${cur.name}`);
      menu.replaceChildren(...opts.map(o => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(o.id === cur.id));
        b.dataset.id = o.id;
        b.append(swatch(o.bg), document.createTextNode(o.name));
        if (o.id === defaultId) {
          const sm = document.createElement('small');
          sm.textContent = 'default';
          b.append(sm);
        }
        b.addEventListener('click', () => { onPick(o.id); close(true); });
        return b;
      }));
    }
    function open() {
      pickers.forEach(p => p !== api && p.close(false));
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (menu.querySelector('[aria-checked="true"]') || menu.firstChild)?.focus();
    }
    function close(focusButton) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (focusButton) btn.focus();
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close(false)));
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      const items = [...menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
      if (step && i >= 0) {
        e.preventDefault();
        items[Math.max(0, Math.min(items.length - 1, i + step))].focus();
      }
    });
    document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) close(false); });
    wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget)) close(false); });

    const api = { el: wrap, render, close };
    pickers.push(api);
    render();
    return api;
  }

  function mountPickers(container) {
    const accent = makePicker({
      label: 'Color', title: 'Accent color', options: accentOptions, value: savedAccent,
      defaultId: DEFAULT_ACCENT,
      onPick: id => { write(ACCENT_KEY, id); paint(); pickers.forEach(p => p.render()); },
    });
    const background = makePicker({
      label: 'Background', title: 'Background', options: backgroundOptions, value: savedBackground,
      defaultId: DEFAULT_BACKGROUND,
      onPick: id => { write(BACKGROUND_KEY, id); paint(); pickers.forEach(p => p.render()); },
    });
    container.append(accent.el, background.el);
  }

  paint();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (savedBackground() === SYSTEM) { paint(); pickers.forEach(p => p.render()); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('theme-pickers');
    if (slot) mountPickers(slot);
  });

  window.TransmogTheme = { ACCENTS, BACKGROUNDS, contrast, accentColors, readableAccent };
})();

#!/usr/bin/env node
/**
 * Аватарки Игрока → img/avatars/*.svg (профиль pages/profile.html, шапка сайта, чат).
 *
 *   node tools/build-avatars.mjs
 *
 * Каждая аватарка — многослойная SVG-иллюстрация 256×256: фон-портал (врата, разлом, тёмный мир),
 * частицы, задние волосы и аксессуары, плечи с одеждой, лицо, аниме-глаза с бликами и свечением,
 * чёлка и передние аксессуары. Параметры персонажей — в массиве AVATARS ниже.
 * «Кровавая принцесса» (blood-princess.webp) — кроп готической героини с баннера главной (img/banner.png),
 * генератором не перерисовывается.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'img', 'avatars');
mkdirSync(OUT, { recursive: true });

// ───────── фоны-миры ─────────
const WORLDS = {
  crimson: { sky: ['#2a0309', '#0a0103'], portal: ['#ff6070', '#c8102e', '#3a0008'], ring: '#ff2440', dust: '#ff8a99' },
  abyss:   { sky: ['#1c0316', '#050007'], portal: ['#ff4d8a', '#7a0a3c', '#14000c'], ring: '#d61f5a', dust: '#ff7ab0' },
  shadow:  { sky: ['#120a16', '#020103'], portal: ['#8b6bff', '#2b1040', '#05010a'], ring: '#6b3cff', dust: '#b9a3ff' },
  flame:   { sky: ['#2b0700', '#090100'], portal: ['#ffd27a', '#ff4a1c', '#3a0800'], ring: '#ff5a2a', dust: '#ffc36b' },
  dawn:    { sky: ['#2a0f12', '#0b0306'], portal: ['#fff0c8', '#ff7a6b', '#4a0e1a'], ring: '#ffb37a', dust: '#ffe2b0' },
  frost:   { sky: ['#06121f', '#010307'], portal: ['#b8f0ff', '#2a7bd6', '#03122a'], ring: '#5cc8ff', dust: '#c9f3ff' },
  forest:  { sky: ['#06140e', '#010503'], portal: ['#b6ffd8', '#1e9e6a', '#03140c'], ring: '#3fdc9a', dust: '#c7ffe4' },
  void:    { sky: ['#0d0d10', '#000000'], portal: ['#ff2440', '#3a0610', '#000000'], ring: '#ff2440', dust: '#ff5a6e' },
};

// ───────── персонажи ─────────
// hair: long | short | spiky | twin | bob | wavy | ponytail | hood
// acc: fox, horns, crown, halo, tiara, hood, mask, sword, wings, roses, runes, gem, flames, aura, scar, earring, helmet, collar, armor, book, veil, mark
const AVATARS = [
  { file: 'awakened-hunter', world: 'crimson', hair: 'spiky', hairC: ['#2a2a33', '#0d0d12'], eye: '#ff2440', skin: '#f2d2c2', outfit: ['#1a1d24', '#0a0b0f'], acc: ['collar', 'scar'], male: true },
  { file: 'night-blade', world: 'void', hair: 'hood', hairC: ['#1b1b22', '#08080c'], eye: '#ff3b55', skin: '#e9c7b8', outfit: ['#141418', '#050506'], acc: ['hood', 'mask', 'sword'], male: true },
  { file: 'scarlet-valkyrie', world: 'crimson', hair: 'long', hairC: ['#ff5a6e', '#8f0e22'], eye: '#ffd27a', skin: '#f7dccf', outfit: ['#c8c9d2', '#5b5e6b'], acc: ['wings', 'tiara', 'armor'] },
  { file: 'night-kitsune', world: 'abyss', hair: 'long', hairC: ['#f4f0ff', '#a99bc8'], eye: '#ff2440', skin: '#f9e3d8', outfit: ['#2a0b18', '#0e0207'], acc: ['fox', 'mark', 'earring'] },
  { file: 'system-neophyte', world: 'frost', hair: 'short', hairC: ['#3b4c66', '#121a26'], eye: '#5cc8ff', skin: '#f0d0c0', outfit: ['#1a2433', '#070b12'], acc: ['collar', 'runes'], male: true },
  { file: 'crimson-swordswoman', world: 'crimson', hair: 'ponytail', hairC: ['#1d1012', '#050203'], eye: '#ff2440', skin: '#f5d6c8', outfit: ['#3a0a12', '#120205'], acc: ['sword', 'earring'] },
  { file: 'world-wanderer', world: 'forest', hair: 'wavy', hairC: ['#c48a5a', '#5a3018'], eye: '#3fdc9a', skin: '#f7dccc', outfit: ['#27403a', '#0b1714'], acc: ['veil', 'earring'] },
  { file: 'chronicle-keeper', world: 'dawn', hair: 'bob', hairC: ['#e8e2f0', '#8e86a0'], eye: '#ffb37a', skin: '#f8e0d4', outfit: ['#3a2430', '#120a10'], acc: ['book', 'runes', 'gem'] },
  { file: 'gate-guardian', world: 'shadow', hair: 'spiky', hairC: ['#cfd3dc', '#6d7280'], eye: '#8b6bff', skin: '#e6c4b2', outfit: ['#2b2f3a', '#0b0c10'], acc: ['armor', 'helmet', 'scar'], male: true },
  { file: 'abyss-lady', world: 'abyss', hair: 'long', hairC: ['#2a0a1e', '#070106'], eye: '#ff4d8a', skin: '#efd2cf', outfit: ['#1a0612', '#050003'], acc: ['horns', 'veil', 'aura'] },
  { file: 'monarch-shade', world: 'shadow', hair: 'spiky', hairC: ['#14121c', '#030205'], eye: '#8b6bff', skin: '#dcc0b4', outfit: ['#100d18', '#020104'], acc: ['aura', 'collar'], male: true },
  { file: 'shadow-empress', world: 'shadow', hair: 'long', hairC: ['#1a1324', '#04020a'], eye: '#b38bff', skin: '#efd4d0', outfit: ['#1d1030', '#060211'], acc: ['crown', 'aura', 'gem'] },
  { file: 'guild-herald', world: 'crimson', hair: 'twin', hairC: ['#ff8a99', '#c8102e'], eye: '#ff2440', skin: '#f9e2d6', outfit: ['#2a0e16', '#0b0306'], acc: ['earring', 'mark'] },
  { file: 'scarlet-oracle', world: 'abyss', hair: 'long', hairC: ['#9b1030', '#360410'], eye: '#ffd27a', skin: '#f5dace', outfit: ['#1e0a12', '#070204'], acc: ['roses', 'gem', 'veil'] },
  { file: 'dawn-valkyrie', world: 'dawn', hair: 'wavy', hairC: ['#ffe6a8', '#c98a3a'], eye: '#ff7a6b', skin: '#fae4d8', outfit: ['#e6e1e8', '#7a6e7e'], acc: ['wings', 'halo', 'armor'] },
  { file: 'dragon-heart', world: 'flame', hair: 'spiky', hairC: ['#ff6a3a', '#7a1400'], eye: '#ffd27a', skin: '#efc9b6', outfit: ['#2a0d08', '#0a0302'], acc: ['horns', 'flames', 'scar'], male: true },
  { file: 'flame-priestess', world: 'flame', hair: 'long', hairC: ['#ff3a2a', '#6a0a06'], eye: '#ffd27a', skin: '#f7d9c9', outfit: ['#2e0806', '#0b0201'], acc: ['horns', 'flames', 'gem'] },
  { file: 's-rank-goddess', world: 'dawn', hair: 'long', hairC: ['#fff6e8', '#c9b6a8'], eye: '#ff2440', skin: '#fbe6dc', outfit: ['#f0e8ee', '#8a7c88'], acc: ['halo', 'crown', 'wings'] },
  { file: 'shadow-monarch', world: 'void', hair: 'spiky', hairC: ['#0e0c12', '#000000'], eye: '#ff2440', skin: '#d8bcb0', outfit: ['#0c0a10', '#000000'], acc: ['aura', 'crown', 'collar'], male: true },
];

// ───────── помощники ─────────
let rnd = 1;
const rand = () => { rnd = (rnd * 16807) % 2147483647; return (rnd - 1) / 2147483646; };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
};

function defs(a, w) {
  return `
  <defs>
    <radialGradient id="sky" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${w.sky[0]}"/><stop offset="1" stop-color="${w.sky[1]}"/></radialGradient>
    <radialGradient id="portal" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${w.portal[0]}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${w.portal[1]}" stop-opacity="0.85"/>
      <stop offset="0.75" stop-color="${w.portal[2]}" stop-opacity="0.6"/><stop offset="1" stop-color="${w.portal[2]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${a.hairC[0]}"/><stop offset="1" stop-color="${a.hairC[1]}"/></linearGradient>
    <linearGradient id="hairShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.skin}"/><stop offset="1" stop-color="${shade(a.skin, 0.86)}"/></linearGradient>
    <linearGradient id="outfit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.outfit[0]}"/><stop offset="1" stop-color="${a.outfit[1]}"/></linearGradient>
    <radialGradient id="iris" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="${shade(a.eye, 1.35)}"/><stop offset="0.55" stop-color="${a.eye}"/><stop offset="1" stop-color="${shade(a.eye, 0.35)}"/></radialGradient>
    <radialGradient id="blush" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff6b7d" stop-opacity="0.28"/><stop offset="1" stop-color="#ff6b7d" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="eyeGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="circle"><circle cx="128" cy="128" r="128"/></clipPath>
  </defs>`;
}

function background(a, w) {
  let s = `<rect width="256" height="256" fill="url(#sky)"/>`;
  // далёкие силуэты тёмного мира
  s += `<path d="M0 200 L22 168 L40 182 L58 140 L74 170 L96 150 L112 176 L136 132 L160 172 L182 146 L204 178 L226 150 L256 184 L256 256 L0 256 Z" fill="${shade(w.sky[1], 1.6)}" opacity="0.9"/>`;
  // врата-портал
  s += `<ellipse cx="128" cy="112" rx="104" ry="108" fill="url(#portal)"/>`;
  s += `<g fill="none" stroke="${w.ring}" filter="url(#glow)">
    <ellipse cx="128" cy="112" rx="92" ry="98" stroke-width="2.2" opacity="0.85"/>
    <ellipse cx="128" cy="112" rx="80" ry="86" stroke-width="1" opacity="0.5" stroke-dasharray="6 9"/>
    <ellipse cx="128" cy="112" rx="104" ry="110" stroke-width="0.8" opacity="0.35" stroke-dasharray="2 12"/>
  </g>`;
  // руны на кольце
  let runes = '';
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const x = 128 + Math.cos(ang) * 92, y = 112 + Math.sin(ang) * 98;
    runes += `<rect x="${(x - 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" width="4" height="4" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" fill="${w.dust}" opacity="0.8"/>`;
  }
  s += runes;
  // частицы и искры
  let dots = '';
  for (let i = 0; i < 26; i++) {
    const x = rand() * 256, y = rand() * 200, r = rand() * 1.6 + 0.4;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${w.dust}" opacity="${(0.35 + rand() * 0.6).toFixed(2)}"/>`;
  }
  s += `<g filter="url(#glow)">${dots}</g>`;
  return s;
}

// ───────── задний план персонажа ─────────
function backLayer(a, w) {
  let s = '';
  if (a.acc.includes('aura')) {
    s += `<g filter="url(#soft)" opacity="0.9">
      <path d="M40 256 C30 190 60 150 70 96 C80 60 96 70 92 40 C120 70 110 20 128 6 C146 20 136 70 164 40 C160 70 176 60 186 96 C196 150 226 190 216 256 Z" fill="${shade(w.ring, 0.6)}"/>
    </g>
    <path d="M58 256 C52 200 76 160 84 112 C92 78 104 86 104 58 C118 80 120 40 128 24 C136 40 138 80 152 58 C152 86 164 78 172 112 C180 160 204 200 198 256 Z" fill="${w.sky[1]}" opacity="0.85"/>`;
  }
  if (a.acc.includes('flames')) {
    s += `<g filter="url(#glow)" opacity="0.95">
      <path d="M36 256 C30 200 52 186 46 150 C64 170 70 150 66 120 C86 146 92 120 88 96 C104 120 112 104 110 80 L146 80 C144 104 152 120 168 96 C164 120 170 146 190 120 C186 150 192 170 210 150 C204 186 226 200 220 256 Z" fill="#ff4a1c" opacity="0.55"/>
      <path d="M60 256 C56 214 72 200 70 172 C84 186 90 170 88 148 C102 166 108 150 106 132 L150 132 C148 150 154 166 168 148 C166 170 172 186 186 172 C184 200 200 214 196 256 Z" fill="#ffb03a" opacity="0.5"/>
    </g>`;
  }
  if (a.acc.includes('wings')) {
    const feathers = side => {
      let p = '';
      for (let i = 0; i < 6; i++) {
        const y = 150 + i * 12, len = 70 - i * 7;
        const x0 = side < 0 ? 84 : 172;
        p += `<path d="M${x0} ${y} q ${side * len * 0.6} ${-30 + i * 4} ${side * len} ${-10 + i * 6} q ${-side * len * 0.4} ${14} ${-side * len} ${10}" fill="${i % 2 ? '#f3eef5' : '#d9d2df'}" stroke="#8a7f90" stroke-width="0.6" opacity="0.95"/>`;
      }
      return p;
    };
    s += `<g filter="url(#glow)">${feathers(-1)}${feathers(1)}</g>`;
  }
  if (a.acc.includes('sword')) {
    s += `<g transform="rotate(-28 128 128)">
      <rect x="122" y="-10" width="12" height="200" rx="3" fill="#d9dde6"/>
      <rect x="127" y="-10" width="2" height="200" fill="#ffffff" opacity="0.8"/>
      <rect x="122" y="-10" width="12" height="200" rx="3" fill="${w.ring}" opacity="0.25"/>
      <rect x="104" y="186" width="48" height="8" rx="3" fill="#2a2a33"/>
    </g>`;
  }
  // задние волосы
  const backHair = {
    long: `<path d="M74 104 C60 160 56 214 64 256 L192 256 C200 214 196 160 182 104 C176 54 80 54 74 104 Z" fill="url(#hair)"/>`,
    wavy: `<path d="M76 104 C56 140 70 170 56 200 C48 224 66 240 60 256 L196 256 C190 240 208 224 200 200 C186 170 200 140 180 104 C174 56 82 56 76 104 Z" fill="url(#hair)"/>`,
    twin: `<path d="M74 110 C46 140 40 200 30 250 C52 236 62 200 70 170 Z M182 110 C210 140 216 200 226 250 C204 236 194 200 186 170 Z" fill="url(#hair)"/><path d="M80 104 C76 140 80 170 86 196 L170 196 C176 170 180 140 176 104 C170 60 86 60 80 104 Z" fill="url(#hair)"/>`,
    ponytail: `<path d="M150 64 C196 60 214 110 204 170 C198 206 214 232 206 256 L176 256 C186 224 176 190 178 150 C180 110 170 86 150 80 Z" fill="url(#hair)"/><path d="M82 104 C80 132 84 156 88 172 L168 172 C172 156 176 132 174 104 C168 62 88 62 82 104 Z" fill="url(#hair)"/>`,
    bob: `<path d="M74 108 C66 140 70 168 82 184 L174 184 C186 168 190 140 182 108 C176 58 80 58 74 108 Z" fill="url(#hair)"/>`,
    short: `<path d="M84 108 C82 130 86 148 92 160 L164 160 C170 148 174 130 172 108 C168 66 88 66 84 108 Z" fill="url(#hair)"/>`,
    spiky: `<path d="M80 112 L70 140 L86 132 L84 158 L172 158 L170 132 L186 140 L176 112 C172 62 84 62 80 112 Z" fill="url(#hair)"/>`,
    hood: '',
  };
  s += backHair[a.hair] || '';
  if (a.acc.includes('fox')) {
    s += `<path d="M86 82 L72 30 L112 66 Z" fill="url(#hair)"/><path d="M88 76 L80 44 L104 66 Z" fill="${w.ring}" opacity="0.8"/>
          <path d="M170 82 L184 30 L144 66 Z" fill="url(#hair)"/><path d="M168 76 L176 44 L152 66 Z" fill="${w.ring}" opacity="0.8"/>`;
  }
  return s;
}

// ───────── тело ─────────
function body(a, w) {
  let s = '';
  // шея
  s += `<path d="M114 150 L142 150 L144 186 C136 192 120 192 112 186 Z" fill="url(#skin)"/><path d="M114 160 C122 170 134 170 142 160 L142 172 C134 178 122 178 114 172 Z" fill="#000" opacity="0.18"/>`;
  // плечи и одежда
  s += `<path d="M28 256 C34 214 70 192 112 184 C120 196 136 196 144 184 C186 192 222 214 228 256 Z" fill="url(#outfit)"/>`;
  s += `<path d="M112 184 L128 212 L144 184" fill="none" stroke="${w.ring}" stroke-width="2" opacity="0.8"/>`;
  if (a.acc.includes('armor')) {
    s += `<path d="M34 238 C40 210 66 196 96 192 C92 210 80 226 64 240 Z" fill="#d7d9e0" stroke="#6b6f7c" stroke-width="1.5"/>
          <path d="M222 238 C216 210 190 196 160 192 C164 210 176 226 192 240 Z" fill="#d7d9e0" stroke="#6b6f7c" stroke-width="1.5"/>
          <path d="M60 232 L84 206 M196 232 L172 206" stroke="${w.ring}" stroke-width="2" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('collar')) {
    s += `<path d="M96 192 L112 176 L128 204 L144 176 L160 192 L150 214 L128 222 L106 214 Z" fill="${shade(a.outfit[0], 1.4)}" stroke="${w.ring}" stroke-width="1.2" opacity="0.95"/>`;
  }
  if (a.acc.includes('roses')) {
    const rose = (x, y, r) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#8f0e22"/><path d="M0 ${-r * 0.7} C${r * 0.8} ${-r * 0.6} ${r * 0.7} ${r * 0.5} 0 ${r * 0.4} C${-r * 0.6} ${r * 0.3} ${-r * 0.5} ${-r * 0.3} 0 ${-r * 0.2}" fill="none" stroke="#ff2440" stroke-width="1.6"/><circle r="${r * 0.25}" fill="#5a0612"/></g>`;
    s += `<g filter="url(#glow)">${rose(70, 214, 14)}${rose(92, 230, 10)}${rose(186, 220, 12)}</g>`;
  }
  if (a.acc.includes('book')) {
    s += `<g transform="translate(128 236) rotate(-6)"><rect x="-34" y="-18" width="68" height="36" rx="3" fill="#3a1a14" stroke="#ffb37a" stroke-width="1.5"/><path d="M0 -18 L0 18" stroke="#ffb37a"/><path d="M-26 -8 h18 M-26 0 h18 M8 -8 h18 M8 0 h18" stroke="#ffe2b0" stroke-width="1.2" opacity="0.8"/></g>`;
  }
  return s;
}

// ───────── голова ─────────
function head(a, w) {
  let s = '';
  // лицо
  const face = a.male
    ? 'M90 106 C90 76 166 76 166 106 C166 134 154 156 128 170 C102 156 90 134 90 106 Z'
    : 'M92 108 C92 78 164 78 164 108 C164 134 150 156 128 168 C106 156 92 134 92 108 Z';
  s += `<path d="${face}" fill="url(#skin)"/>`;
  s += `<path d="M92 112 C96 140 110 158 128 168 C112 154 102 136 100 112 Z" fill="#000" opacity="0.08"/>`;
  // румянец
  if (!a.male) s += `<ellipse cx="106" cy="140" rx="10" ry="5" fill="url(#blush)"/><ellipse cx="150" cy="140" rx="10" ry="5" fill="url(#blush)"/>`;
  // глаза
  const eye = (cx, flip) => {
    const ry = a.male ? 7.5 : 9.5;
    let e = `<ellipse cx="${cx}" cy="126" rx="${a.male ? 8 : 8.5}" ry="${ry}" fill="#fff"/>`;
    e += `<g filter="url(#eyeGlow)"><ellipse cx="${cx}" cy="127" rx="${a.male ? 6.5 : 7}" ry="${ry - 0.5}" fill="url(#iris)"/></g>`;
    e += `<ellipse cx="${cx}" cy="128" rx="2.6" ry="${a.male ? 4 : 4.8}" fill="#0a0206"/>`;
    e += `<circle cx="${cx - 2.6 * flip}" cy="122" r="2.4" fill="#fff"/><circle cx="${cx + 2.4 * flip}" cy="131" r="1.2" fill="#fff" opacity="0.85"/>`;
    // ресницы / верхнее веко
    const lashW = a.male ? 2.6 : 3.4;
    e += `<path d="M${cx - 10} ${126 - ry + 3} Q ${cx} ${126 - ry - 4} ${cx + 10} ${126 - ry + 2}" fill="none" stroke="#120408" stroke-width="${lashW}" stroke-linecap="round"/>`;
    if (!a.male) e += `<path d="M${cx + 9 * flip} ${126 - ry + 2} l ${3 * flip} -3" stroke="#120408" stroke-width="2" stroke-linecap="round"/>`;
    // бровь
    e += `<path d="M${cx - 9} ${a.male ? 110 : 108} Q ${cx} ${a.male ? 104 : 104} ${cx + 9} ${a.male ? 109 : 107}" fill="none" stroke="${shade(a.hairC[1], 0.8)}" stroke-width="${a.male ? 2.6 : 1.8}" stroke-linecap="round"/>`;
    return e;
  };
  s += eye(110, 1) + eye(146, -1);
  // нос и рот
  s += `<path d="M128 136 l -2 6 l 3 0" fill="none" stroke="${shade(a.skin, 0.7)}" stroke-width="1.2" stroke-linecap="round"/>`;
  if (!a.acc.includes('mask')) {
    s += a.male
      ? `<path d="M120 152 Q 128 155 136 152" fill="none" stroke="${shade(a.skin, 0.55)}" stroke-width="1.6" stroke-linecap="round"/>`
      : `<path d="M122 151 Q 128 155 134 151" fill="none" stroke="#b8505a" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  if (a.acc.includes('scar')) s += `<path d="M150 112 L158 140" stroke="#b8505a" stroke-width="1.6" opacity="0.8"/><path d="M152 120 l6 -2 M154 130 l6 -2" stroke="#b8505a" stroke-width="1" opacity="0.7"/>`;
  if (a.acc.includes('mark')) s += `<path d="M128 94 l4 6 l-4 6 l-4 -6 Z" fill="${w.ring}" filter="url(#glow)"/>`;
  if (a.acc.includes('mask')) s += `<path d="M94 140 C110 146 146 146 162 140 C160 160 146 172 128 176 C110 172 96 160 94 140 Z" fill="#101014"/><path d="M98 146 C116 150 140 150 158 146" stroke="${w.ring}" stroke-width="1.5" opacity="0.8"/>`;
  return s;
}

// ───────── передний план ─────────
function frontLayer(a, w) {
  let s = '';
  const bangs = {
    long: `<path d="M88 116 C80 70 120 52 150 60 C176 68 180 96 170 120 C164 104 160 96 152 92 C150 106 142 114 132 116 C138 104 136 96 132 90 C124 104 112 112 98 114 C104 106 106 98 104 92 C98 100 92 108 88 116 Z" fill="url(#hair)"/>`,
    wavy: `<path d="M86 118 C76 70 118 50 150 58 C178 66 182 96 172 122 C166 106 160 98 154 94 C152 108 144 114 134 118 C140 106 138 96 134 90 C126 104 114 112 100 116 C106 106 106 98 104 92 C98 102 90 110 86 118 Z" fill="url(#hair)"/>`,
    twin: `<path d="M88 114 C82 72 120 54 150 60 C174 68 178 94 168 116 C162 102 156 96 150 92 C146 104 138 110 128 112 C132 102 130 96 126 92 C118 104 106 110 96 112 C100 104 100 98 98 94 C94 100 90 106 88 114 Z" fill="url(#hair)"/><circle cx="82" cy="92" r="7" fill="${w.ring}" filter="url(#glow)"/><circle cx="174" cy="92" r="7" fill="${w.ring}" filter="url(#glow)"/>`,
    ponytail: `<path d="M90 112 C84 72 120 56 150 62 C172 68 176 92 168 112 C160 100 154 96 148 94 C144 102 136 108 126 110 C130 100 128 96 124 92 C116 102 106 108 96 110 Z" fill="url(#hair)"/>`,
    bob: `<path d="M84 120 C78 70 120 54 152 60 C178 68 182 98 172 122 C164 108 158 100 150 96 C146 108 136 112 126 112 C130 104 128 98 124 94 C114 106 102 112 92 114 C96 108 96 102 94 98 C90 106 86 112 84 120 Z" fill="url(#hair)"/>`,
    short: `<path d="M88 112 C84 74 120 58 148 64 C170 70 174 92 168 112 C162 100 156 94 148 92 C146 102 138 106 130 106 C132 98 130 94 126 90 C118 100 106 104 96 106 C98 100 98 96 96 92 C92 98 90 104 88 112 Z" fill="url(#hair)"/>`,
    spiky: `<path d="M84 114 L74 92 L92 96 L84 70 L104 82 L104 56 L122 74 L132 48 L140 74 L158 56 L156 82 L176 70 L168 96 L184 92 L172 114 C166 102 160 96 152 94 L154 108 L140 100 L136 112 L126 100 L118 112 L114 100 L102 108 L104 94 C96 98 88 104 84 114 Z" fill="url(#hair)"/>`,
    hood: '',
  };
  s += bangs[a.hair] || '';
  if (a.hair !== 'hood') s += `<path d="M100 70 C116 62 138 62 156 70" stroke="url(#hairShine)" stroke-width="5" fill="none" opacity="0.8" stroke-linecap="round"/>`;
  if (a.acc.includes('hood')) {
    s += `<path d="M72 150 C60 90 88 42 128 40 C168 42 196 90 184 150 C178 120 166 96 150 86 C138 82 118 82 106 86 C90 96 78 120 72 150 Z" fill="url(#hair)"/>
          <path d="M72 150 C78 190 64 220 48 256 L84 256 C92 220 96 190 96 160 Z M184 150 C178 190 192 220 208 256 L172 256 C164 220 160 190 160 160 Z" fill="url(#hair)"/>
          <path d="M104 86 C118 80 138 80 152 86" stroke="${w.ring}" stroke-width="1.5" opacity="0.6"/>`;
  }
  if (a.acc.includes('helmet')) {
    s += `<path d="M84 98 C86 62 170 62 172 98 L164 96 C158 80 98 80 92 96 Z" fill="#9aa0ad" stroke="#4a4f5c" stroke-width="1.5"/><path d="M128 64 L128 88" stroke="${w.ring}" stroke-width="2" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('horns')) {
    s += `<path d="M98 76 C86 56 80 40 90 24 C92 44 100 56 110 66 Z" fill="#1a0b0e" stroke="${w.ring}" stroke-width="1.2"/>
          <path d="M158 76 C170 56 176 40 166 24 C164 44 156 56 146 66 Z" fill="#1a0b0e" stroke="${w.ring}" stroke-width="1.2"/>`;
  }
  if (a.acc.includes('crown')) {
    s += `<g filter="url(#glow)"><path d="M100 68 L106 46 L116 60 L128 38 L140 60 L150 46 L156 68 Z" fill="#c8c9d2" stroke="${w.ring}" stroke-width="1.5"/><circle cx="128" cy="56" r="3.5" fill="${w.ring}"/></g>`;
  }
  if (a.acc.includes('tiara')) {
    s += `<path d="M104 80 Q128 64 152 80" stroke="#e6e8ee" stroke-width="3" fill="none"/><path d="M128 70 l4 -8 l-4 -8 l-4 8 Z" fill="${w.ring}" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('halo')) {
    s += `<ellipse cx="128" cy="44" rx="34" ry="9" fill="none" stroke="#ffe2b0" stroke-width="3.5" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('veil')) {
    s += `<path d="M80 100 C70 150 66 200 74 256 L92 256 C86 200 88 150 96 110 Z M176 100 C186 150 190 200 182 256 L164 256 C170 200 168 150 160 110 Z" fill="${w.ring}" opacity="0.28"/>`;
  }
  if (a.acc.includes('earring')) {
    s += `<circle cx="92" cy="140" r="3" fill="${w.ring}" filter="url(#glow)"/><circle cx="164" cy="140" r="3" fill="${w.ring}" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('gem')) {
    s += `<path d="M128 206 l7 9 l-7 11 l-7 -11 Z" fill="${w.ring}" stroke="#fff" stroke-width="0.8" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('runes')) {
    let r = '';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.3, x = 128 + Math.cos(ang) * 112, y = 128 + Math.sin(ang) * 112;
      r += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="13" text-anchor="middle" fill="${w.dust}" font-family="serif">${'ᚠᚢᚦᚨᚱᚲᚷᚹ'[i]}</text>`;
    }
    s += `<g filter="url(#glow)" opacity="0.9">${r}</g>`;
  }
  return s;
}

function vignette(w) {
  return `<radialGradient id="vig" cx="50%" cy="45%" r="70%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient>
  <rect width="256" height="256" fill="url(#vig)"/>
  <circle cx="128" cy="128" r="126" fill="none" stroke="${w.ring}" stroke-width="2" opacity="0.35"/>`;
}

let made = 0;
for (const [i, a] of AVATARS.entries()) {
  rnd = 7919 * (i + 3);
  const w = WORLDS[a.world];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${defs(a, w)}
  <g clip-path="url(#circle)">
    ${background(a, w)}
    <!-- портретный план: персонаж крупнее, лицо в центре круга -->
    <g transform="translate(128 138) scale(1.42) translate(-128 -124)">
      ${backLayer(a, w)}
      ${body(a, w)}
      ${head(a, w)}
      ${frontLayer(a, w)}
    </g>
    ${vignette(w)}
  </g>
</svg>
`;
  writeFileSync(path.join(OUT, a.file + '.svg'), svg);
  made++;
}
console.log(`готово: ${made} аватарок → img/avatars/`);

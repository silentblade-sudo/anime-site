#!/usr/bin/env node
/**
 * Аватарки Игрока → img/avatars/*.svg (профиль pages/profile.html, шапка сайта, чат).
 *
 *   node tools/build-avatars.mjs
 *
 * Каждая аватарка — многослойный аниме-портрет 256×256:
 *   • фон — врата/разлом/тёмный мир: глубокий радиальный портал, кольца с рунами, лучи, частицы;
 *   • волосы из десятков отдельных прядей (задний объём, боковые пряди, чёлка), с переходом цвета,
 *     тенью у корней, «ангельским кольцом» блика и контровым светом от портала;
 *   • лицо с мягкой светотенью (тень от чёлки, скулы, шея), контровым светом по краю;
 *   • глаза: верхнее веко с «крылом», многослойная радужка (тёмный верх, светлое дно, кольцо, зрачок),
 *     три блика, нижние ресницы, свечение;
 *   • одежда со складками, воротником, бликами; аксессуары (крылья, рога, нимб, корона, ушки, клинок…).
 * Параметры персонажей — в массиве AVATARS ниже. Персонажи и стиль — оригинальные.
 * «Алая луна» (exclusive-crimson-moon.webp) — арт с баннера главной, генератором не трогается.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'img', 'avatars');
mkdirSync(OUT, { recursive: true });

// ───────── миры за спиной героя ─────────
const WORLDS = {
  crimson: { sky: ['#3a0610', '#0a0103'], core: '#ff6a7a', mid: '#c8102e', ring: '#ff2440', dust: '#ffb3bc', rim: '#ff4d64' },
  abyss:   { sky: ['#2a0420', '#060008'], core: '#ff6aa6', mid: '#8a0c48', ring: '#ff3d86', dust: '#ffb0d2', rim: '#ff5d9e' },
  shadow:  { sky: ['#1b0f2a', '#030106'], core: '#a68cff', mid: '#3a1a6e', ring: '#7b57ff', dust: '#cbbcff', rim: '#9c82ff' },
  flame:   { sky: ['#3a0a00', '#0a0200'], core: '#ffd890', mid: '#ff4a1c', ring: '#ff6a2a', dust: '#ffd39a', rim: '#ff8a3a' },
  dawn:    { sky: ['#3a1418', '#0c0406'], core: '#fff3d0', mid: '#ff8a6b', ring: '#ffc08a', dust: '#fff0c8', rim: '#ffd0a0' },
  frost:   { sky: ['#0a1a2e', '#010409'], core: '#c8f4ff', mid: '#2f86e0', ring: '#6ad0ff', dust: '#d8f7ff', rim: '#8adcff' },
  forest:  { sky: ['#08201a', '#010604'], core: '#c4ffe0', mid: '#1e9e6a', ring: '#4ae0a4', dust: '#d4ffe8', rim: '#7af0c0' },
  void:    { sky: ['#140608', '#000000'], core: '#ff5a6e', mid: '#5a0612', ring: '#ff2440', dust: '#ff8a99', rim: '#ff3b55' },
  // монохром с алым акцентом — для готических образов
  mono:    { sky: ['#1c1c20', '#000000'], core: '#e8e8ee', mid: '#4a4a52', ring: '#ff2440', dust: '#f2f2f6', rim: '#ffffff' },
  blood:   { sky: ['#240206', '#000000'], core: '#ff3048', mid: '#7a0010', ring: '#ff1a3a', dust: '#ff9aa8', rim: '#ff4d64' },
};

// ───────── персонажи ─────────
// style: long | wavy | twin | ponytail | bob | short | spiky | hood
// acc: fox, horns, crown, halo, tiara, hood, mask, sword, wings, roses, runes, gem, flames, aura, scar,
//      earring, helmet, collar, armor, book, veil, mark, choker, ribbon, cape
const AVATARS = [
  { file: 'awakened-hunter', world: 'crimson', style: 'spiky', hair: ['#3a3a46', '#121218', '#6a6a7c'], eye: '#ff2440', skin: '#f3d6c8', outfit: ['#22252e', '#0b0c10'], acc: ['collar', 'scar', 'cape'], male: true },
  { file: 'night-blade', world: 'void', style: 'hood', hair: ['#24242c', '#08080c', '#46465a'], eye: '#ff3b55', skin: '#ecccbd', outfit: ['#17171c', '#050506'], acc: ['hood', 'mask', 'sword'], male: true },
  { file: 'scarlet-valkyrie', world: 'crimson', style: 'long', hair: ['#ff6a7e', '#8f0e22', '#ffc2cb'], eye: '#ffc46b', skin: '#f9e0d4', outfit: ['#d8d9e2', '#62657a'], acc: ['wings', 'tiara', 'armor'] },
  { file: 'night-kitsune', world: 'abyss', style: 'long', hair: ['#fbf8ff', '#b3a6d0', '#ffffff'], eye: '#ff2a55', skin: '#fbe7de', outfit: ['#3a0c22', '#100208'], acc: ['fox', 'mark', 'choker'] },
  { file: 'system-neophyte', world: 'frost', style: 'short', hair: ['#4a5e7e', '#141e2c', '#8aa4c8'], eye: '#4cc4ff', skin: '#f2d4c4', outfit: ['#1e2a3c', '#080c14'], acc: ['collar', 'runes'], male: true },
  { file: 'crimson-swordswoman', world: 'crimson', style: 'ponytail', hair: ['#2a1418', '#050203', '#6a3a44'], eye: '#ff2440', skin: '#f6dacd', outfit: ['#4a0c16', '#140206'], acc: ['sword', 'ribbon', 'earring'] },
  { file: 'world-wanderer', world: 'forest', style: 'wavy', hair: ['#d09868', '#5a3018', '#f4caa0'], eye: '#36d896', skin: '#f9e0d0', outfit: ['#2e4a42', '#0c1a16'], acc: ['veil', 'earring', 'cape'] },
  { file: 'chronicle-keeper', world: 'dawn', style: 'bob', hair: ['#efe8f6', '#968cab', '#ffffff'], eye: '#ff9a5c', skin: '#fae4d8', outfit: ['#40283a', '#140a12'], acc: ['book', 'runes', 'gem', 'ribbon'] },
  { file: 'gate-guardian', world: 'shadow', style: 'spiky', hair: ['#d8dce6', '#6d7280', '#ffffff'], eye: '#9b7bff', skin: '#e8c8b6', outfit: ['#30343f', '#0c0d11'], acc: ['armor', 'helmet', 'scar'], male: true },
  { file: 'crimson-rose', world: 'crimson', style: 'wavy', hair: ['#c8c8d2', '#5c5c6c', '#ffffff'], eye: '#ff2440', skin: '#f7ddd6', outfit: ['#160408', '#040102'], acc: ['roses', 'choker', 'ribbon'] },
  { file: 'abyss-lady', world: 'abyss', style: 'long', hair: ['#3a0e2c', '#070106', '#8a3a6a'], eye: '#ff4d8a', skin: '#f2d8d6', outfit: ['#1e0614', '#060003'], acc: ['horns', 'veil', 'aura', 'choker'] },
  { file: 'monarch-shade', world: 'shadow', style: 'spiky', hair: ['#1e1a28', '#030205', '#4a4062'], eye: '#9b7bff', skin: '#dec4b8', outfit: ['#120e1c', '#020104'], acc: ['aura', 'collar', 'cape'], male: true },
  { file: 'shadow-empress', world: 'shadow', style: 'long', hair: ['#231a30', '#04020a', '#5a4a7a'], eye: '#b993ff', skin: '#f2d8d4', outfit: ['#22123a', '#070212'], acc: ['crown', 'aura', 'gem'] },
  { file: 'guild-herald', world: 'crimson', style: 'twin', hair: ['#ff9aa8', '#c8102e', '#ffd6dc'], eye: '#ff2440', skin: '#fbe5da', outfit: ['#30101a', '#0c0306'], acc: ['ribbon', 'earring', 'mark'] },
  { file: 'scarlet-oracle', world: 'abyss', style: 'long', hair: ['#b01438', '#3a0410', '#ff7a94'], eye: '#ffcf6b', skin: '#f7ded2', outfit: ['#220a14', '#080204'], acc: ['roses', 'gem', 'veil'] },
  { file: 'dawn-valkyrie', world: 'dawn', style: 'wavy', hair: ['#ffe9b0', '#c98a3a', '#fff8e0'], eye: '#ff7a6b', skin: '#fbe7dc', outfit: ['#ebe6ee', '#7a6e80'], acc: ['wings', 'halo', 'armor'] },
  { file: 'dragon-heart', world: 'flame', style: 'spiky', hair: ['#ff7a44', '#7a1400', '#ffc08a'], eye: '#ffd06b', skin: '#f0ccb9', outfit: ['#30100a', '#0c0302'], acc: ['horns', 'flames', 'scar', 'cape'], male: true },
  { file: 'flame-priestess', world: 'flame', style: 'long', hair: ['#ff4a34', '#6a0a06', '#ffb08a'], eye: '#ffd06b', skin: '#f8dccc', outfit: ['#340a06', '#0c0201'], acc: ['horns', 'flames', 'gem', 'choker'] },
  { file: 's-rank-goddess', world: 'dawn', style: 'long', hair: ['#fff8ec', '#cdb8a8', '#ffffff'], eye: '#ff2440', skin: '#fce9e0', outfit: ['#f2eaf0', '#8c7e8a'], acc: ['halo', 'crown', 'wings'] },
  { file: 'shadow-monarch', world: 'void', style: 'spiky', hair: ['#16121c', '#000000', '#3a3048'], eye: '#ff2440', skin: '#dac0b4', outfit: ['#0e0b12', '#000000'], acc: ['aura', 'crown', 'collar', 'cape'], male: true },
  // ── слоты «pin-*»: свои картинки кладутся в tools/avatar-sources/<file>.(webp|png|jpg) ──
  //    focus — точка лица (0..1 по ширине/высоте картинки), zoom — увеличение при кадрировании в круг
  { file: 'pin-white-reaper', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'mono', style: 'long', hair: ['#f4f4f8', '#9a9aa6', '#ffffff'], eye: '#ff1a3a', skin: '#f4e6e2', outfit: ['#141416', '#000000'], acc: ['lace', 'tears', 'choker'], grayscale: true },
  { file: 'pin-noir-gothic', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'mono', style: 'bob', hair: ['#1a1a1e', '#000000', '#5a5a64'], eye: '#ff2440', skin: '#efe2de', outfit: ['#0c0c0e', '#000000'], acc: ['lace', 'roses', 'earring'], grayscale: true },
  { file: 'pin-crimson-smile', slot: true, focus: [0.5, 0.38], zoom: 1.15, world: 'blood', style: 'twin', hair: ['#2a2a30', '#050505', '#6a6a78'], eye: '#ff1a3a', skin: '#f6e0d8', outfit: ['#1a0206', '#000000'], acc: ['fang', 'ribbon', 'choker'] },
  { file: 'pin-moon-witch', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'shadow', style: 'long', hair: ['#e9e4f6', '#8e86ac', '#ffffff'], eye: '#b993ff', skin: '#f6e6e4', outfit: ['#1c1230', '#05020c'], acc: ['veil', 'runes', 'gem'] },
  { file: 'pin-silver-vampire', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'blood', style: 'wavy', hair: ['#d6d6de', '#6a6a78', '#ffffff'], eye: '#ff1a3a', skin: '#f2e4e4', outfit: ['#160206', '#000000'], acc: ['fang', 'lace', 'gem'] },
  { file: 'pin-raven-queen', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'void', style: 'long', hair: ['#121216', '#000000', '#44445a'], eye: '#ff2440', skin: '#eedcd6', outfit: ['#0a0a0e', '#000000'], acc: ['crown', 'lace', 'aura'] },
  { file: 'pin-bloody-lace', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'blood', style: 'ponytail', hair: ['#f0f0f4', '#a0a0aa', '#ffffff'], eye: '#ff1a3a', skin: '#f6e4de', outfit: ['#2a0208', '#060001'], acc: ['lace', 'roses', 'tears'] },
  { file: 'pin-mono-angel', slot: true, focus: [0.5, 0.36], zoom: 1.15, world: 'mono', style: 'wavy', hair: ['#fafafc', '#b4b4be', '#ffffff'], eye: '#ff2440', skin: '#f8ecea', outfit: ['#e8e8ee', '#6a6a74'], acc: ['halo', 'wings', 'lace'], grayscale: true },
];

// ───────── помощники ─────────
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const between = (a, b) => a + rand() * (b - a);
const f = n => Number(n).toFixed(1);
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(c).map(v => v.toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => [s >> 16 & 255, s >> 8 & 255, s & 255];
  const [r1, g1, b1] = ch(pa), [r2, g2, b2] = ch(pb);
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return '#' + m(r1, r2) + m(g1, g2) + m(b1, b2);
}

// Прядь волос: от основания (bx,by) шириной w к кончику (tx,ty) с изгибом bend
let LINE = '#000';
function strand(bx, by, tx, ty, w, bend, fill, extra = ` stroke="${LINE}" stroke-width="0.7" stroke-linejoin="round"`) {
  const mx = (bx + tx) / 2 + bend, my = (by + ty) / 2;
  const nx = -(ty - by), ny = tx - bx, len = Math.hypot(nx, ny) || 1;
  const ox = nx / len * w / 2, oy = ny / len * w / 2;
  const qx = bx + (tx - bx) * 0.3 - bend * 0.6, qy = by + (ty - by) * 0.3;
  return `<path d="M${f(bx - ox)} ${f(by - oy)} C${f(qx - ox * 0.9)} ${f(qy - oy * 0.9)} ${f(mx - ox * 0.45)} ${f(my - oy * 0.45)} ${f(tx)} ${f(ty)} C${f(mx + ox * 0.45)} ${f(my + oy * 0.45)} ${f(qx + ox * 0.9)} ${f(qy + oy * 0.9)} ${f(bx + ox)} ${f(by + oy)} Z" fill="${fill}"${extra}/>`;
}

const FACE_F = 'M93 106 C93 76 163 76 163 106 C163 124 160 138 151 151 C143 162 135 168 128 170 C121 168 113 162 105 151 C96 138 93 124 93 106 Z';
const FACE_M = 'M91 104 C91 74 165 74 165 104 C165 122 162 136 154 150 C146 162 137 169 128 171 C119 169 110 162 102 150 C94 136 91 122 91 104 Z';

// ───────── defs ─────────
function defs(a, w) {
  const [h0, h1, hl] = a.hair;
  return `<defs>
  <radialGradient id="sky" cx="50%" cy="40%" r="78%"><stop offset="0" stop-color="${w.sky[0]}"/><stop offset="1" stop-color="${w.sky[1]}"/></radialGradient>
  <radialGradient id="portal" cx="50%" cy="46%" r="52%">
    <stop offset="0" stop-color="${w.core}" stop-opacity="0.95"/><stop offset="0.28" stop-color="${w.mid}" stop-opacity="0.9"/>
    <stop offset="0.62" stop-color="${shade(w.mid, 0.35)}" stop-opacity="0.65"/><stop offset="1" stop-color="${w.sky[1]}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="hair" x1="0.2" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${mix(h0, hl, 0.15)}"/><stop offset="0.45" stop-color="${h0}"/><stop offset="1" stop-color="${h1}"/></linearGradient>
  <linearGradient id="hairDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(h1, 0.9)}"/><stop offset="1" stop-color="${shade(h1, 0.55)}"/></linearGradient>
  <linearGradient id="hairRim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${w.rim}" stop-opacity="0.75"/><stop offset="0.35" stop-color="${w.rim}" stop-opacity="0"/><stop offset="0.65" stop-color="${w.rim}" stop-opacity="0"/><stop offset="1" stop-color="${w.rim}" stop-opacity="0.75"/></linearGradient>
  <linearGradient id="skin" x1="0.3" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${mix(a.skin, '#ffffff', 0.25)}"/><stop offset="0.6" stop-color="${a.skin}"/><stop offset="1" stop-color="${shade(a.skin, 0.84)}"/></linearGradient>
  <linearGradient id="outfit" x1="0.2" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${mix(a.outfit[0], '#ffffff', 0.12)}"/><stop offset="0.5" stop-color="${a.outfit[0]}"/><stop offset="1" stop-color="${a.outfit[1]}"/></linearGradient>
  <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${shade(a.eye, 0.22)}"/><stop offset="0.38" stop-color="${shade(a.eye, 0.62)}"/>
    <stop offset="0.72" stop-color="${a.eye}"/><stop offset="1" stop-color="${mix(a.eye, '#ffffff', 0.55)}"/>
  </linearGradient>
  <radialGradient id="irisGlow" cx="50%" cy="78%" r="55%"><stop offset="0" stop-color="${mix(a.eye, '#ffffff', 0.7)}" stop-opacity="0.9"/><stop offset="1" stop-color="${a.eye}" stop-opacity="0"/></radialGradient>
  <radialGradient id="blush" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff5d78" stop-opacity="0.32"/><stop offset="1" stop-color="#ff5d78" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx="50%" cy="44%" r="70%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="bigGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
  <clipPath id="circle"><circle cx="128" cy="128" r="128"/></clipPath>
  <clipPath id="faceClip"><path d="${a.male ? FACE_M : FACE_F}"/></clipPath>
</defs>`;
}

// ───────── фон ─────────
function background(a, w) {
  let s = `<rect width="256" height="256" fill="url(#sky)"/>`;
  s += `<path d="M0 214 L18 176 L30 192 L44 150 L58 184 L74 164 L88 190 L104 156 L118 186 L138 140 L156 182 L170 160 L186 190 L202 152 L218 186 L236 164 L256 196 L256 256 L0 256 Z" fill="${shade(w.sky[1], 1.4)}" opacity="0.95"/>`;
  s += `<ellipse cx="128" cy="112" rx="116" ry="120" fill="url(#portal)"/>`;
  s += `<ellipse cx="128" cy="112" rx="58" ry="62" fill="${w.core}" opacity="0.18" filter="url(#bigGlow)"/>`;
  s += `<g fill="none" stroke="${w.ring}" filter="url(#glow)">
    <ellipse cx="128" cy="112" rx="98" ry="104" stroke-width="2.4" opacity="0.9"/>
    <ellipse cx="128" cy="112" rx="88" ry="94" stroke-width="0.9" opacity="0.55" stroke-dasharray="7 5 1 5"/>
    <ellipse cx="128" cy="112" rx="110" ry="116" stroke-width="0.7" opacity="0.35" stroke-dasharray="2 10"/>
  </g>`;
  let runes = '';
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2, x = 128 + Math.cos(ang) * 98, y = 112 + Math.sin(ang) * 104;
    runes += `<path d="M${f(x)} ${f(y - 3)} l3 3 l-3 3 l-3 -3 Z" fill="${w.dust}"/>`;
  }
  s += `<g filter="url(#glow)" opacity="0.85">${runes}</g>`;
  let rays = '';
  for (let i = 0; i < 9; i++) {
    const ang = between(-Math.PI, 0), len = between(70, 120);
    rays += `<path d="M128 112 L${f(128 + Math.cos(ang - 0.03) * len)} ${f(112 + Math.sin(ang - 0.03) * len)} L${f(128 + Math.cos(ang + 0.03) * len)} ${f(112 + Math.sin(ang + 0.03) * len)} Z" fill="${w.core}" opacity="0.12"/>`;
  }
  s += rays;
  let dots = '';
  for (let i = 0; i < 34; i++) {
    const x = rand() * 256, y = rand() * 220, r = between(0.4, 2);
    dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${w.dust}" opacity="${between(0.3, 0.95).toFixed(2)}"/>`;
  }
  s += `<g filter="url(#glow)">${dots}</g>`;
  return s;
}

// ───────── задние слои (за телом) ─────────
function behind(a, w) {
  let s = '';
  if (a.acc.includes('aura')) {
    s += `<g filter="url(#bigGlow)" opacity="0.95"><path d="M30 256 C20 190 50 150 62 96 C72 58 92 70 88 36 C116 66 108 16 128 0 C148 16 140 66 168 36 C164 70 184 58 194 96 C206 150 236 190 226 256 Z" fill="${shade(w.ring, 0.75)}"/></g>`;
    s += `<path d="M52 256 C46 200 70 160 80 112 C88 78 102 86 102 56 C116 80 120 38 128 20 C136 38 140 80 154 56 C154 86 168 78 176 112 C186 160 210 200 204 256 Z" fill="${w.sky[1]}" opacity="0.9"/>`;
  }
  if (a.acc.includes('flames')) {
    s += `<g filter="url(#glow)">
      <path d="M30 256 C24 200 48 186 42 146 C62 168 68 146 64 114 C86 142 92 116 88 90 C104 116 114 100 112 74 L146 74 C144 100 154 116 170 90 C166 116 172 142 194 114 C190 146 196 168 216 146 C210 186 234 200 228 256 Z" fill="#ff4a1c" opacity="0.55"/>
      <path d="M56 256 C52 214 70 200 68 170 C82 186 90 168 88 146 C102 164 108 148 106 128 L150 128 C148 148 154 164 168 146 C166 168 174 186 188 170 C186 200 204 214 200 256 Z" fill="#ffb03a" opacity="0.5"/>
    </g>`;
  }
  if (a.acc.includes('wings')) {
    const wing = side => {
      let p = '';
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 7; i++) {
          const y = 140 + i * 11 + row * 6, len = 92 - i * 8 - row * 14;
          const x0 = side < 0 ? 86 : 170;
          const tone = row === 0 ? '#f6f2fa' : row === 1 ? '#e2dbe8' : '#c6bdd0';
          p += `<path d="M${x0} ${y} q ${f(side * len * 0.55)} ${f(-34 + i * 4)} ${f(side * len)} ${f(-12 + i * 6)} q ${f(-side * len * 0.45)} 16 ${f(-side * len)} 12 Z" fill="${tone}" stroke="#8a7f92" stroke-width="0.5"/>`;
        }
      }
      return p;
    };
    s += `<g filter="url(#glow)" opacity="0.97">${wing(-1)}${wing(1)}</g>`;
  }
  if (a.acc.includes('sword')) {
    s += `<g transform="rotate(-30 128 128)">
      <path d="M121 -20 L135 -20 L135 186 L128 200 L121 186 Z" fill="#dfe3ec"/>
      <path d="M128 -20 L135 -20 L135 186 L128 200 Z" fill="#9aa2b2"/>
      <path d="M127 -20 L129 -20 L129 190 L127 190 Z" fill="#ffffff" opacity="0.9"/>
      <path d="M121 -20 L135 -20 L135 186 L128 200 L121 186 Z" fill="${w.ring}" opacity="0.22"/>
      <rect x="100" y="186" width="56" height="9" rx="4" fill="#1f1f27" stroke="${w.ring}" stroke-width="1"/>
    </g>`;
  }
  if (a.acc.includes('cape')) {
    s += `<path d="M22 256 C30 214 52 196 86 186 L170 186 C204 196 226 214 234 256 Z" fill="${shade(a.outfit[1], 1.6)}"/><path d="M22 256 C30 214 52 196 86 186" stroke="${w.rim}" stroke-width="1.5" fill="none" opacity="0.7"/>`;
  }
  return s;
}

// ───────── волосы ─────────
function backHair(a, w) {
  const long = { long: 1, wavy: 1, twin: 0.85, ponytail: 0.6, bob: 0.45, short: 0.3, spiky: 0.3, hood: 0 }[a.style] ?? 0.5;
  if (!long) return '';
  let s = '';
  const bottom = 120 + long * 136;
  s += `<path d="M76 102 C62 ${f(120 + long * 40)} ${f(66 - long * 12)} ${f(bottom - 30)} ${f(70 - long * 10)} ${f(bottom)} L${f(186 + long * 10)} ${f(bottom)} C${f(190 + long * 12)} ${f(bottom - 30)} 194 ${f(120 + long * 40)} 180 102 C174 52 82 52 76 102 Z" fill="url(#hairDark)"/>`;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bx = 82 + t * 92, by = 96 + Math.sin(t * Math.PI) * -6;
    const tx = 64 - long * 12 + t * (130 + long * 24) + between(-8, 8), ty = bottom - between(0, 44) * long;
    s += strand(bx, by, tx, ty, between(14, 24), between(-22, 22), i % 3 ? 'url(#hair)' : 'url(#hairDark)');
  }
  if (a.style === 'twin') {
    s += strand(80, 96, 34, 250, 26, -18, 'url(#hair)') + strand(176, 96, 222, 250, 26, 18, 'url(#hair)');
    s += strand(82, 100, 44, 236, 12, -12, 'url(#hairDark)') + strand(174, 100, 212, 236, 12, 12, 'url(#hairDark)');
  }
  if (a.style === 'ponytail') {
    s += strand(150, 70, 214, 240, 34, 30, 'url(#hair)') + strand(154, 74, 206, 226, 14, 24, 'url(#hairDark)');
  }
  if (a.style === 'wavy') {
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, k = i % 3;
      s += `<path d="M${128 + side * (58 + k * 6)} ${150 + k * 26} q ${side * 10} 10 0 20 q ${-side * 10} 10 0 20" stroke="${shade(a.hair[1], 0.7)}" stroke-width="1.4" fill="none" opacity="0.7"/>`;
    }
  }
  if (a.acc.includes('fox')) {
    s += `<path d="M84 84 L66 24 L114 64 Z" fill="url(#hair)"/><path d="M87 76 L76 38 L105 64 Z" fill="${w.ring}" opacity="0.85"/>
          <path d="M172 84 L190 24 L142 64 Z" fill="url(#hair)"/><path d="M169 76 L180 38 L151 64 Z" fill="${w.ring}" opacity="0.85"/>`;
  }
  return s;
}

function frontHair(a, w) {
  if (a.style === 'hood') return '';
  let s = '';
  // тень от чёлки на лбу
  s += `<path d="M96 104 C108 118 148 118 160 104 L160 116 C146 128 110 128 96 116 Z" fill="${shade(a.skin, 0.6)}" opacity="0.35" clip-path="url(#faceClip)"/>`;
  // шапка волос
  s += `<path d="M86 112 C80 64 112 48 128 48 C144 48 176 64 170 112 C160 92 148 82 128 80 C108 82 96 92 86 112 Z" fill="url(#hair)"/>`;
  const male = !!a.male;
  const spiky = a.style === 'spiky';
  const tips = male
    ? [[92, 118], [100, 112], [108, 118], [116, 110], [124, 120], [132, 110], [140, 118], [148, 110], [156, 118], [164, 114]]
    : [[92, 124], [99, 116], [106, 122], [113, 112], [120, 120], [128, 110], [136, 120], [143, 112], [150, 122], [157, 116], [164, 124]];
  tips.forEach(([tx, ty], i) => {
    const bx = 112 + (i / (tips.length - 1)) * 32 + between(-3, 3), by = 56 + between(-2, 4);
    const w2 = spiky ? between(13, 17) : between(10, 14);
    const tipY = ty + (spiky ? -8 : 0) + between(-2, 3);
    s += strand(bx, by, tx + (spiky ? between(-6, 6) : 0), tipY, w2, (tx - 128) * 0.25 + between(-4, 4), i % 4 === 1 ? 'url(#hairDark)' : 'url(#hair)');
  });
  if (spiky) {
    [[100, 60, 84, 36], [116, 52, 110, 26], [132, 50, 138, 22], [148, 54, 164, 30], [160, 64, 182, 46]].forEach(([bx, by, tx, ty]) => {
      s += strand(bx, by + 10, tx, ty, 16, 0, 'url(#hair)');
    });
  }
  const sideLen = male ? 150 : { long: 206, wavy: 200, twin: 186, ponytail: 176, bob: 170, short: 150 }[a.style] || 180;
  s += strand(94, 84, 88 + (male ? 4 : -2), sideLen, male ? 14 : 18, -6, 'url(#hair)');
  s += strand(162, 84, 168 - (male ? 4 : -2), sideLen, male ? 14 : 18, 6, 'url(#hair)');
  s += strand(98, 92, 98, sideLen - 18, 7, -4, 'url(#hairDark)') + strand(158, 92, 158, sideLen - 18, 7, 4, 'url(#hairDark)');
  // светлые прожилки на прядях чёлки
  for (let i = 0; i < 6; i++) {
    const x = 104 + i * 9 + between(-2, 2);
    s += `<path d="M${f(x)} 66 Q${f(x + (x - 128) * 0.15)} 88 ${f(x + (x - 128) * 0.28)} 104" stroke="${a.hair[2]}" stroke-width="1" fill="none" opacity="0.35" stroke-linecap="round"/>`;
  }
  // «ангельское кольцо» блика и контровой свет
  s += `<path d="M98 76 C112 66 144 66 158 76" stroke="${a.hair[2]}" stroke-width="4.5" fill="none" opacity="0.55" stroke-linecap="round" stroke-dasharray="9 4 5 3"/>`;
  s += `<path d="M102 72 C116 63 140 63 154 72" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.5" stroke-linecap="round"/>`;
  s += `<path d="M86 112 C80 64 112 48 128 48 C144 48 176 64 170 112" stroke="url(#hairRim)" stroke-width="2.4" fill="none"/>`;
  return s;
}

// ───────── тело ─────────
function body(a, w) {
  let s = '';
  s += `<path d="M113 148 L143 148 L146 188 C137 196 119 196 110 188 Z" fill="url(#skin)"/>`;
  s += `<path d="M113 150 C120 166 136 166 143 150 L144 170 C135 178 121 178 112 170 Z" fill="${shade(a.skin, 0.62)}" opacity="0.4"/>`;
  s += `<path d="M98 196 C108 200 118 198 124 194 M158 196 C148 200 138 198 132 194" stroke="${shade(a.skin, 0.7)}" stroke-width="1" fill="none" opacity="0.6"/>`;
  s += `<path d="M24 256 C30 214 66 192 106 186 C116 200 140 200 150 186 C190 192 226 214 232 256 Z" fill="url(#outfit)"/>`;
  s += `<path d="M64 220 C74 236 78 248 76 256 M192 220 C182 236 178 248 180 256 M96 208 C104 226 104 244 100 256 M160 208 C152 226 152 244 156 256" stroke="${shade(a.outfit[1], 0.6)}" stroke-width="1.4" fill="none" opacity="0.7"/>`;
  s += `<path d="M38 238 C46 216 64 202 92 194" stroke="${mix(a.outfit[0], '#ffffff', 0.4)}" stroke-width="1.2" fill="none" opacity="0.45"/>`;
  s += `<path d="M24 256 C30 214 66 192 106 186" stroke="${w.rim}" stroke-width="1.6" fill="none" opacity="0.75"/><path d="M232 256 C226 214 190 192 150 186" stroke="${w.rim}" stroke-width="1.6" fill="none" opacity="0.75"/>`;
  s += `<path d="M106 186 L128 222 L150 186" fill="${shade(a.outfit[1], 0.8)}" stroke="${w.ring}" stroke-width="1.6"/>`;
  if (a.acc.includes('armor')) {
    s += `<path d="M30 240 C36 210 62 194 98 190 C94 210 82 228 62 244 Z" fill="#dfe1e8" stroke="#5b5f6c" stroke-width="1.4"/>
          <path d="M226 240 C220 210 194 194 158 190 C162 210 174 228 194 244 Z" fill="#dfe1e8" stroke="#5b5f6c" stroke-width="1.4"/>
          <path d="M44 232 C52 214 68 202 90 198" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.8"/>
          <path d="M212 232 C204 214 188 202 166 198" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.8"/>
          <path d="M58 236 L82 208 M198 236 L174 208" stroke="${w.ring}" stroke-width="2" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('collar')) {
    s += `<path d="M92 194 L110 172 L128 206 L146 172 L164 194 L152 216 L128 226 L104 216 Z" fill="${mix(a.outfit[0], '#ffffff', 0.18)}" stroke="${w.ring}" stroke-width="1.2"/>
          <path d="M110 172 L128 206 L146 172" stroke="${shade(a.outfit[1], 0.6)}" stroke-width="1" fill="none"/>`;
  }
  if (a.acc.includes('lace')) {
    let lace = '';
    for (let i = 0; i < 9; i++) {
      const x = 96 + i * 8;
      lace += `<path d="M${x} 190 q4 10 8 0" fill="none" stroke="#f0f0f4" stroke-width="1.1" opacity="0.85"/><circle cx="${x + 4}" cy="196" r="1.2" fill="#f0f0f4" opacity="0.8"/>`;
    }
    s += `<path d="M92 188 C110 200 146 200 164 188 L160 196 C144 206 112 206 96 196 Z" fill="#0a0a0c" stroke="#f0f0f4" stroke-width="0.8"/>${lace}`;
  }
  if (a.acc.includes('choker')) {
    s += `<path d="M112 172 C122 178 134 178 144 172" stroke="#0c0306" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="128" cy="180" r="3.2" fill="${w.ring}" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('ribbon')) {
    s += `<path d="M128 212 l-18 -9 l3 18 Z M128 212 l18 -9 l-3 18 Z" fill="${w.ring}" stroke="${shade(w.ring, 0.6)}" stroke-width="0.8"/><circle cx="128" cy="212" r="3.4" fill="${shade(w.ring, 0.7)}"/>`;
  }
  if (a.acc.includes('roses')) {
    const rose = (x, y, r) => {
      let p = `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#7a0a1c"/>`;
      for (let k = 0; k < 3; k++) p += `<path d="M0 ${f(-r * (0.8 - k * 0.22))} C${f(r * (0.9 - k * 0.2))} ${f(-r * (0.6 - k * 0.2))} ${f(r * (0.7 - k * 0.2))} ${f(r * (0.55 - k * 0.15))} 0 ${f(r * (0.45 - k * 0.12))} C${f(-r * (0.65 - k * 0.2))} ${f(r * (0.35 - k * 0.1))} ${f(-r * (0.55 - k * 0.15))} ${f(-r * (0.35 - k * 0.1))} 0 ${f(-r * (0.18 - k * 0.05))}" fill="none" stroke="${k ? '#ff4d64' : '#c8102e'}" stroke-width="1.5"/>`;
      p += `<path d="M${-r} ${f(r * 0.4)} q ${f(-r * 0.8)} ${f(r * 0.2)} ${f(-r * 1.2)} ${f(r * 0.9)}" stroke="#1c3a1c" stroke-width="2" fill="none"/></g>`;
      return p;
    };
    s += `<g filter="url(#glow)">${rose(66, 214, 15)}${rose(90, 234, 10)}${rose(190, 222, 13)}${rose(170, 244, 8)}</g>`;
  }
  if (a.acc.includes('book')) {
    s += `<g transform="translate(128 238) rotate(-6)"><rect x="-36" y="-18" width="72" height="36" rx="3" fill="#3a1a14" stroke="#ffc08a" stroke-width="1.5"/><path d="M0 -18 L0 18" stroke="#ffc08a"/><path d="M-28 -8 h20 M-28 0 h20 M-28 8 h14 M8 -8 h20 M8 0 h20 M8 8 h14" stroke="#ffe8c8" stroke-width="1.1" opacity="0.85"/></g>`;
  }
  if (a.acc.includes('gem')) {
    s += `<path d="M128 210 l8 9 l-8 13 l-8 -13 Z" fill="${w.ring}" stroke="#fff" stroke-width="0.8" filter="url(#glow)"/><path d="M128 210 l-4 9 l4 13" fill="#fff" opacity="0.35"/>`;
  }
  return s;
}

// ───────── лицо ─────────
function face(a, w) {
  const male = !!a.male;
  let s = `<path d="${male ? FACE_M : FACE_F}" fill="url(#skin)" stroke="${shade(a.skin, 0.5)}" stroke-width="0.9"/>`;
  s += `<path d="M93 112 C96 136 110 156 128 170 C114 156 104 138 102 114 Z" fill="${shade(a.skin, 0.7)}" opacity="0.28"/>`;
  s += `<path d="M163 108 C162 130 154 150 140 164" stroke="${w.rim}" stroke-width="2" fill="none" opacity="0.55" filter="url(#soft)"/>`;
  s += `<path d="M93 108 C94 130 102 150 116 164" stroke="${w.rim}" stroke-width="1.4" fill="none" opacity="0.35" filter="url(#soft)"/>`;
  if (!male) s += `<ellipse cx="106" cy="141" rx="11" ry="5.5" fill="url(#blush)"/><ellipse cx="150" cy="141" rx="11" ry="5.5" fill="url(#blush)"/>
    <path d="M101 140 l3 -3 M105 141 l3 -3 M109 141 l3 -3 M147 141 l3 -3 M151 141 l3 -3 M155 140 l3 -3" stroke="#e0607a" stroke-width="0.9" opacity="0.5"/>`;
  const eye = (cx, side) => {
    const ew = male ? 10 : 11, eh = male ? 8 : 10.5, cy = male ? 125 : 126;
    let e = `<g filter="url(#soft)" opacity="0.5"><ellipse cx="${cx}" cy="${cy + 2}" rx="${f(ew * 0.7)}" ry="${eh}" fill="${a.eye}"/></g>`;
    e += `<path d="M${cx - ew} ${cy} C${cx - ew + 2} ${cy - eh} ${cx + ew - 2} ${cy - eh} ${cx + ew} ${cy - 1} C${cx + ew - 3} ${f(cy + eh * 0.8)} ${cx - ew + 3} ${f(cy + eh * 0.8)} ${cx - ew} ${cy} Z" fill="#fff8f8"/>`;
    e += `<ellipse cx="${cx}" cy="${cy + 1}" rx="${f(ew * 0.62)}" ry="${f(eh * 0.92)}" fill="url(#iris)"/>`;
    e += `<ellipse cx="${cx}" cy="${cy + 4}" rx="${f(ew * 0.5)}" ry="${f(eh * 0.45)}" fill="url(#irisGlow)"/>`;
    e += `<ellipse cx="${cx}" cy="${cy + 1}" rx="${f(ew * 0.62)}" ry="${f(eh * 0.92)}" fill="none" stroke="${shade(a.eye, 0.3)}" stroke-width="1"/>`;
    e += `<ellipse cx="${cx}" cy="${cy + 1.5}" rx="${f(ew * 0.26)}" ry="${f(eh * 0.42)}" fill="#120206"/>`;
    e += `<path d="M${cx - ew} ${cy - 1} C${cx - ew + 2} ${cy - eh} ${cx + ew - 2} ${cy - eh} ${cx + ew} ${cy - 2} L${cx + ew} ${f(cy - eh * 0.3)} C${cx + 4} ${f(cy - eh * 0.6)} ${cx - 4} ${f(cy - eh * 0.6)} ${cx - ew} ${f(cy - eh * 0.2)} Z" fill="#000" opacity="0.3"/>`;
    e += `<ellipse cx="${cx - 3 * side}" cy="${cy - 3}" rx="2.6" ry="3.2" fill="#fff"/><circle cx="${cx + 3 * side}" cy="${f(cy + 4.5)}" r="1.3" fill="#fff" opacity="0.9"/><circle cx="${f(cx + 1.5 * side)}" cy="${f(cy - 4.5)}" r="0.8" fill="#fff" opacity="0.8"/>`;
    const lw = male ? 2.8 : 3.4;
    e += `<path d="M${cx - ew - 1} ${cy + 1} C${cx - ew + 2} ${cy - eh - 1} ${cx + ew - 2} ${cy - eh - 2} ${cx + ew + 1} ${cy - 2}" fill="none" stroke="#14040a" stroke-width="${lw}" stroke-linecap="round"/>`;
    if (!male) {
      const ox = side > 0 ? cx - ew - 1 : cx + ew + 1, oy = side > 0 ? cy + 1 : cy - 2;
      e += `<path d="M${ox} ${oy} l${-4 * side} -3" stroke="#14040a" stroke-width="2.2" stroke-linecap="round"/>`;
      e += `<path d="M${cx - (ew - 4) * side} ${f(cy - eh + 1)} l${-3 * side} -3 M${cx - (ew - 8) * side} ${f(cy - eh - 0.5)} l${-2 * side} -3" stroke="#14040a" stroke-width="1.3" stroke-linecap="round"/>`;
    }
    e += `<path d="M${f(cx - ew * 0.6)} ${f(cy + eh * 0.72)} C${cx - 2} ${f(cy + eh * 0.86)} ${cx + 3} ${f(cy + eh * 0.84)} ${f(cx + ew * 0.7)} ${f(cy + eh * 0.6)}" stroke="${shade(a.hair[1], 0.8)}" stroke-width="0.9" fill="none" opacity="0.8"/>`;
    e += `<path d="M${cx - ew + 2} ${cy - eh - 3} C${cx - 3} ${cy - eh - 6} ${cx + 4} ${cy - eh - 6} ${cx + ew - 1} ${cy - eh - 3}" stroke="${shade(a.skin, 0.62)}" stroke-width="0.9" fill="none" opacity="0.7"/>`;
    const by = male ? cy - eh - 9 : cy - eh - 11;
    e += male
      ? `<path d="M${cx - ew} ${by} C${cx - 3} ${by - 3} ${cx + 4} ${by - 2} ${cx + ew + 1} ${by + 2}" stroke="${shade(a.hair[1], 0.85)}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`
      : `<path d="M${cx - ew + 1} ${by + 1} C${cx - 3} ${by - 2} ${cx + 4} ${by - 2} ${cx + ew} ${by + 1}" stroke="${shade(a.hair[1], 0.9)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    return e;
  };
  s += eye(110, 1) + eye(146, -1);
  s += `<path d="M129 136 C128 140 127 142 125 144 C127 145 129 145 131 144" fill="none" stroke="${shade(a.skin, 0.62)}" stroke-width="1.1" stroke-linecap="round"/>`;
  s += `<circle cx="130" cy="140" r="1" fill="#fff" opacity="0.6"/>`;
  if (a.acc.includes('fang')) {
    // дерзкая улыбка с клычком
    s += `<path d="M119 151 C124 157 132 157 138 150" fill="#5a0612" stroke="#2a0408" stroke-width="1.2"/><path d="M131 152.5 l1.6 3.6 l1.6 -3.4 Z" fill="#fff"/><path d="M137 150 l2 -1.5" stroke="#2a0408" stroke-width="1.2" stroke-linecap="round"/>`;
  } else if (!a.acc.includes('mask')) {
    s += male
      ? `<path d="M120 154 C124 156 132 156 137 153" fill="none" stroke="${shade(a.skin, 0.5)}" stroke-width="1.5" stroke-linecap="round"/>`
      : `<path d="M121 153 C125 156.5 131 156.5 135 153" fill="none" stroke="#b03a50" stroke-width="1.6" stroke-linecap="round"/><path d="M124 156 C127 158 129 158 132 156" fill="#ff8a9a" opacity="0.55"/><path d="M126 154.5 l3 0" stroke="#fff" stroke-width="0.8" opacity="0.6"/>`;
  }
  if (a.acc.includes('tears')) s += `<path d="M106 136 C105 142 106 148 104 154" stroke="#c8102e" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.9"/><circle cx="104" cy="155" r="1.6" fill="#c8102e"/>`;
  if (a.acc.includes('scar')) s += `<path d="M150 108 L159 142" stroke="#b8505a" stroke-width="1.6" opacity="0.85"/><path d="M152 118 l6 -2 M155 130 l6 -2" stroke="#b8505a" stroke-width="1" opacity="0.7"/>`;
  if (a.acc.includes('mark')) s += `<path d="M128 92 l4 7 l-4 7 l-4 -7 Z" fill="${w.ring}" filter="url(#glow)"/>`;
  if (a.acc.includes('mask')) s += `<path d="M92 138 C110 146 146 146 164 138 C162 160 148 174 128 178 C108 174 94 160 92 138 Z" fill="#0f0f14"/><path d="M96 145 C116 151 140 151 160 145" stroke="${w.ring}" stroke-width="1.6" opacity="0.85"/><path d="M104 160 C116 166 140 166 152 160" stroke="#26262e" stroke-width="1"/>`;
  return s;
}

// ───────── передние аксессуары ─────────
function front(a, w) {
  let s = '';
  if (a.acc.includes('hood')) {
    s += `<path d="M68 156 C54 92 86 38 128 36 C170 38 202 92 188 156 C182 122 168 96 150 86 C138 80 118 80 106 86 C88 96 74 122 68 156 Z" fill="url(#hair)"/>
          <path d="M68 156 C74 196 60 224 42 256 L84 256 C92 222 96 192 96 162 Z M188 156 C182 196 196 224 214 256 L172 256 C164 222 160 192 160 162 Z" fill="url(#hairDark)"/>
          <path d="M104 86 C118 80 138 80 152 86" stroke="${w.ring}" stroke-width="1.6" opacity="0.7"/>
          <path d="M68 156 C54 92 86 38 128 36 C170 38 202 92 188 156" stroke="url(#hairRim)" stroke-width="2.4" fill="none"/>`;
  }
  if (a.acc.includes('helmet')) {
    s += `<path d="M82 98 C84 58 172 58 174 98 L166 96 C160 76 96 76 90 96 Z" fill="#a0a6b4" stroke="#4a4f5c" stroke-width="1.5"/><path d="M92 92 C100 74 156 74 164 92" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.7"/><path d="M128 60 L128 86" stroke="${w.ring}" stroke-width="2.4" filter="url(#glow)"/>`;
  }
  if (a.acc.includes('horns')) {
    s += `<path d="M98 74 C84 54 78 36 90 18 C92 40 100 54 112 64 Z" fill="#1a0b0e" stroke="${w.ring}" stroke-width="1.2"/><path d="M94 60 C90 50 88 40 90 30" stroke="${w.rim}" stroke-width="1" fill="none" opacity="0.8"/>
          <path d="M158 74 C172 54 178 36 166 18 C164 40 156 54 144 64 Z" fill="#1a0b0e" stroke="${w.ring}" stroke-width="1.2"/><path d="M162 60 C166 50 168 40 166 30" stroke="${w.rim}" stroke-width="1" fill="none" opacity="0.8"/>`;
  }
  if (a.acc.includes('crown')) {
    s += `<g filter="url(#glow)"><path d="M98 66 L104 40 L116 56 L128 30 L140 56 L152 40 L158 66 Z" fill="#d2d4dc" stroke="${w.ring}" stroke-width="1.5"/><path d="M100 66 L156 66" stroke="#fff" stroke-width="1" opacity="0.7"/><circle cx="128" cy="52" r="4" fill="${w.ring}"/><circle cx="110" cy="58" r="2" fill="${w.ring}"/><circle cx="146" cy="58" r="2" fill="${w.ring}"/></g>`;
  }
  if (a.acc.includes('tiara')) {
    s += `<path d="M102 80 Q128 62 154 80" stroke="#eceef4" stroke-width="3.2" fill="none"/><path d="M128 70 l5 -9 l-5 -9 l-5 9 Z" fill="${w.ring}" filter="url(#glow)"/><circle cx="112" cy="74" r="2" fill="${w.ring}"/><circle cx="144" cy="74" r="2" fill="${w.ring}"/>`;
  }
  if (a.acc.includes('halo')) s += `<ellipse cx="128" cy="38" rx="36" ry="9" fill="none" stroke="#ffe8b8" stroke-width="4" filter="url(#glow)"/><ellipse cx="128" cy="38" rx="36" ry="9" fill="none" stroke="#fff" stroke-width="1.2"/>`;
  if (a.acc.includes('veil')) s += `<path d="M78 98 C66 150 62 204 70 256 L92 256 C84 204 86 150 96 108 Z M178 98 C190 150 194 204 186 256 L164 256 C172 204 170 150 160 108 Z" fill="${w.ring}" opacity="0.26"/>`;
  if (a.acc.includes('earring')) s += `<path d="M92 142 l0 8" stroke="#ddd" stroke-width="1"/><circle cx="92" cy="152" r="3" fill="${w.ring}" filter="url(#glow)"/><path d="M164 142 l0 8" stroke="#ddd" stroke-width="1"/><circle cx="164" cy="152" r="3" fill="${w.ring}" filter="url(#glow)"/>`;
  if (a.acc.includes('runes')) {
    let r = '';
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.3, x = 128 + Math.cos(ang) * 112, y = 128 + Math.sin(ang) * 112;
      r += `<text x="${f(x)}" y="${f(y)}" font-size="13" text-anchor="middle" fill="${w.dust}" font-family="serif">${'ᚠᚢᚦᚨᚱᚲᚷᚹ'[i]}</text>`;
    }
    s += `<g filter="url(#glow)" opacity="0.9">${r}</g>`;
  }
  return s;
}

// Своя картинка для слота: tools/avatar-sources/<file>.(webp|png|jpg|jpeg) → встраивается в тот же SVG
const SOURCES = path.join(ROOT, 'tools', 'avatar-sources');
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
function slotPhoto(a) {
  if (!a.slot) return null;
  for (const ext of Object.keys(MIME)) {
    const p = path.join(SOURCES, a.file + '.' + ext);
    if (existsSync(p)) return { data: readFileSync(p).toString('base64'), mime: MIME[ext], name: path.basename(p) };
  }
  return null;
}
// Кадрирование: картинка «cover» в квадрат 256, затем увеличение zoom с центром в точке лица focus
function photoSvg(a, w, ph) {
  const z = a.zoom || 1.15, [fx, fy] = a.focus || [0.5, 0.38];
  const size = 256 * z;
  const x = 128 - fx * size, y = 128 - fy * size;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" width="256" height="256">
<defs><clipPath id="circle"><circle cx="128" cy="128" r="128"/></clipPath>
<radialGradient id="vig" cx="50%" cy="44%" r="70%"><stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient></defs>
<g clip-path="url(#circle)">
  <rect width="256" height="256" fill="#0a0506"/>
  <image x="${f(Math.min(0, Math.max(256 - size, x)))}" y="${f(Math.min(0, Math.max(256 - size, y)))}" width="${f(size)}" height="${f(size)}" preserveAspectRatio="xMidYMid slice" href="data:${ph.mime};base64,${ph.data}" xlink:href="data:${ph.mime};base64,${ph.data}"/>
  <rect width="256" height="256" fill="url(#vig)"/>
  <circle cx="128" cy="128" r="126.5" fill="none" stroke="${w.ring}" stroke-width="2" opacity="0.4"/>
</g>
</svg>
`;
}

let made = 0, photos = [], waiting = [];
for (const [i, a] of AVATARS.entries()) {
  seed = 7919 * (i + 3);
  const w = WORLDS[a.world];
  const ph = slotPhoto(a);
  if (ph) {
    writeFileSync(path.join(OUT, a.file + '.svg'), photoSvg(a, w, ph));
    photos.push(a.file + ' ← ' + ph.name);
    made++;
    continue;
  }
  if (a.slot) waiting.push(a.file);
  LINE = shade(a.hair[1], 0.45);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${defs(a, w)}
<g clip-path="url(#circle)">
  ${background(a, w)}
  <g transform="translate(128 140) scale(1.38) translate(-128 -124)">
    ${behind(a, w)}
    ${backHair(a, w)}
    ${body(a, w)}
    ${face(a, w)}
    ${frontHair(a, w)}
    ${front(a, w)}
  </g>
  <rect width="256" height="256" fill="url(#vig)"/>
  <circle cx="128" cy="128" r="126.5" fill="none" stroke="${w.ring}" stroke-width="2" opacity="0.35"/>
</g>
</svg>
`;
  writeFileSync(path.join(OUT, a.file + '.svg'), svg);
  made++;
}
console.log(`готово: ${made} аватарок → img/avatars/`);
if (photos.length) console.log('встроены свои картинки:\n  ' + photos.join('\n  '));
if (waiting.length) console.log('слоты без своей картинки (нарисованы генератором) — можно положить в tools/avatar-sources/:\n  ' + waiting.map(n => n + '.webp | .png | .jpg').join('\n  '));

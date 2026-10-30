/* Pure color math; no DOM or network dependencies. */
(function (root) {
  'use strict';
  const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
  const wrap = h => ((h % 360) + 360) % 360;
  const validHex = value => /^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(value));
  function normalizeHex(value) {
    if (!validHex(value)) return null;
    let s = value.replace('#', '');
    if (s.length === 3) s = [...s].map(c => c + c).join('');
    return '#' + s.toUpperCase();
  }
  function hexToRgb(hex) {
    const h = normalizeHex(hex);
    if (!h) throw new Error('Invalid HEX color');
    return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  const rgbToHex = rgb => '#' + rgb.map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  function rgbToHsv(rgb, fallbackHue = 0) {
    const [r, g, b] = rgb.map(x => x / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = fallbackHue;
    if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [wrap(h), max ? d / max * 100 : 0, max * 100];
  }
  function hsvToRgb([h, s, v]) {
    h = wrap(h) / 60; s = clamp(s / 100); v = clamp(v / 100);
    const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
    const parts = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return parts.map(p => (p + m) * 255);
  }
  function rgbToCmyk(rgb) {
    const [r, g, b] = rgb.map(x => x / 255), k = 1 - Math.max(r, g, b);
    return k >= 1 - 1e-10 ? [0, 0, 0, 100] : [(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100];
  }
  const cmykToRgb = ([c, m, y, k]) => [c, m, y].map(v => 255 * (1 - clamp(v / 100)) * (1 - clamp(k / 100)));
  function rgbToHsl(rgb) {
    const [h, s, v] = rgbToHsv(rgb), l = v / 100 * (1 - s / 200);
    return [h, l === 0 || l === 1 ? 0 : (v / 100 - l) / Math.min(l, 1 - l) * 100, l * 100];
  }
  const toLinear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  const fromLinear = x => x <= .0031308 ? 12.92 * x : 1.055 * Math.max(0, x) ** (1 / 2.4) - .055;
  const luminance = hex => hexToRgb(hex).map(v => toLinear(v / 255)).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }
  const textOn = hex => contrast(hex, '#FFFFFF') > contrast(hex, '#24272A') ? '#FFFFFF' : '#24272A';
  function rgbToOklch(rgb) {
    const [r, g, b] = rgb.map(v => toLinear(v / 255));
    const l = Math.cbrt(.4122214708*r + .5363325363*g + .0514459929*b);
    const m = Math.cbrt(.2119034982*r + .6806995451*g + .1073969566*b);
    const s = Math.cbrt(.0883024619*r + .2817188376*g + .6299787005*b);
    const L = .2104542553*l + .793617785*m - .0040720468*s;
    const a = 1.9779984951*l - 2.428592205*m + .4505937099*s;
    const bb = .0259040371*l + .7827717662*m - .808675766*s;
    return [L, Math.hypot(a, bb), wrap(Math.atan2(bb, a) * 180 / Math.PI)];
  }
  function oklchToLinear([L, C, H]) {
    const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    const l = (L + .3963377774*a + .2158037573*b) ** 3;
    const m = (L - .1055613458*a - .0638541728*b) ** 3;
    const s = (L - .0894841775*a - 1.291485548*b) ** 3;
    return [4.0767416621*l - 3.3077115913*m + .2309699292*s, -1.2684380046*l + 2.6097574011*m - .3413193965*s, -.0041960863*l - .7034186147*m + 1.707614701*s];
  }
  function oklchToHex([L, C, H]) {
    // Reduce chroma, retaining hue and lightness, until the color fits sRGB.
    L = clamp(L); C = Math.max(0, C); H = wrap(H);
    let rgb = oklchToLinear([L, C, H]);
    if (!rgb.every(x => x >= -1e-7 && x <= 1.0000001)) {
      let low = 0, high = C;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2, test = oklchToLinear([L, mid, H]);
        if (test.every(x => x >= 0 && x <= 1)) low = mid; else high = mid;
      }
      rgb = oklchToLinear([L, low, H]);
    }
    return rgbToHex(rgb.map(v => fromLinear(clamp(v)) * 255));
  }
  function related(base, relation) {
    const [L, C, H] = rgbToOklch(hexToRgb(base)), c = Math.max(.045, C);
    const specs = relation === 'complement' ? [[L,c,H-12],[L,c,H],[L,c,H+180],[Math.min(.88,L+.18),c*.6,H+180],[Math.max(.25,L-.18),c*.8,H+180]]
      : relation === 'triadic' ? [[L,c,H],[L,c,H+120],[L,c,H+240],[Math.min(.88,L+.2),c*.6,H+120],[Math.max(.25,L-.17),c*.8,H+240]]
      : relation === 'tonal' ? [.94,.78,L,.4,.23].map(l => [l,C * (.45 + .55 * (1 - Math.abs(l-L))),H])
      : [-30,-15,0,15,30].map(offset => [L,c,H+offset]);
    const result = specs.map(oklchToHex);
    result[relation === 'complement' ? 1 : relation === 'triadic' ? 0 : 2] = normalizeHex(base);
    return result;
  }
  function random(seed) {
    let a = seed >>> 0;
    return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function shuffle(values, rnd) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function distribute(choices, size, previous, rnd) {
    const deck = shuffle(Array.from({length:size}, (_, i) => choices[i % choices.length]), rnd);
    if (!previous.length || new Set(choices).size === 1) return deck;
    // Match a balanced, shuffled deck to slots without repeating the last batch.
    const owners = Array(size).fill(-1);
    function place(slot, visited) {
      for (let i = 0; i < size; i++) {
        if (visited.has(i) || deck[i] === previous[slot]) continue;
        visited.add(i);
        if (owners[i] === -1 || place(owners[i], visited)) { owners[i] = slot; return true; }
      }
      return false;
    }
    for (let slot = 0; slot < size; slot++) {
      if (!place(slot, new Set())) return deck;
    }
    const result = Array(size);
    owners.forEach((slot, i) => result[slot] = deck[i]);
    return result;
  }
  const hueRules = {analogous:[0,24,-28,48,-12,65], complement:[0,180,12,194,-14,165], split:[0,155,205,15,175,-18], triadic:[0,120,240,12,135,255], tetradic:[0,90,180,270,15,195], mono:[0,0,0,0,0,0]};
  const lightnessPatterns = [[.94,.35,.72,.84,.52,.62],[.3,.86,.62,.94,.46,.77],[.83,.45,.93,.65,.3,.74],[.92,.64,.32,.79,.5,.87],[.4,.89,.69,.95,.55,.78],[.86,.32,.61,.76,.95,.48]];
  const effectLabels = {harmony:'和谐',impact:'冲击',muted:'低饱和',vivid:'高饱和',dark:'暗调',light:'亮调',warm:'暖调',cool:'冷调'};
  const ruleLabels = {analogous:'邻近色',complement:'互补色',split:'分裂互补',triadic:'三等分',tetradic:'四等分',mono:'单色系'};
  function generate({base, count = 5, effect = 'harmony', rule = 'auto', lock = true, seed = 1, offset = 0, size = 12, previous = []}) {
    const rnd = random(seed + offset * 113), [baseL, baseC, rawH] = rgbToOklch(hexToRgb(base));
    const baseH = baseC < .005 ? rgbToOklch(hsvToRgb([257,40,65]))[2] : rawH;
    const autoRules = effect === 'impact' || effect === 'vivid' ? ['complement','split','triadic','tetradic'] : ['analogous','split','complement','mono','analogous','triadic'];
    const rules = distribute(rule === 'auto' ? autoRules : [rule], size, previous.map(p => p.rule), rnd);
    const variants = distribute(lightnessPatterns.map((_, i) => i), size, previous.map(p => p.variant), rnd);
    return Array.from({length:size}, (_, index) => {
      const idx = index + offset, currentRule = rules[index], variant = variants[index];
      const hueOffsets = hueRules[currentRule] || hueRules.analogous, pattern = lightnessPatterns[variant];
      const lightnesses = pattern.slice(0,count).map(l => l + (rnd()-.5)*.08);
      if (effect === 'dark') lightnesses.forEach((v,i) => lightnesses[i] = .19 + v*.38);
      if (effect === 'light') lightnesses.forEach((v,i) => lightnesses[i] = .72 + v*.25);
      if (effect === 'impact') lightnesses.forEach((v,i) => lightnesses[i] = i%2 ? .36 + rnd()*.14 : .82 + rnd()*.13);
      const anchor = lightnesses.reduce((best,l,i,arr) => Math.abs(l-baseL) < Math.abs(arr[best]-baseL) ? i : best, 0);
      const chroma = effect === 'muted' ? .025 + rnd()*.025 : effect === 'vivid' ? .17 + rnd()*.06 : effect === 'impact' ? .13 + rnd()*.06 : clamp(baseC*.8,.055,.12);
      const temperature = effect === 'warm' ? 65 + (rnd()-.5)*24 : effect === 'cool' ? 235 + (rnd()-.5)*30 : null;
      const colors = lightnesses.map((l,i) => {
        const shift = hueOffsets[(i-anchor+count) % count] || 0;
        let H = baseH + shift + (currentRule === 'mono' ? 0 : (rnd()-.5)*14);
        if (temperature !== null) {
          // Compress hue relationships into a warm or cool region in OKLCH.
          const distance = wrap(H - temperature + 180) - 180;
          H = temperature + distance * (effect === 'warm' ? .24 : .3);
        }
        let C = chroma * (.7 + rnd()*.45);
        if (effect !== 'vivid' && effect !== 'impact') {
          // A quiet neutral anchors each group alongside a more chromatic accent.
          if (l > .88) C *= .3;
          else if (l < .36) C *= .55;
          else if (i === (anchor+2)%count) C *= .62;
        }
        if (effect === 'light') C *= .7;
        return oklchToHex([clamp(l,.13,.98),C,H]);
      });
      if (lock) colors[anchor] = normalizeHex(base);
      // Avoid duplicate rounded hex values for black/white and neutral seeds.
      const used = new Set();
      colors.forEach((color,i) => {
        let attempt = 0;
        while (used.has(colors[i]) && attempt++ < 12) {
          const [l,c,h] = rgbToOklch(hexToRgb(color));
          colors[i] = oklchToHex([clamp(l + (i%2 ? 1 : -1)*attempt*.018,.08,.98),c,h]);
        }
        used.add(colors[i]);
      });
      return {id:colors.join('').replaceAll('#',''),colors,rule:currentRule,variant,effect,base:normalizeHex(base),serial:idx+1};
    });
  }
  const api = {clamp,wrap,validHex,normalizeHex,hexToRgb,rgbToHex,rgbToHsv,hsvToRgb,rgbToCmyk,cmykToRgb,rgbToHsl,rgbToOklch,oklchToHex,contrast,textOn,related,generate,effectLabels,ruleLabels};
  root.ColorEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

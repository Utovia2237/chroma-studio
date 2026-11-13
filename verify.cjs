// Run with node verify.cjs; no dependencies or browser required.
const assert = require('node:assert/strict');
const C = require('./color-engine.js');
let passed = 0;
function check(name, test) { test(); passed++; console.log(`PASS ${name}`); }
const colors = ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#123ABC'];
check('RGB / HEX, HSV and CMYK roundtrips', () => {
  for (const hex of colors) {
    const rgb = C.hexToRgb(hex);
    assert.equal(C.rgbToHex(rgb),hex);
    assert.equal(C.rgbToHex(C.hsvToRgb(C.rgbToHsv(rgb))),hex);
    assert.equal(C.rgbToHex(C.cmykToRgb(C.rgbToCmyk(rgb))),hex);
  }
});
check('WCAG black / white is 21:1', () => {
  assert.equal(C.contrast('#000000','#FFFFFF'),21);
  assert.equal(C.contrast('#FF0000','#FF0000'),1);
});
check('Locked seeds remain exact across counts and effects', () => {
  for (const base of colors) for (let count=2; count<=6; count++) for (const effect of Object.keys(C.effectLabels)) {
    const palettes = C.generate({base,count,effect,lock:true,seed:13});
    assert.ok(palettes.every(p => p.colors.length===count && p.colors.includes(base)));
  }
});
for (let count=2; count<=6; count++) {
  check(`Custom ${count} colors: exact values, shuffle, append, no mutation`, () => {
    const selected = colors.slice(0,count), before = [...selected];
    const a = C.generateCustom({colors:selected,seed:13});
    const b = C.generateCustom({colors:selected,seed:45,previous:a});
    const appended = C.generateCustom({colors:selected,seed:78,offset:12,previous:b});
    for (const p of [...a,...b,...appended]) {
      assert.deepEqual([...p.colors].sort(),[...selected].sort());
      assert.deepEqual([...p.slots].sort(),selected.map((_,i)=>i));
    }
    assert.equal(a.length,12);
    assert.ok(a.every((p,i) => p.colors.join()!==b[i].colors.join()));
    assert.ok(b.every((p,i) => p.colors.join()!==appended[i].colors.join()));
    assert.equal(appended[0].serial,13);
    assert.deepEqual(selected,before);
  });
}
check('Custom duplicate choices stay exact', () => {
  const selected = ['#112233','#112233','#FFFFFF'];
  for (const p of C.generateCustom({colors:selected})) assert.deepEqual([...p.colors].sort(),[...selected].sort());
});
console.log(`${passed} checks passed, 0 failed`);

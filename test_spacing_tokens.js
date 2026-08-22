#!/usr/bin/env node
// P5 spacing/radius tokenization acceptance test.
// Verifies: (1) :root has the 10 spacing tokens, (2) no bare mapped spacing px
// in margin/padding/gap rules, (3) no bare border-radius px (except 999px capsule),
// (4) safety: box-shadow / font-size / border:1px / transform px untouched.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

// 1. tokens present
['--sp-1:4px','--sp-2:8px','--sp-3:12px','--sp-4:16px','--sp-5:20px','--sp-6:24px','--sp-7:32px','--sp-10:40px','--gap: 12px','--section-gap: 16px']
  .forEach(t => ok('token '+t, css.includes(t)));

// 2. no bare MAPPED spacing px in margin/padding/gap (4/8/12/16/20/24/32/40)
const mapped = [4,8,12,16,20,24,32,40];
let spacingViolations = 0;
css.split('\n').forEach((line, i) => {
  if (line.includes(':root') || line.trim().startsWith('--')) return;
  const m = line.match(/(margin|padding|gap|margin-top|margin-bottom|margin-left|margin-right|padding-top|padding-bottom|padding-left|padding-right)\s*:[^;]*(\d+)px/g);
  if (!m) return;
  m.forEach(seg => {
    const v = parseInt(seg.match(/(\d+)px/)[1], 10);
    // allow non-grid values (2/6/10/14/36 etc) which are outside the 8-value map
    if (mapped.includes(v) && !seg.includes('var(')) spacingViolations++;
  });
});
ok('no bare mapped spacing px', spacingViolations === 0);

// 3. no bare border-radius px except 999px and var()
let radViolations = 0;
css.split('\n').forEach(line => {
  if (line.includes(':root') || line.trim().startsWith('--')) return;
  const m = line.match(/border-radius\s*:[^;]*(\d+)px/g);
  if (!m) return;
  m.forEach(seg => {
    const v = parseInt(seg.match(/(\d+)px/)[1], 10);
    if (v !== 999 && !seg.includes('var(')) radViolations++;
  });
});
ok('no bare border-radius px (except 999 capsule)', radViolations === 0);

// 4. safety: these px types must remain
ok('box-shadow px preserved', /box-shadow:[^;]*\d+px/.test(css));
ok('font-size px preserved', /font-size:[^;]*\d+px/.test(css));
ok('border:1px preserved', (css.match(/border:\s*1px/g) || []).length > 0);
ok('transform px preserved', /transform:[^;]*\d+px/.test(css));

console.log(`P5 spacing test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

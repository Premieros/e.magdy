import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const refinement=css.split('READABILITY & ACCESSIBILITY REFINEMENT')[1];
const rgbVar=(name)=>{
  const m=refinement.match(new RegExp('--'+name+':\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)'));
  assert.ok(m,'missing contrast color '+name);
  return m.slice(1).map(Number);
};
const lum=rgb=>{
  const a=rgb.map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  return .2126*a[0]+.7152*a[1]+.0722*a[2];
};
const contrast=(a,b)=>{
  const x=lum(a),y=lum(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
test('secondary and semantic text contrast meets 4.5:1 on light surfaces',()=>{
  const colors=['ui-muted','ui-subtle','ui-success-ink','ui-warning-ink','ui-danger-ink','ui-link-ink'];
  for(const name of colors){
    const c=rgbVar(name);
    const ratio=contrast(c,[255,255,255]);
    assert.ok(ratio>=4.5,name+' contrast '+ratio.toFixed(2));
  }
  assert.ok(contrast(rgbVar('ui-warning-ink'),[255,251,235])>=4.5);
  assert.ok(contrast(rgbVar('ui-success-ink'),[236,253,245])>=4.5);
  assert.ok(contrast(rgbVar('ui-danger-ink'),[254,242,242])>=4.5);
});
test('new readability overrides avoid illegible text sizes',()=>{
  assert.ok(refinement);
  const sizes=[...refinement.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
  assert.ok(sizes.length>=25,'expected broad coverage of secondary UI');
  assert.ok(Math.min(...sizes)>=12,'minimum displayed font size must be 12px');
  assert.match(refinement,/body\s*\{\s*font-size:15px/);
  assert.match(refinement,/\.nav \.nav-icon,\.nav \.nav-label\{color:inherit;margin:0\}/);
  assert.match(refinement,/@media\(max-width:760px\)/);
  assert.match(refinement, /\.nav \.nav-label\{font-size:12px\}/);
  assert.match(refinement,/\.pill\.green/);
  assert.match(refinement,/\.pill\.gold/);
  assert.match(refinement,/\.pill\.red/);
  assert.match(refinement,/@media\(prefers-contrast:more\)/);
});
test('central cloud order list opens readable read-only SKU details',()=>{
  assert.match(app,/table\(\['العميل','التواصل','القطع','القيمة','التاريخ','الحالة',''\]/);
  assert.match(app,/data-act="view-cloud-intake"/);
  assert.match(app,/if\(kind==='view-cloud-intake'\)/);
  assert.match(app,/x\.factory_id===cloudFactorySelected/);
  assert.match(app,/const totals=intakeOrderTotal\(o\)/);
  assert.match(app,/esc\(l\.sku\)/);
  assert.match(app,/esc\(l\.color\|\|'—'\)/);
  assert.match(app,/esc\(o\.notes\)/);
  assert.match(app,/بنود الطلب/);
  assert.match(app,/الاعتماد والتعديل وحجز المخزون لم تُفعّل بعد/);
  assert.match(css,/\.intake-detail\{width:min\(850px,100%\)\}/);
  assert.match(css,/\.order-detail-summary/);
});

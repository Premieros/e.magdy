import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_UI, UI_STORAGE_KEY, readUI, setUI, translateText, translateFragment, applyDocumentUI } from '../src/i18n.mjs';
import { __test as factory } from '../app.js';

const memory=()=>{
  const values=new Map();
  return {
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value)),
    values
  };
};
test('defaults stay Arabic / daytime; saved language and theme survive a reload independently of factory data',()=>{
  const storage=memory();
  assert.deepEqual(readUI(storage),DEFAULT_UI);
  assert.deepEqual(setUI({lang:'en',theme:'dark'},storage),{lang:'en',theme:'dark'});
  assert.deepEqual(readUI(storage),{lang:'en',theme:'dark'});
  assert.equal(storage.values.has('premieros-garments-local-v1'),false);
  assert.equal(storage.values.has(UI_STORAGE_KEY),true);
  setUI({lang:'ar',theme:'dark'},storage);
  assert.deepEqual(readUI(storage),{lang:'ar',theme:'dark'});
  setUI({lang:'ar',theme:'light'},storage);
  assert.deepEqual(readUI(storage),DEFAULT_UI);
});
test('corrupt or unknown saved preferences safely fall back to Arabic / light',()=>{
  const storage=memory();
  storage.setItem(UI_STORAGE_KEY,'not-json');
  assert.deepEqual(readUI(storage),DEFAULT_UI);
  storage.setItem(UI_STORAGE_KEY,JSON.stringify({lang:'fr',theme:'solar'}));
  assert.deepEqual(readUI(storage),DEFAULT_UI);
  storage.setItem(UI_STORAGE_KEY,JSON.stringify({lang:'en',theme:'dark'}));
  assert.deepEqual(readUI(storage),{lang:'en',theme:'dark'});
});
test('core pages, production stages, accounting, user roles and controls have English equivalents',()=>{
  for(const [ar,en] of [
    ['الرئيسية','Dashboard'],
    ['المستخدمون والصلاحيات','Users & Permissions'],
    ['الحسابات','Accounting'],
    ['فرز بدائي','Initial sorting'],
    ['جودة البرزنتيشن','Presentation quality'],
    ['نسبة اجتياز الجودة','Quality pass rate'],
    ['إدارة الإنتاج','Production Management'],
    ['الموقع مفتوح للجميع حاليًا — لم نفعّل تسجيل الدخول','The site remains open — login has not been enabled'],
    ['المبلغ بالجنيه','Amount (EGP)'],
    ['حفظ البيانات','Save']
  ])assert.equal(translateText(ar,'en'),en);
  assert.equal(translateText('الرئيسية','ar'),'الرئيسية');
});
test('dynamic counts and customer names are never rewritten as database values',()=>{
  const initial='تم تسجيل 4 حركات في مركز الإشعارات';
  const output=translateText(initial,'en');
  assert.match(output,/4/);
  assert.match(output,/Notification/);
  assert.equal(translateText('Client X / 123','en'),'Client X / 123');
  const d=factory.fresh();
  d.styles.push({id:'model',name:'منتج اختباري'});
  translateText(d.styles[0].name,'en');
  assert.equal(d.styles[0].name,'منتج اختباري');
});
test('language switch sets correct RTL/LTR and theme sets document color scheme',()=>{
  const meta={value:'',setAttribute(_key,v){this.value=v;}};
  const document={
    documentElement:{lang:'',dir:'',dataset:{},style:{}},title:'',
    querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null
  };
  applyDocumentUI({lang:'en',theme:'dark'},document);
  assert.equal(document.documentElement.dir,'ltr');
  assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal(document.documentElement.style.colorScheme,'dark');
  assert.equal(document.title,'White tex | Production Management');
  assert.equal(meta.value,'#0b1220');
  applyDocumentUI(DEFAULT_UI,document);
  assert.equal(document.documentElement.dir,'rtl');
  assert.equal(document.documentElement.dataset.theme,'light');
  assert.equal(document.title,'White tex | إدارة الإنتاج');
});
test('HTML localization changes text and labels while preserving form values',()=>{
  const textNode={nodeValue:'الرئيسية'};
  const input={
    attrs:{placeholder:'ابحث باسم المنتج...',value:'القص'},
    hasAttribute(k){return Object.hasOwn(this.attrs,k);},
    getAttribute(k){return this.attrs[k]},
    setAttribute(k,v){this.attrs[k]=v}
  };
  const doc={
    defaultView:{NodeFilter:{SHOW_TEXT:4}},
    createTreeWalker:()=>({nextNode:(()=>{let first=true;return ()=>first?(first=false,{
      ...textNode,parentElement:{tagName:'SPAN',closest:()=>null,isContentEditable:false}
    }):null;})()})
  };
  const root={ownerDocument:doc,querySelectorAll:()=>[input],hasAttribute:()=>false};
  translateFragment(root,'en');
  // Value is business data: translate labels but not value="..." or stored records.
  assert.equal(input.attrs.value,'القص');
  assert.equal(input.attrs.placeholder,'Search by product name...');
});
test('GitHub Pages packages localization and keeps no forced login',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const cloud=readFileSync(new URL('../src/cloud-backup.mjs',import.meta.url),'utf8');
  assert.match(app,/data-act="toggle-theme"/);
  assert.match(app,/data-act="toggle-lang"/);
  assert.match(app,/translateFragment\(document\.getElementById\('app'\),ui\.lang\)/);
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(css,/html\[dir="ltr"\]/);
  assert.match(pages,/src\/i18n\.mjs/);
  assert.match(index,/white-tex-display-v1/);
  assert.match(cloud,/yumeijsyiphzdsulsubf\.supabase\.co/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../app-icon.svg', import.meta.url), 'utf8');
const publish = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('garments use original PremierOS Cairo and Inter typefaces', () => {
  assert.match(html, /family=Cairo:wght@400;500;600;700;800/);
  assert.match(html, /family=Inter:wght@400;500;600;700;800/);
  assert.match(css, /font-family:\s*'Cairo','Inter'/);
  assert.match(css, /--ui-primary:\s*37 99 235/);
  assert.match(css, /--ui-page:\s*245 247 250/);
});

test('branded logo and keyboard-accessible navigation survive theme change', () => {
  assert.match(icon, /<svg\b/);
  assert.match(html, /href="\.\/app-icon\.svg"/);
  assert.match(app, /class="logo-icon"/);
  assert.match(app, /class="nav-label"/);
  assert.match(app, /data-act=\\?"nav\\?"/);
  assert.match(css, /\.nav:focus-visible|:focus-visible/);
});

test('GitHub Pages publishes the icon and stylesheet alongside the app', () => {
  assert.match(publish, /cp index\.html styles\.css app\.js app-icon\.svg site\//);
  assert.match(publish, /grep -q 'family=Cairo'/);
  assert.match(css, /@media \(max-width:760px\)/);
});

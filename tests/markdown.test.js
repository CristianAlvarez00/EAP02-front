import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderMarkdown, safeHttpsUrl } from '../src/markdown.js';

test('resalta bloques de código y mantiene el lenguaje como texto', () => {
  const html = renderMarkdown('Prueba\n\n```java\npublic class Demo { return "ok"; }\n```');
  assert.match(html, /<p>Prueba<\/p>/);
  assert.match(html, /<span>java<\/span>/);
  assert.match(html, /tok-key[^>]*>public/);
  assert.match(html, /data-action="copy-code"/);
});

test('escapa HTML ajeno en texto, lenguaje y código', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n```<script>\n</code><script>alert(1)</script>\n```');
  assert.doesNotMatch(html, /<img|<script|<\/code><script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(escapeHtml('"&<>'), '&quot;&amp;&lt;&gt;');
});

test('solo acepta enlaces HTTPS para repositorios y avatares', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpsUrl('http://example.com'), '');
  assert.equal(safeHttpsUrl('https://github.com/ana/demo'), 'https://github.com/ana/demo');
});

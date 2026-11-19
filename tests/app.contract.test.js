import test from 'node:test';
import assert from 'node:assert/strict';

test('la portada y el detalle consumen el contrato real de la API', async () => {
  const main = { innerHTML: '' };
  const session = { innerHTML: '' };
  const toast = { innerHTML: '', classList: { toggle() {} }, hidden: true };
  const handlers = {};
  const calls = [];
  const id = 'c9b5f84a-9d23-46a7-8fe1-b66e368e33ca';
  const answer = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return body; } });

  globalThis.document = {
    querySelector(selector) { return { '#contenido': main, '#session-area': session, '#toast': toast }[selector]; },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { handlers[name] = callback; }
  };
  globalThis.window = { addEventListener(name, callback) { handlers[name] = callback; } };
  globalThis.location = { hash: '' };
  globalThis.fetch = async (path, options = {}) => {
    calls.push(`${options.method || 'GET'} ${path}`);
    if (path.endsWith('/auth/refresco')) return answer(401, { message: 'Sin sesión' });
    if (path.startsWith('/api/v1/discusiones?')) return answer(200, { contenido: [], cursorSiguiente: null, hayMas: false });
    if (path.startsWith('/api/v1/proyectos?')) return answer(200, { contenido: [], cursorSiguiente: null, hayMas: false });
    if (path === `/api/v1/discusiones/${id}`) return answer(200, {
      id, titulo: 'Cómo probar el código', cuerpo: 'Ejemplo:\n\n```java\nreturn "ok";\n```',
      categoria: 'PREGUNTA', resuelta: false, tecnologias: [],
      autor: { id, nombreUsuario: 'ana' }, publicadoEn: '2026-11-18T00:00:00Z',
      hilo: { totalComentarios: 0, participantes: [] }
    });
    if (path === `/api/v1/publicaciones/${id}/comentarios`) return answer(200, []);
    if (path === `/api/v1/publicaciones/${id}/reacciones`) return answer(200, { total: 0, porTipo: {} });
    throw new Error(`Ruta inesperada: ${path}`);
  };

  await import('../src/app.js');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(main.innerHTML, /Las buenas ideas/);
  assert.ok(main.innerHTML.indexOf('En construcción') < main.innerHTML.indexOf('En conversación'));
  assert.ok(calls.includes('GET /api/v1/discusiones?limite=3'));
  assert.ok(calls.includes('GET /api/v1/proyectos?limite=3'));

  location.hash = `#/discusiones/${id}`;
  await handlers.hashchange();
  assert.match(main.innerHTML, /Cómo probar el código/);
  assert.match(main.innerHTML, /tok-key[^>]*>return/);
  assert.ok(calls.includes(`GET /api/v1/publicaciones/${id}/comentarios`));
  assert.ok(calls.includes(`GET /api/v1/publicaciones/${id}/reacciones`));
});

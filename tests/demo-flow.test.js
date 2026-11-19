import test from 'node:test';
import assert from 'node:assert/strict';

const userId = '1b57b743-d6c6-47e3-8a10-9f682f3e15df';
const projectId = '86a57a4c-0c7a-4859-a125-b127ad987c9b';
const discussionId = '56c59896-f164-4980-a210-14fd16fba425';
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return body; } });

class DemoForm {
  constructor(id, values = {}, dataset = {}) {
    this.id = id;
    this.values = values;
    this.dataset = dataset;
    this.button = { disabled: false };
  }
  querySelector(selector) { return selector === '[type="submit"]' ? this.button : null; }
  querySelectorAll(selector) { return selector.includes('tecnologias') ? [{ value: '1' }] : []; }
}

test('la demo conecta login, búsqueda, perfil inicial, publicación y auditoría', async () => {
  const main = { innerHTML: '' };
  const session = { innerHTML: '' };
  const toast = { textContent: '', classList: { toggle() {} }, hidden: true };
  const handlers = {};
  const calls = [];
  globalThis.HTMLFormElement = DemoForm;
  globalThis.FormData = class { constructor(form) { this.values = form.values; } get(key) { return this.values[key] ?? null; } has(key) { return Object.hasOwn(this.values, key); } };
  globalThis.document = {
    querySelector(selector) { return { '#contenido': main, '#session-area': session, '#toast': toast }[selector]; },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { handlers[name] = callback; }
  };
  globalThis.window = { addEventListener(name, callback) { handlers[name] = callback; } };
  globalThis.location = { hash: '' };
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
    if (path.endsWith('/auth/refresco')) return response(401, { message: 'Sin sesión' });
    if (path.endsWith('/auth/inicio-sesion')) return response(200, { token: 'test-token', usuarioId: userId, nombreUsuario: 'ana', permisos: ['publicacion:crear', 'auditoria:consultar'], roles: ['ADMIN'], mfaPendiente: false });
    if (path === '/api/v1/tecnologias') return response(200, [{ id: 1, nombre: 'Java', slug: 'java' }]);
    if (path.startsWith('/api/v1/proyectos?')) return response(200, { contenido: [], cursorSiguiente: null, hayMas: false });
    if (path.startsWith('/api/v1/discusiones?')) return response(200, { contenido: [], cursorSiguiente: null, hayMas: false });
    if (path === `/api/v1/perfiles/${userId}/edicion`) return response(404, { message: 'No disponible' });
    if (path === `/api/v1/perfiles/${userId}` && options.method === 'PUT') return response(200, { id: userId });
    if (path === `/api/v1/perfiles/${userId}`) return response(200, { id: userId, nombre: 'Ana', biografia: '', tecnologias: [], githubUrl: null, linkedinUrl: null });
    if (path.startsWith(`/api/v1/proyectos/autor/${userId}`)) return response(200, { contenido: [], cursorSiguiente: null });
    if (path === `/api/v1/perfiles/${userId}/seguidores` || path === `/api/v1/perfiles/${userId}/seguidos`) return response(200, []);
    if (path === '/api/v1/proyectos' && options.method === 'POST') return response(201, { id: projectId });
    if (path === '/api/v1/discusiones' && options.method === 'POST') return response(201, { id: discussionId });
    if (path === `/api/v1/discusiones/${discussionId}`) return response(200, { id: discussionId, titulo: 'Pregunta de prueba', cuerpo: 'Ejemplo:\n\n```java\nreturn 1;\n```', categoria: 'PREGUNTA', tecnologias: [], autor: { id: userId, nombreUsuario: 'ana' }, hilo: { totalComentarios: 0, participantes: [] } });
    if (path === `/api/v1/publicaciones/${discussionId}/comentarios`) return response(200, []);
    if (path === `/api/v1/publicaciones/${discussionId}/reacciones`) return response(200, { total: 0 });
    if (path.startsWith('/api/v1/auditoria?')) return response(200, { contenido: [], pagina: 0, tamano: 20, total: 0, totalPaginas: 0 });
    throw new Error(`Ruta inesperada: ${path}`);
  };
  await import('../src/app.js');
  await new Promise(resolve => setTimeout(resolve, 0));

  const submit = async form => handlers.submit({ target: form, preventDefault() {} });
  await submit(new DemoForm('login-form', { correo: 'ana@test.dev', clave: 'correcta123' }));
  assert.equal(location.hash, '#/proyectos');
  assert.match(main.innerHTML, /Proyectos/);
  assert.match(session.innerHTML, /Auditoría/);
  assert.equal(calls.find(call => call.path.endsWith('/inicio-sesion')).body.correo, 'ana@test.dev');

  await submit(new DemoForm('filter-form', { q: 'motor', tecnologia: 'java' }, { kind: 'proyectos' }));
  await handlers.hashchange();
  assert.ok(calls.some(call => call.path.includes('/proyectos?') && call.path.includes('q=motor') && call.path.includes('tecnologia=java')));

  location.hash = '#/perfil/editar';
  await handlers.hashchange();
  assert.match(main.innerHTML, /Revísalos antes de guardar/);
  await submit(new DemoForm('profile-form', { nombre: 'Ana', biografia: 'Desarrolladora de software', 'nivel-1': 'INTERMEDIO', 'anios-1': '2' }));
  const savedProfile = calls.find(call => call.path === `/api/v1/perfiles/${userId}` && call.method === 'PUT');
  assert.deepEqual(savedProfile.body.tecnologias, [{ tecnologiaId: 1, nivel: 'INTERMEDIO', anios: 2 }]);

  location.hash = '#/crear/proyecto';
  await handlers.hashchange();
  await submit(new DemoForm('project-form', { titulo: 'Motor de plantillas', descripcion: 'Un proyecto de prueba suficientemente largo.', estadoProyecto: 'EN_DESARROLLO' }));
  const created = calls.find(call => call.path === '/api/v1/proyectos' && call.method === 'POST');
  assert.equal(created.body.titulo, 'Motor de plantillas');
  assert.deepEqual(created.body.tecnologias, [1]);
  assert.equal(created.headers.Authorization, 'Bearer test-token');

  location.hash = '#/crear/discusion';
  await handlers.hashchange();
  await submit(new DemoForm('discussion-form', { titulo: '¿Cómo probar Java?', cuerpo: 'Estoy probando este bloque de código:\n```java\nreturn 1;\n```', categoria: 'PREGUNTA' }));
  await handlers.hashchange();
  assert.equal(calls.find(call => call.path === '/api/v1/discusiones' && call.method === 'POST').body.categoria, 'PREGUNTA');
  assert.match(main.innerHTML, /tok-key[^>]*>return/);

  location.hash = '#/auditoria';
  await handlers.hashchange();
  assert.match(main.innerHTML, /Sin registros/);
  assert.ok(calls.some(call => call.path.startsWith('/api/v1/auditoria?')));
});

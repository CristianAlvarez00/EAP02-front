import test from 'node:test';
import assert from 'node:assert/strict';

class Form {
  constructor(id, values) { this.id = id; this.values = values; this.dataset = {}; this.button = { disabled: false }; }
  querySelector(selector) { return selector === '[type="submit"]' ? this.button : null; }
}

test('HU-19 pide el reporte real solo con permiso, filtra y muestra el estado vacío', async () => {
  const main = { innerHTML: '' };
  const session = { innerHTML: '' };
  const toast = { textContent: '', classList: { toggle() {} }, hidden: true };
  const handlers = {}, calls = [];
  const response = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return body; } });
  globalThis.HTMLFormElement = Form;
  globalThis.FormData = class { constructor(form) { this.values = form.values; } get(key) { return this.values[key] ?? null; } };
  globalThis.document = {
    querySelector(selector) { return { '#contenido': main, '#session-area': session, '#toast': toast }[selector]; },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { handlers[name] = callback; }
  };
  globalThis.window = { addEventListener(name, callback) { handlers[name] = callback; } };
  globalThis.location = { hash: '#/reportes/actividad' };
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET', headers: options.headers });
    if (path === '/api/v1/auth/refresco') return response(401, { message: 'Sin sesión' });
    if (path === '/api/v1/auth/inicio-sesion') {
      const admin = JSON.parse(options.body).correo === 'admin@demo.test';
      return response(200, { token: 'test-token', usuarioId: 'abc', nombreUsuario: admin ? 'admin' : 'dev',
        roles: [admin ? 'ADMIN' : 'DESARROLLADOR'], permisos: admin ? ['metricas:consultar'] : [], mfaPendiente: false });
    }
    if (path === '/api/v1/tecnologias') return response(200, []);
    if (path.startsWith('/api/v1/proyectos?')) return response(200, { contenido: [] });
    if (path.startsWith('/api/v1/reportes/actividad?')) {
      const params = new URL(path, 'http://localhost').searchParams;
      const empty = params.get('desde')?.startsWith('2020');
      return response(200, { desde: params.get('desde'), hasta: params.get('hasta'), agrupacion: params.get('agrupacion'),
        sinActividad: empty, usuariosActivos: empty ? 0 : 7, proyectos: empty ? 0 : 2,
        discusiones: empty ? 0 : 1, comentarios: empty ? 0 : 4, nuevosUsuarios: empty ? 0 : 3,
        crecimiento: empty ? [] : [{ periodo: '2026-11-01', nuevos: 3, acumulado: 3 }] });
    }
    throw new Error(`Ruta inesperada: ${path}`);
  };

  await import('../src/app.js');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(main.innerHTML, /Inicia sesión para continuar/);
  assert.equal(calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length, 0);

  const submit = form => handlers.submit({ target: form, preventDefault() {} });
  await submit(new Form('login-form', { correo: 'admin@demo.test', clave: 'correcta123' }));
  assert.match(session.innerHTML, /Actividad/);
  location.hash = '#/reportes/actividad?desde=2026-11-01&hasta=2026-11-20&agrupacion=MES';
  await handlers.hashchange();
  assert.match(main.innerHTML, /Actividad y crecimiento/);
  assert.match(main.innerHTML, /Registros nuevos por mes/);
  assert.match(main.innerHTML, /Usuarios activos/);
  const report = calls.find(call => call.path.startsWith('/api/v1/reportes/actividad?'));
  assert.equal(new URL(report.path, 'http://localhost').searchParams.get('agrupacion'), 'MES');
  assert.equal(report.headers.Authorization, 'Bearer test-token');

  const before = calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length;
  await submit(new Form('report-form', { desde: '2026-11-01', hasta: '2026-11-20', agrupacion: 'MES' }));
  assert.equal(calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length, before + 1);

  await submit(new Form('report-form', { desde: '2020-01-01', hasta: '2020-01-15', agrupacion: 'SEMANA' }));
  await handlers.hashchange();
  assert.match(main.innerHTML, /Sin actividad en este período/);

  const beforeInvalid = calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length;
  await submit(new Form('report-form', { desde: '2020-01-15', hasta: '2020-01-01', agrupacion: 'SEMANA' }));
  assert.match(toast.textContent, /fecha inicial/);
  assert.equal(calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length, beforeInvalid);

  await submit(new Form('login-form', { correo: 'dev@demo.test', clave: 'correcta123' }));
  assert.doesNotMatch(session.innerHTML, /Actividad/);
  location.hash = '#/reportes/actividad';
  await handlers.hashchange();
  assert.match(main.innerHTML, /requiere permiso/);
  assert.equal(calls.filter(call => call.path.startsWith('/api/v1/reportes/')).length, beforeInvalid);
});

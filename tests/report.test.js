import test from 'node:test';
import assert from 'node:assert/strict';
import { reportDefaults, validateReportRange, renderReportData } from '../src/report.js';

test('el rango inicial usa los días de Colombia y cubre 30 días', () => {
  const beforeMidnight = reportDefaults(new Date('2026-11-23T04:30:00Z'));
  assert.deepEqual(beforeMidnight, { desde: '2026-10-24', hasta: '2026-11-22', agrupacion: 'SEMANA' });
  const afterMidnight = reportDefaults(new Date('2026-11-23T05:30:00Z'));
  assert.equal(afterMidnight.hasta, '2026-11-23');
});

test('valida fechas reales, orden, agrupación y tope inclusivo de 92 días', () => {
  assert.deepEqual(validateReportRange({ desde: '2026-01-01', hasta: '2026-04-02', agrupacion: 'MES' }),
    { desde: '2026-01-01', hasta: '2026-04-02', agrupacion: 'MES' });
  assert.throws(() => validateReportRange({ desde: '2026-01-01', hasta: '2026-04-03', agrupacion: 'MES' }), /92 días/);
  assert.throws(() => validateReportRange({ desde: '2026-02-30', hasta: '2026-03-01', agrupacion: 'MES' }), /dos fechas/);
  assert.throws(() => validateReportRange({ desde: '2026-03-02', hasta: '2026-03-01', agrupacion: 'MES' }), /anterior/);
  assert.throws(() => validateReportRange({ desde: '2026-03-01', hasta: '2026-03-02', agrupacion: 'ANIO' }), /semana o mes/);
});

test('representa totales, crecimiento y acumulado del contrato HU-19', () => {
  const html = renderReportData({
    desde: '2026-11-01', hasta: '2026-11-23', agrupacion: 'SEMANA', sinActividad: false,
    usuariosActivos: 8, proyectos: 3, discusiones: 2, comentarios: 9, nuevosUsuarios: 3,
    crecimiento: [
      { periodo: '2026-11-02', nuevos: 2, acumulado: 2 },
      { periodo: '2026-11-09', nuevos: 1, acumulado: 3 }
    ]
  });
  assert.match(html, /Usuarios activos/);
  assert.match(html, /Registros nuevos por semana/);
  assert.match(html, /width:100%/);
  assert.match(html, /width:50%/);
  assert.match(html, /<th>Acumulado<\/th>/);
  assert.match(html, /<td>3<\/td>/);
});

test('muestra el estado vacío y escapa períodos inesperados', () => {
  const empty = renderReportData({ agrupacion: 'MES', sinActividad: true, crecimiento: [] });
  assert.match(empty, /Sin actividad en este período/);
  assert.doesNotMatch(empty, /report-bars/);
  const unsafe = renderReportData({ agrupacion: 'MES', sinActividad: false, nuevosUsuarios: 1,
    crecimiento: [{ periodo: '<img src=x onerror=alert(1)>', nuevos: 1, acumulado: 1 }] });
  assert.doesNotMatch(unsafe, /<img/);
  assert.match(unsafe, /&lt;img/);
});

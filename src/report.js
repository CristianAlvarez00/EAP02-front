import { escapeHtml } from './markdown.js';

const DAY = 86_400_000;
const number = new Intl.NumberFormat('es-CO');

function isoDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function reportDefaults(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const hasta = `${parts.year}-${parts.month}-${parts.day}`;
  const desde = new Date(Date.parse(hasta) - 29 * DAY).toISOString().slice(0, 10);
  return { desde, hasta, agrupacion: 'SEMANA' };
}

export function validateReportRange({ desde, hasta, agrupacion }) {
  if (!isoDay(desde) || !isoDay(hasta)) throw new Error('Selecciona las dos fechas del reporte.');
  if (desde > hasta) throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  if ((Date.parse(hasta) - Date.parse(desde)) / DAY + 1 > 92) {
    throw new Error('El reporte admite un máximo de 92 días.');
  }
  if (!['SEMANA', 'MES'].includes(agrupacion)) throw new Error('Selecciona semana o mes.');
  return { desde, hasta, agrupacion };
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function periodLabel(value, group) {
  if (!isoDay(value)) return escapeHtml(value);
  const day = new Date(`${value}T12:00:00Z`);
  const label = new Intl.DateTimeFormat('es-CO', group === 'MES'
    ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(day);
  return escapeHtml(group === 'MES' ? label : `Semana del ${label}`);
}

export function renderReportData(data) {
  const group = data.agrupacion === 'MES' ? 'MES' : 'SEMANA';
  const points = Array.isArray(data.crecimiento) ? data.crecimiento : [];
  const metrics = [
    ['Usuarios activos', data.usuariosActivos, 'Personas distintas en el rango'],
    ['Proyectos', data.proyectos, 'Publicados en el rango'],
    ['Discusiones', data.discusiones, 'Publicadas en el rango'],
    ['Comentarios', data.comentarios, 'Creados en el rango'],
    ['Nuevos usuarios', data.nuevosUsuarios, 'Registros en el rango']
  ];
  const summary = `<section class="report-metrics" aria-label="Resumen de actividad">${metrics.map(([label, value, detail]) =>
    `<div class="report-stat"><span>${escapeHtml(label)}</span><strong>${number.format(count(value))}</strong><small>${escapeHtml(detail)}</small></div>`).join('')}</section>`;
  if (data.sinActividad) {
    return `${summary}<div class="empty-state report-empty"><h2>Sin actividad en este período</h2><p class="muted">Prueba otro rango de fechas para ver el movimiento de la comunidad.</p></div>`;
  }
  const max = Math.max(1, ...points.map(point => count(point.nuevos)));
  const growth = points.length && count(data.nuevosUsuarios)
    ? `<div class="report-bars" aria-hidden="true">${points.map(point => `<div class="report-bar-row"><span>${periodLabel(point.periodo, group)}</span><div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.round(count(point.nuevos) / max * 100)}%"></div></div><strong>${number.format(count(point.nuevos))}</strong></div>`).join('')}</div>`
    : '<p class="muted">Hubo actividad, pero no se registraron usuarios nuevos en este período.</p>';
  const rows = points.map(point => `<tr><td><time datetime="${escapeHtml(point.periodo)}">${periodLabel(point.periodo, group)}</time></td><td>${number.format(count(point.nuevos))}</td><td>${number.format(count(point.acumulado))}</td></tr>`).join('');
  return `${summary}<section class="panel report-growth"><div class="report-growth-heading"><div><div class="eyebrow">Crecimiento de la comunidad</div><h2>Registros nuevos por ${group === 'MES' ? 'mes' : 'semana'}</h2></div><span class="report-total">${number.format(count(data.nuevosUsuarios))} en total</span></div>${growth}${points.length ? `<div class="table-wrap"><table><thead><tr><th>Período</th><th>Nuevos</th><th>Acumulado</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}<p class="help">El acumulado cuenta registros nuevos desde el inicio del rango seleccionado.</p></section>`;
}

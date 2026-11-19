import { escapeHtml as esc, safeHttpsUrl as safeUrl, renderMarkdown as rich } from './markdown.js';

const API = '/api/v1';
const main = document.querySelector('#contenido');
const sessionArea = document.querySelector('#session-area');
const toast = document.querySelector('#toast');
const state = { token: null, user: null, refresh: null, technologies: null, profiles: new Map(), view: 0 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function short(id) { return String(id ?? '').slice(0, 8); }
function date(value) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''; }
function notify(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 5500);
}
function errorText(error) { return error?.message || 'No fue posible completar la solicitud. Intenta de nuevo.'; }
function failure(error) { return `<div class="notice error-state" role="alert">${esc(errorText(error))}${error?.traceId ? `<br><small>Referencia: ${esc(error.traceId)}</small>` : ''}</div>`; }
function empty(title, detail) { return `<div class="empty-state"><h2>${esc(title)}</h2><p class="muted">${esc(detail)}</p></div>`; }
function button(label, href, kind = 'btn-ghost') { return `<a class="btn ${kind}" href="${esc(href)}">${esc(label)}</a>`; }

async function authRequest(path, body) {
  const response = await fetch(`${API}${path}`, { method: 'POST', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.message || `Error HTTP ${response.status}`), { status: response.status, traceId: data?.traceId });
  return data;
}
function setSession(data) {
  state.token = data?.token || null;
  state.user = data?.usuarioId ? { id: data.usuarioId, name: data.nombreUsuario, roles: data.roles || [], permissions: data.permisos || [], mfaPending: !!data.mfaPendiente } : null;
  renderSession();
}
function renderSession() {
  sessionArea.innerHTML = state.user
    ? `<span class="session-name">@${esc(state.user.name)}</span>${can('auditoria:consultar') ? button('Auditoría', '#/auditoria', 'btn-ghost') : ''}${button('Mi perfil', '#/perfil', 'btn-ghost')}<button class="btn btn-small" data-action="logout">Salir</button>`
    : `${button('Entrar', '#/entrar', 'btn-ghost')}${button('Crear cuenta', '#/registro', 'btn-primary')}`;
}
async function refreshSession() {
  if (!state.refresh) {
    state.refresh = authRequest('/auth/refresco').then(data => { setSession(data); return true; })
      .catch(() => { setSession(null); return false; }).finally(() => { state.refresh = null; });
  }
  return state.refresh;
}
async function api(path, options = {}, retry = true) {
  const headers = { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) };
  const response = await fetch(`${API}${path}`, { method: options.method || 'GET', credentials: 'same-origin', headers, body: options.body !== undefined ? JSON.stringify(options.body) : undefined });
  if (response.status === 401 && retry && state.user) {
    const renewed = await refreshSession();
    // Una lectura pública puede continuar como visitante si expiró la sesión.
    if (renewed || (options.method || 'GET') === 'GET') return api(path, options, false);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) setSession(null);
    throw Object.assign(new Error(data?.message || `Error HTTP ${response.status}`), { status: response.status, traceId: data?.traceId });
  }
  return data;
}
async function technologies() { return state.technologies ||= await api('/tecnologias'); }
async function profile(id) {
  if (!UUID.test(id)) throw new Error('Identificador de perfil no válido.');
  if (!state.profiles.has(id)) state.profiles.set(id, await api(`/perfiles/${id}`));
  return state.profiles.get(id);
}
function requireUser() {
  if (state.user) return true;
  main.innerHTML = `<div class="auth-wrap panel">${empty('Inicia sesión para continuar', 'Tu sesión permite publicar, seguir desarrolladores y enviar mensajes.')}<div class="button-row">${button('Iniciar sesión', '#/entrar', 'btn-primary')}${button('Crear cuenta', '#/registro')}</div></div>`;
  return false;
}
function can(permission) { return !!state.user?.permissions.includes(permission); }

function tags(items) { return `<div class="chip-list">${(items || []).map(item => `<span class="chip">${esc(typeof item === 'string' ? item : item.nombre)}</span>`).join('')}</div>`; }
function avatar(name, url, small = false) {
  const image = safeUrl(url);
  return `<span class="avatar${small ? ' small' : ''}">${image ? `<img src="${esc(image)}" alt="">` : esc(String(name || '?').slice(0, 2).toUpperCase())}</span>`;
}
function authorLink(author) { return author?.id ? `<a href="#/perfiles/${esc(author.id)}">@${esc(author.nombreUsuario || short(author.id))}</a>` : 'Desarrollador'; }
function discussionCard(item) {
  return `<article class="card"><div class="meta-row"><span class="pill">${esc(item.categoria || 'DEBATE')}</span><span>${date(item.publicadoEn)}</span>${item.resuelta ? '<span class="pill good">Resuelta</span>' : ''}</div><h2><a class="card-link" href="#/discusiones/${esc(item.id)}">${esc(item.titulo)}</a></h2><p>${esc(item.extracto)}</p><div class="meta-row"><span>Por ${authorLink(item.autor)}</span></div>${tags(item.tecnologias)}</article>`;
}
function projectCard(item) {
  const repo = safeUrl(item.urlRepositorio);
  return `<article class="card"><div class="meta-row"><span class="pill">Proyecto</span><span>${date(item.publicadoEn)}</span>${item.buscaColaboradores ? '<span class="pill good">Busca colaboradores</span>' : ''}</div><h2>${esc(item.titulo)}</h2><p>${esc(item.resumen || '')}</p><div class="meta-row"><span>Por <a href="#/perfiles/${esc(item.autorId)}">@${esc(item.autorNombreUsuario || short(item.autorId))}</a></span><span>${esc(item.estadoProyecto || '')}</span></div>${tags(item.tecnologias)}<div class="button-row"><button class="btn btn-small" data-action="project-comments" data-id="${esc(item.id)}">Comentarios y reacciones</button>${repo ? `<a class="btn btn-small btn-ghost" href="${esc(repo)}" target="_blank" rel="noopener noreferrer">Ver repositorio</a>` : ''}</div><div id="project-extra-${esc(item.id)}" hidden></div></article>`;
}
function heading(kicker, title, subtitle, action = '') { return `<div class="page-heading"><div><div class="eyebrow">${esc(kicker)}</div><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${action}</div>`; }
function techSelect(selected = '') { return `<select name="tecnologia" aria-label="Filtrar por tecnología"><option value="">Todas las tecnologías</option>${(state.technologies || []).map(t => `<option value="${esc(t.slug)}" ${t.slug === selected ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>`; }
function techChecks(selectedNames = []) {
  const selected = new Set(selectedNames.map(name => String(name).toLowerCase()));
  return `<div class="check-grid">${(state.technologies || []).map(t => `<label class="check-option"><input type="checkbox" name="tecnologias" value="${t.id}" ${selected.has(t.nombre.toLowerCase()) ? 'checked' : ''}>${esc(t.nombre)}</label>`).join('')}</div>`;
}
function techEditor(current) {
  const existing = new Map((current || []).map(item => [Number(item.id), item]));
  return `<div class="tech-editor">${(state.technologies || []).map(t => {
    const item = existing.get(Number(t.id));
    return `<div class="tech-edit-row"><label class="check-option"><input type="checkbox" name="tecnologias" value="${t.id}" ${item ? 'checked' : ''}>${esc(t.nombre)}</label><select name="nivel-${t.id}" aria-label="Nivel de ${esc(t.nombre)}"><option value="BASICO" ${item?.nivel === 'BASICO' ? 'selected' : ''}>Básico</option><option value="INTERMEDIO" ${!item || item.nivel === 'INTERMEDIO' ? 'selected' : ''}>Intermedio</option><option value="AVANZADO" ${item?.nivel === 'AVANZADO' ? 'selected' : ''}>Avanzado</option><option value="EXPERTO" ${item?.nivel === 'EXPERTO' ? 'selected' : ''}>Experto</option></select><input type="number" min="0" max="70" name="anios-${t.id}" value="${item?.anios ?? ''}" aria-label="Años con ${esc(t.nombre)}" placeholder="Años"></div>`;
  }).join('')}</div>`;
}
function codeHint() { return `<p class="help">Plus para desarrolladores: pega código entre tres acentos graves, con el lenguaje en la primera línea. Se mostrará con colores y botón para copiar.</p>`; }
function codeTools() { return `<div class="compose-tools"><select class="input" data-code-language aria-label="Lenguaje del bloque de código"><option value="javascript">JavaScript</option><option value="java">Java</option><option value="python">Python</option><option value="sql">SQL</option><option value="html">HTML</option><option value="css">CSS</option><option value="bash">Bash</option></select><button class="btn btn-small btn-ghost" type="button" data-action="insert-code">Insertar bloque de código</button></div>`; }
function commentForm(id) { return can('comentario:crear') ? `<form data-form="comment" data-id="${esc(id)}"><div class="field"><label for="comment-body-${esc(id)}">Añade una respuesta</label><textarea id="comment-body-${esc(id)}" name="contenido" maxlength="5000" required placeholder="Comparte una solución o una idea…"></textarea></div>${codeTools()}${codeHint()}<div class="preview rich-text" data-preview-for="comment-body-${esc(id)}"></div><div class="button-row"><button class="btn btn-primary" type="submit">Publicar comentario</button></div></form>` : `<div class="notice">${state.user ? 'Tu cuenta no tiene permiso para comentar.' : button('Inicia sesión para comentar', '#/entrar', 'btn-primary')}</div>`; }
function comments(items) { return items.length ? items.map(item => `<div class="comment"><div class="meta-row"><a href="#/perfiles/${esc(item.autorId)}">@${esc(item.autorNombreUsuario || short(item.autorId))}</a><span>${date(item.creadoEn)}</span>${state.user && (state.user.id === item.autorId || state.user.permissions.includes('comentario:eliminar-ajeno')) ? `<button class="btn btn-small btn-danger" data-action="delete-comment" data-id="${esc(item.id)}">Eliminar</button>` : ''}</div><div class="rich-text">${rich(item.contenido)}</div></div>`).join('') : empty('Todavía no hay comentarios', 'Sé la primera persona en aportar una respuesta.'); }
function reactionControls(id, reaction) { return `<div class="interaction-row"><span class="pill">${Number(reaction?.total || 0)} reacciones</span>${can('reaccion:crear') ? `<button class="btn btn-small" data-action="react" data-id="${esc(id)}" data-type="UTIL">Útil</button><button class="btn btn-small" data-action="react" data-id="${esc(id)}" data-type="ME_GUSTA">Me gusta</button><button class="btn btn-small btn-ghost" data-action="unreact" data-id="${esc(id)}">Quitar reacción</button>` : state.user ? '' : button('Entra para reaccionar', '#/entrar', 'btn-small btn-ghost')}</div>`; }

async function home() {
  const [discussions, projects] = await Promise.all([api('/discusiones?limite=3'), api('/proyectos?limite=3')]);
  return `<section class="hero"><div class="eyebrow">UNA COMUNIDAD HECHA ENTRE DESARROLLADORES</div><h1>Las buenas ideas<br><em>se construyen juntos.</em></h1><p>Un lugar para mostrar lo que haces, encontrar a quienes pueden ayudarte y compartir soluciones que sirvan de verdad.</p><div class="hero-actions">${button('Ver proyectos', '#/proyectos', 'btn-primary')}${button('Hacer una pregunta', '#/crear/discusion')}</div><div class="hero-foot">PROYECTOS REALES &nbsp; / &nbsp; CONVERSACIONES ÚTILES &nbsp; / &nbsp; PERSONAS CERCANAS</div></section><div class="layout"><div><div class="section-head"><h2>En construcción</h2><a href="#/proyectos">Todos los proyectos ↗</a></div><div class="stack">${projects.contenido?.length ? projects.contenido.map(projectCard).join('') : empty('Aún no hay proyectos', 'Comparte lo que estás construyendo.')}</div><div class="section-head"><h2>En conversación</h2><a href="#/discusiones">Todas las discusiones ↗</a></div><div class="stack">${discussions.contenido?.length ? discussions.contenido.map(discussionCard).join('') : empty('Aún no hay discusiones', 'Abre la primera conversación técnica.')}</div></div><aside><div class="section-head"><h2>La nota del taller</h2></div><div class="panel note-panel"><span class="eyebrow">01 / CÓDIGO QUE SE ENTIENDE</span><h3 class="side-title">Una respuesta puede incluir código.</h3><p class="aside-text">Escribe un bloque con tres acentos graves y el nombre del lenguaje. Los ejemplos se leen con colores y se pueden copiar.</p><div class="code-block"><div class="code-header">java</div><pre><code><span class="tok-key">return</span> <span class="tok-str">"funciona"</span>;</code></pre></div>${button('Iniciar discusión', '#/crear/discusion', 'btn-primary')}</div></aside></div>`;
}
async function listing(kind, query) {
  await technologies();
  const params = new URLSearchParams(query);
  const filter = params.get('tecnologia') || '';
  const term = params.get('q') || '';
  const apiParams = new URLSearchParams({ limite: '12' });
  if (filter) apiParams.set('tecnologia', filter);
  if (term && kind === 'proyectos') apiParams.set('q', term);
  if (params.get('cursor')) apiParams.set('cursor', params.get('cursor'));
  const data = await api(`/${kind}?${apiParams}`);
  const discussions = kind === 'discusiones';
  const title = discussions ? 'Discusiones' : 'Proyectos';
  const description = discussions ? 'Preguntas, ideas y soluciones entre desarrolladores.' : 'Explora lo que la comunidad está construyendo.';
  const action = button(discussions ? 'Nueva discusión' : 'Publicar proyecto', discussions ? '#/crear/discusion' : '#/crear/proyecto', 'btn-primary');
  return `${heading('Explorar la comunidad', title, description, action)}${!discussions && state.user ? `<div class="notice onboarding">¿Vas a publicar tu primer proyecto? ${button('Completa tu perfil técnico', '#/perfil/editar', 'btn-small btn-ghost')} para que otros sepan con qué trabajas.</div>` : ''}<form class="filters" id="filter-form" data-kind="${kind}">${discussions ? '' : `<div class="field"><label for="search-q">Buscar</label><input id="search-q" name="q" value="${esc(term)}" maxlength="100" placeholder="Título, descripción o tecnología"></div>`}<div class="field"><label for="filter-tech">Tecnología</label>${techSelect(filter)}</div><button class="btn" type="submit">Aplicar filtros</button></form><div class="stack">${data.contenido?.length ? data.contenido.map(discussions ? discussionCard : projectCard).join('') : empty('Sin resultados', data.mensaje || 'Prueba otra tecnología o búsqueda.')}</div>${data.cursorSiguiente ? `<div class="button-row"><a class="btn" href="#/${kind}?${esc(new URLSearchParams({ ...(filter ? { tecnologia: filter } : {}), ...(term ? { q: term } : {}), cursor: data.cursorSiguiente }).toString())}">Página siguiente</a></div>` : ''}${params.get('cursor') ? `<div class="button-row"><button class="btn btn-ghost" data-action="back">Página anterior</button></div>` : ''}`;
}
async function discussion(id) {
  if (!UUID.test(id)) throw new Error('Discusión no válida.');
  const [item, commentList, reaction] = await Promise.all([api(`/discusiones/${id}`), api(`/publicaciones/${id}/comentarios`), api(`/publicaciones/${id}/reacciones`)]);
  return `<div class="layout"><article class="article"><div class="eyebrow">Discusión · ${esc(item.categoria)}</div><h1 class="article-title">${esc(item.titulo)}</h1><div class="meta-row"><span>Por ${authorLink(item.autor)}</span><span>${date(item.publicadoEn)}</span>${item.resuelta ? '<span class="pill good">Resuelta</span>' : ''}</div>${tags(item.tecnologias)}<div class="panel rich-text" style="margin-top:1.4rem">${rich(item.cuerpo)}</div>${reactionControls(id, reaction)}<div class="section-head"><h2>Comentarios (${commentList.length})</h2></div><div class="panel">${comments(commentList)}</div><div class="section-head"><h2>Tu aporte</h2></div><div class="panel">${commentForm(id)}</div></article><aside><div class="panel"><h3 class="side-title">Comparte una solución clara</h3><p class="aside-text">Incluye un ejemplo de código entre tres acentos graves. El lenguaje va junto a los primeros acentos, por ejemplo <code>&#96;&#96;&#96;java</code>.</p><hr class="divider"><p class="aside-text">${item.hilo?.totalComentarios || 0} comentarios · ${item.hilo?.participantes?.length || 0} participantes</p></div></aside></div>`;
}
async function projectExtras(id, target) {
  target.hidden = false;
  target.innerHTML = '<div class="loading-state">Cargando comentarios…</div>';
  try {
    const [commentList, reaction] = await Promise.all([api(`/publicaciones/${id}/comentarios`), api(`/publicaciones/${id}/reacciones`)]);
    target.innerHTML = `<hr class="divider">${reactionControls(id, reaction)}<h3>Comentarios (${commentList.length})</h3>${comments(commentList)}<hr class="divider">${commentForm(id)}`;
  } catch (error) { target.innerHTML = failure(error); }
}
async function profilePage(id) {
  if (!UUID.test(id)) throw new Error('Perfil no válido.');
  const [person, projects, followers, following] = await Promise.all([profile(id), api(`/proyectos/autor/${id}?limite=20`), api(`/perfiles/${id}/seguidores`), api(`/perfiles/${id}/seguidos`)]);
  const own = state.user?.id === id;
  let follows = false;
  if (state.user && !own) {
    const mine = await api(`/perfiles/${state.user.id}/seguidos`);
    follows = mine.some(member => member.usuarioId === id);
  }
  const links = [['GitHub', person.githubUrl], ['LinkedIn', person.linkedinUrl]].filter(([,url]) => safeUrl(url));
  return `<div class="layout"><div><div class="panel"><div class="profile-head">${avatar(person.nombre, person.avatarUrl)}<div><div class="eyebrow">Perfil de desarrollador</div><h1>${esc(person.nombre)}</h1><span class="muted">${short(id)}…</span></div></div><p>${esc(person.biografia || 'Aún no ha añadido una biografía.')}</p>${tags(person.tecnologias)}<div class="profile-links">${links.map(([label,url]) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('')}</div><div class="button-row">${own ? button('Editar mi perfil', '#/perfil/editar', 'btn-primary') : state.user ? `<button class="btn btn-primary" data-action="follow" data-id="${esc(id)}" data-following="${follows}">${follows ? 'Dejar de seguir' : 'Seguir'}</button>${button('Enviar mensaje', `#/mensajes/nuevo/${id}`)}` : button('Entrar para conectar', '#/entrar', 'btn-primary')}</div></div><div class="section-head"><h2>Proyectos publicados</h2></div><div class="stack">${projects.contenido?.length ? projects.contenido.map(projectCard).join('') : empty('Sin proyectos publicados', 'Cuando comparta uno, aparecerá aquí.')}</div></div><aside><div class="panel"><h3 class="side-title">Comunidad</h3><p class="aside-text">${followers.length} seguidores · ${following.length} seguidos</p><hr class="divider"><h3 class="side-title">Seguidos</h3>${following.length ? following.slice(0, 8).map(member => `<p><a href="#/perfiles/${esc(member.usuarioId)}">@${esc(member.nombreUsuario)}</a></p>`).join('') : '<p class="aside-text">Todavía no sigue a nadie.</p>'}</div></aside></div>`;
}
async function editProfile() {
  if (!requireUser()) return null;
  await technologies();
  let person, complete = true;
  try { person = await api(`/perfiles/${state.user.id}/edicion`); }
  catch (error) {
    if (error.status !== 404) throw error;
    person = await profile(state.user.id);
    complete = false;
  }
  const declared = complete ? person.tecnologias : (person.tecnologias || []).map(name => ({ id: state.technologies.find(t => t.nombre === name)?.id, nombre: name }));
  return `${heading('Mi espacio', 'Editar perfil', 'Cuenta quién eres y qué tecnologías utilizas.')}${!complete ? '<div class="notice">Esta versión de la API no entrega los niveles ni los años de experiencia guardados. Revísalos antes de guardar: el perfil se reemplaza completo.</div>' : ''}${state.user.mfaPending ? '<div class="notice">Tu cuenta tiene verificación adicional pendiente; algunas acciones pueden estar restringidas.</div>' : ''}<div class="panel article"><form id="profile-form"><div class="field"><label for="profile-name">Nombre</label><input id="profile-name" name="nombre" value="${esc(person.nombre)}" maxlength="100" required></div><div class="field"><label for="profile-bio">Biografía</label><textarea id="profile-bio" name="biografia" maxlength="1000" required>${esc(person.biografia)}</textarea></div><div class="field"><label>Tecnologías (al menos una)</label>${techEditor(declared)}</div><div class="form-grid"><div class="field"><label for="profile-github">GitHub</label><input id="profile-github" name="githubUrl" type="url" value="${esc(person.githubUrl || '')}" placeholder="https://github.com/usuario"></div><div class="field"><label for="profile-linkedin">LinkedIn</label><input id="profile-linkedin" name="linkedinUrl" type="url" value="${esc(person.linkedinUrl || '')}" placeholder="https://linkedin.com/in/usuario"></div></div><button class="btn btn-primary" type="submit">Guardar perfil</button></form><hr class="divider"><form id="avatar-form"><div class="field"><label for="avatar-url">URL de tu foto de perfil</label><input id="avatar-url" name="avatarUrl" type="url" value="${esc(person.avatarUrl || '')}" placeholder="https://ejemplo.com/foto.jpg" required></div><button class="btn" type="submit">Actualizar foto</button></form></div>`;
}
async function createDiscussion() {
  if (!requireUser()) return null;
  await technologies();
  return `${heading('Comparte conocimiento', 'Nueva discusión', 'Una buena pregunta acerca a la comunidad a una solución.')}${state.user.mfaPending ? '<div class="notice">Completa la verificación de tu cuenta antes de publicar.</div>' : ''}<div class="panel article"><form id="discussion-form"><div class="field"><label for="discussion-title">Título</label><input id="discussion-title" name="titulo" minlength="5" maxlength="200" required placeholder="¿Cómo resolverías este problema?"></div><div class="field"><label for="discussion-category">Categoría</label><select id="discussion-category" name="categoria"><option value="DEBATE">Debate</option><option value="PREGUNTA">Pregunta</option><option value="ANUNCIO">Anuncio</option><option value="RECURSO">Recurso</option></select></div><div class="field"><label for="discussion-body">Contenido</label><textarea id="discussion-body" name="cuerpo" minlength="20" required placeholder="Describe el contexto, lo que intentaste y el resultado…"></textarea></div>${codeTools()}${codeHint()}<div class="field"><label>Tecnologías (entre 1 y 5)</label>${techChecks()}</div><div class="section-head"><h2>Vista previa</h2></div><div class="preview rich-text" data-preview-for="discussion-body"></div><div class="button-row"><button class="btn btn-primary" type="submit">Publicar discusión</button></div></form></div>`;
}
async function createProject() {
  if (!requireUser()) return null;
  await technologies();
  return `${heading('Muestra lo que construyes', 'Publicar proyecto', 'Comparte tu trabajo y encuentra posibles colaboradores.')}${state.user.mfaPending ? '<div class="notice">Completa la verificación de tu cuenta antes de publicar.</div>' : ''}<div class="panel article"><form id="project-form"><div class="field"><label for="project-title">Título</label><input id="project-title" name="titulo" minlength="5" maxlength="200" required></div><div class="field"><label for="project-description">Descripción</label><textarea id="project-description" name="descripcion" minlength="20" required></textarea></div><div class="field"><label for="project-summary">Resumen breve (opcional)</label><input id="project-summary" name="resumen" maxlength="300"></div><div class="field"><label>Tecnologías (entre 1 y 5)</label>${techChecks()}</div><div class="form-grid"><div class="field"><label for="project-repo">Repositorio HTTPS (opcional)</label><input id="project-repo" name="urlRepositorio" type="url" placeholder="https://github.com/usuario/proyecto"></div><div class="field"><label for="project-stage">Estado</label><select id="project-stage" name="estadoProyecto"><option value="IDEA">Idea</option><option value="EN_DESARROLLO" selected>En desarrollo</option><option value="ESTABLE">Estable</option><option value="PAUSADO">Pausado</option></select></div></div><label class="check-option"><input type="checkbox" name="buscaColaboradores">Busco colaboradores</label><div class="button-row"><button class="btn btn-primary" type="submit">Publicar proyecto</button></div></form></div>`;
}
async function auditPage(query) {
  if (!requireUser()) return null;
  if (!can('auditoria:consultar')) throw Object.assign(new Error('Esta sección requiere permiso de auditoría.'), { status: 403 });
  const params = new URLSearchParams(query);
  const allowed = new URLSearchParams();
  for (const key of ['operacion', 'actorId', 'tabla', 'desde', 'hasta', 'pagina']) if (params.get(key)) allowed.set(key, params.get(key));
  allowed.set('tamano', '20');
  const data = await api(`/auditoria?${allowed}`);
  const rows = data.contenido?.map(row => `<tr><td>${date(row.fecha)}</td><td>${esc(row.accion)}</td><td>${esc(row.actor?.nombreUsuario || 'Sistema')}</td><td>${esc(row.objeto?.tabla || '')}<small>${esc(row.objeto?.registroId || '')}</small></td><td>${esc(row.traceId || '')}</td></tr>`).join('') || '';
  return `${heading('Administración', 'Auditoría', 'Acciones sensibles registradas por el servidor.')}<form id="audit-form" class="filters"><div class="field"><label>Operación</label><input name="operacion" value="${esc(params.get('operacion') || '')}" placeholder="Ej. MENSAJE_ENVIADO"></div><div class="field"><label>Actor ID</label><input name="actorId" value="${esc(params.get('actorId') || '')}" placeholder="UUID del usuario"></div><div class="field"><label>Tabla</label><input name="tabla" value="${esc(params.get('tabla') || '')}" placeholder="Ej. usuario"></div><div class="field"><label>Desde</label><input name="desde" type="date" value="${esc(params.get('desde') || '')}"></div><div class="field"><label>Hasta</label><input name="hasta" type="date" value="${esc(params.get('hasta') || '')}"></div><button class="btn" type="submit">Filtrar</button></form>${rows ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Actor</th><th>Objeto</th><th>Trace ID</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('Sin registros', 'No hay eventos que coincidan con estos filtros.')}<div class="button-row">${data.pagina > 0 ? button('Anterior', `#/auditoria?${esc(new URLSearchParams({ ...Object.fromEntries(params), pagina: data.pagina - 1 }))}`) : ''}${data.pagina + 1 < data.totalPaginas ? button('Siguiente', `#/auditoria?${esc(new URLSearchParams({ ...Object.fromEntries(params), pagina: data.pagina + 1 }))}`) : ''}</div>`;
}
function authPage(register) {
  return `<div class="auth-wrap"><div class="panel"><div class="eyebrow">${register ? 'Únete a DevNet' : 'Bienvenido de nuevo'}</div><h1 class="page-title">${register ? 'Crea tu cuenta' : 'Inicia sesión'}</h1><p class="page-subtitle">${register ? 'Comparte tus proyectos y aprende con otros desarrolladores.' : 'Retoma tus conversaciones y proyectos.'}</p><hr class="divider"><form id="${register ? 'register-form' : 'login-form'}">${register ? `<div class="field"><label for="auth-name">Nombre de usuario</label><input id="auth-name" name="nombreUsuario" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}" minlength="3" maxlength="30" required autocomplete="username"><small>Entre 3 y 30 caracteres; empieza con letra o número.</small></div>` : ''}<div class="field"><label for="auth-email">Correo</label><input id="auth-email" name="correo" type="email" required autocomplete="email"></div><div class="field"><label for="auth-password">Contraseña</label><input id="auth-password" name="clave" type="password" minlength="8" required autocomplete="${register ? 'new-password' : 'current-password'}"></div><button class="btn btn-primary" type="submit">${register ? 'Crear cuenta' : 'Entrar'}</button></form><hr class="divider"><p class="muted">${register ? '¿Ya tienes cuenta?' : '¿Nuevo en DevNet?'} <a class="brand-accent" href="#/${register ? 'entrar' : 'registro'}">${register ? 'Inicia sesión' : 'Regístrate'}</a></p></div></div>`;
}
async function messages(conversationId, newRecipient) {
  if (!requireUser()) return null;
  const inbox = await api('/conversaciones');
  const visible = inbox.slice(0, 16);
  await Promise.allSettled(visible.map(item => profile(item.otroParticipanteId)));
  const active = inbox.find(item => item.conversacionId === conversationId);
  if (conversationId && !active) throw new Error('La conversación no aparece en tu bandeja.');
  const history = active ? await api(`/conversaciones/${conversationId}/mensajes`) : [];
  const other = active ? state.profiles.get(active.otroParticipanteId) : null;
  const selected = newRecipient && UUID.test(newRecipient) ? newRecipient : active?.otroParticipanteId || '';
  const title = active ? `Conversación con ${other?.nombre || short(active.otroParticipanteId)}` : newRecipient ? 'Nuevo mensaje' : 'Tu bandeja';
  return `${heading('Mensajes privados', title, 'Solo los participantes pueden leer cada conversación.', button('Nuevo mensaje', '#/mensajes/nuevo', 'btn-primary'))}<div class="message-layout"><section class="panel"><h2 class="side-title">Conversaciones (${inbox.length})</h2><div class="conversation-list">${inbox.length ? inbox.map(item => { const person = state.profiles.get(item.otroParticipanteId); return `<a class="conversation-item ${item.conversacionId === conversationId ? 'active' : ''}" href="#/mensajes/${esc(item.conversacionId)}"><strong>${esc(person?.nombre || `Usuario ${short(item.otroParticipanteId)}`)}</strong><br><span class="muted">${date(item.ultimoMensajeEn)}</span></a>`; }).join('') : empty('Sin conversaciones', 'Cuando envíes o recibas un mensaje, aparecerá aquí.')}</div></section><section class="panel"><h2 class="side-title">${esc(title)}</h2>${active ? `<div class="bubble-list">${history.map(item => `<div class="bubble ${item.remitenteId === state.user.id ? 'mine' : ''}"><p>${esc(item.contenido)}</p><small>${item.remitenteId === state.user.id ? 'Tú' : esc(other?.nombre || 'Otra persona')} · ${date(item.enviadoEn)}</small></div>`).join('')}</div>` : `<p class="aside-text">${newRecipient ? 'Escribe un mensaje para iniciar la conversación.' : 'Elige una conversación o escribe a otro desarrollador.'}</p>`}<form id="message-form"><div class="field"><label for="recipient-id">Destinatario</label><input id="recipient-id" name="destinatarioId" value="${esc(selected)}" ${active ? 'readonly' : ''} required placeholder="ID del perfil" pattern="[0-9a-fA-F-]{36}"><small>También puedes abrir el perfil de alguien y usar «Enviar mensaje».</small></div><div class="field"><label for="message-body">Mensaje</label><textarea id="message-body" name="contenido" rows="3" required placeholder="Escribe un mensaje privado…"></textarea></div><button class="btn btn-primary" type="submit">Enviar mensaje</button></form></section></div>`;
}

async function route() {
  const current = ++state.view;
  const raw = location.hash.slice(1) || '/explorar';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const section = parts[0] || 'explorar';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === section));
  main.innerHTML = '<div class="loading-state">Cargando…</div>';
  try {
    let html;
    if (section === 'explorar') html = await home();
    else if (section === 'discusiones' && parts[1]) html = await discussion(parts[1]);
    else if (section === 'discusiones') html = await listing('discusiones', query);
    else if (section === 'proyectos') html = await listing('proyectos', query);
    else if (section === 'perfiles' && parts[1]) html = await profilePage(parts[1]);
    else if (section === 'perfil' && parts[1] === 'editar') html = await editProfile();
    else if (section === 'perfil' && state.user) html = await profilePage(state.user.id);
    else if (section === 'perfil') html = await authPage(false);
    else if (section === 'mensajes') html = await messages(parts[1] === 'nuevo' ? null : parts[1], parts[1] === 'nuevo' ? parts[2] : null);
    else if (section === 'crear' && parts[1] === 'discusion') html = await createDiscussion();
    else if (section === 'crear' && parts[1] === 'proyecto') html = await createProject();
    else if (section === 'entrar') html = authPage(false);
    else if (section === 'registro') html = authPage(true);
    else if (section === 'auditoria') html = await auditPage(query);
    else html = empty('Página no encontrada', 'Vuelve a explorar la comunidad.');
    if (current === state.view && html !== null) main.innerHTML = html;
  } catch (error) {
    if (current !== state.view) return;
    if (error.status === 401) requireUser();
    else main.innerHTML = `${failure(error)}<div class="button-row">${button('Volver a explorar', '#/explorar')}</div>`;
  }
}
function selectedTechnologies(form, maximum = 5) {
  const ids = [...form.querySelectorAll('input[name="tecnologias"]:checked')].map(input => Number(input.value));
  if (!ids.length || ids.length > maximum) throw new Error(`Selecciona entre 1 y ${maximum} tecnologías.`);
  return ids;
}
async function submit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  const data = new FormData(form);
  try {
    if (form.id === 'login-form') {
      setSession(await authRequest('/auth/inicio-sesion', { correo: data.get('correo'), clave: data.get('clave') }));
      notify(`Bienvenido, @${state.user.name}`); location.hash = '#/proyectos'; await route();
    } else if (form.id === 'register-form') {
      await authRequest('/auth/registro', { nombreUsuario: data.get('nombreUsuario'), correo: data.get('correo'), clave: data.get('clave') });
      notify('Cuenta creada. Inicia sesión para continuar.'); location.hash = '#/entrar';
    } else if (form.id === 'filter-form') {
      const params = new URLSearchParams();
      if (data.get('q')) params.set('q', String(data.get('q')).trim());
      if (data.get('tecnologia')) params.set('tecnologia', data.get('tecnologia'));
      location.hash = `#/${form.dataset.kind}${params.size ? `?${params}` : ''}`;
    } else if (form.id === 'discussion-form') {
      const item = await api('/discusiones', { method: 'POST', body: { titulo: data.get('titulo'), cuerpo: data.get('cuerpo'), categoria: data.get('categoria'), tecnologias: selectedTechnologies(form) } });
      notify('Discusión publicada.'); location.hash = `#/discusiones/${item.id}`;
    } else if (form.id === 'project-form') {
      await api('/proyectos', { method: 'POST', body: { titulo: data.get('titulo'), descripcion: data.get('descripcion'), resumen: data.get('resumen') || null, tecnologias: selectedTechnologies(form), urlRepositorio: data.get('urlRepositorio') || null, estadoProyecto: data.get('estadoProyecto'), buscaColaboradores: data.has('buscaColaboradores') } });
      notify('Proyecto publicado.'); location.hash = `#/perfiles/${state.user.id}`; await route();
    } else if (form.id === 'profile-form') {
      const selected = selectedTechnologies(form, 15).map(tecnologiaId => ({ tecnologiaId, nivel: data.get(`nivel-${tecnologiaId}`), anios: data.get(`anios-${tecnologiaId}`) === '' ? null : Number(data.get(`anios-${tecnologiaId}`)) }));
      await api(`/perfiles/${state.user.id}`, { method: 'PUT', body: { nombre: data.get('nombre'), biografia: data.get('biografia'), tecnologias: selected, githubUrl: data.get('githubUrl') || null, linkedinUrl: data.get('linkedinUrl') || null } });
      state.profiles.delete(state.user.id); notify('Perfil actualizado.'); location.hash = '#/perfil'; await route();
    } else if (form.id === 'avatar-form') {
      await api(`/perfiles/${state.user.id}/avatar`, { method: 'PATCH', body: { avatarUrl: data.get('avatarUrl') } });
      state.profiles.delete(state.user.id); notify('Foto actualizada.'); location.hash = '#/perfil'; await route();
    } else if (form.id === 'audit-form') {
      const params = new URLSearchParams();
      for (const key of ['operacion', 'actorId', 'tabla', 'desde', 'hasta']) if (data.get(key)) params.set(key, String(data.get(key)));
      location.hash = `#/auditoria${params.size ? `?${params}` : ''}`;
    } else if (form.dataset.form === 'comment') {
      await api(`/publicaciones/${form.dataset.id}/comentarios`, { method: 'POST', body: { contenido: data.get('contenido') } });
      notify('Comentario publicado.'); await route();
    } else if (form.id === 'message-form') {
      const recipient = String(data.get('destinatarioId') || '').trim();
      if (!UUID.test(recipient)) throw new Error('Introduce un ID de destinatario válido.');
      const item = await api('/mensajes', { method: 'POST', body: { destinatarioId: recipient, contenido: data.get('contenido') } });
      notify('Mensaje enviado.'); location.hash = `#/mensajes/${item.conversacionId}`; await route();
    }
  } catch (error) { notify(`${errorText(error)}${error.traceId ? ` · Referencia ${error.traceId}` : ''}`, true); }
  finally { if (submitButton) submitButton.disabled = false; }
}
async function click(event) {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action, id = element.dataset.id;
  if (action === 'back') { history.back(); return; }
  if (action === 'insert-code') {
    const form = element.closest('form'), textarea = form.querySelector('textarea');
    const language = form.querySelector('[data-code-language]').value;
    const snippet = `\n\n\`\`\`${language}\n// Tu código aquí\n\`\`\`\n`;
    textarea.setRangeText(snippet, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.focus(); textarea.dispatchEvent(new Event('input', { bubbles: true })); return;
  }
  if (action === 'copy-code') {
    const code = element.closest('.code-block')?.querySelector('pre code')?.textContent;
    try { await navigator.clipboard.writeText(code || ''); notify('Código copiado.'); } catch { notify('No fue posible copiar el código.', true); }
    return;
  }
  if (action === 'project-comments') {
    const target = document.getElementById(`project-extra-${id}`);
    if (target) { if (target.hidden) await projectExtras(id, target); else target.hidden = true; }
    return;
  }
  if (action === 'logout') {
    try { await authRequest('/auth/cierre-sesion'); } catch { /* La sesión local se cierra igualmente. */ }
    setSession(null); state.profiles.clear(); notify('Sesión cerrada.'); location.hash = '#/explorar'; await route(); return;
  }
  if (!state.user) { location.hash = '#/entrar'; return; }
  element.disabled = true;
  try {
    if (action === 'follow') await api(`/perfiles/${id}/seguimiento`, { method: element.dataset.following === 'true' ? 'DELETE' : 'PUT' });
    else if (action === 'react') await api(`/publicaciones/${id}/reaccion`, { method: 'PUT', body: { tipo: element.dataset.type } });
    else if (action === 'unreact') await api(`/publicaciones/${id}/reaccion`, { method: 'DELETE' });
    else if (action === 'delete-comment') { if (!confirm('¿Eliminar este comentario?')) return; await api(`/comentarios/${id}`, { method: 'DELETE' }); }
    else return;
    notify('Cambios guardados.'); await route();
  } catch (error) { notify(`${errorText(error)}${error.traceId ? ` · Referencia ${error.traceId}` : ''}`, true); }
  finally { element.disabled = false; }
}
document.addEventListener('submit', submit);
document.addEventListener('click', click);
document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement) || !field.id) return;
  const preview = field.closest('form')?.querySelector(`[data-preview-for="${field.id}"]`);
  if (preview) preview.innerHTML = rich(field.value);
});
window.addEventListener('hashchange', route);
renderSession();
refreshSession().finally(route);

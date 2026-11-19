# DevNet · frontend

Interfaz independiente para la API de **EAP02-Back**. Usa Vite y JavaScript sin un framework adicional. El código fuente de este repositorio no necesita Docker, Java ni IntelliJ para ejecutarse.

## Para abrirlo en tu PC

1. Instala Node.js **22.12 o superior**.
2. En la carpeta `EAP02-front`, ejecuta `corepack enable` y `pnpm install`. Si no tienes Corepack, instala pnpm 11 o usa `npm install`.
3. Copia `.env.example` a `.env`. La URL inicial apunta a `https://eap02-back.onrender.com`. Si quieres probar con el backend local, cambia `DEVNET_API_TARGET=http://localhost:8080`.
4. Ejecuta `pnpm dev` (o `npm run dev`). Abre **http://127.0.0.1:5173/**.

El servidor de Vite envía las solicitudes `/api` al backend configurado. Así el navegador habla solo con `localhost` y no requiere cambiar CORS en Render. Durante el desarrollo local, el proxy ajusta la cookie de refresco HTTPS para que funcione en `http://127.0.0.1`. Los tokens de acceso se conservan solo en memoria; la cookie de refresco sigue siendo HttpOnly.

Si Render tarda en despertar, la primera lectura puede demorar. Si la portada muestra un error, comprueba primero que `DEVNET_API_TARGET` sea accesible y vuelve a cargar. **Esta copia aún no ha sido probada contra el servicio Render en vivo**: la conexión desde el entorno de creación agotó el tiempo de espera.

## Recorrido de demo

1. Registra una cuenta o entra con una cuenta `DESARROLLADOR` existente. Tras el inicio de sesión aparecen los proyectos.
2. Ve a **Mi perfil → Editar mi perfil**. Escribe nombre, biografía y al menos una tecnología con su nivel; guarda. El perfil inicial lo crea el backend al registrarse.
3. Publica un proyecto desde **Proyectos → Publicar proyecto**. Vuelve a **Proyectos** y busca por texto o tecnología. Esto muestra HU‑19.
4. Abre **Discusiones → Nueva discusión**. Escribe una pregunta de al menos 20 caracteres, elige tecnología y pulsa **Insertar bloque de código**. Cambia el ejemplo por código real. La vista previa muestra resaltado y el detalle permite copiarlo.
5. Con otra cuenta, abre la discusión, añade un comentario y prueba reacciones. Puedes visitar el perfil, seguir a la persona y enviarle un mensaje. **Mensajes** muestra la bandeja y el historial.
6. Para HU‑20, inicia sesión con un usuario que tenga `auditoria:consultar`; aparecerá **Auditoría** en la cabecera. Filtra por operación o fecha. El backend exige los permisos y MFA que correspondan. HU‑21 se muestra en los logs JSON del backend; los errores de la interfaz enseñan su `traceId` para buscarlos allí.

## Alcance y decisiones de la interfaz

- Se incluyen registro, inicio y cierre de sesión, perfil público y configuración inicial, catálogo de tecnologías, seguimiento, proyectos, búsqueda HU‑19, discusiones, comentarios, reacciones, mensajes y auditoría HU‑20 según permisos.
- El plus para desarrolladores es Markdown sencillo con bloques de código resaltados y botón **Copiar**. El contenido del usuario se escapa antes de insertarlo en el HTML.
- La edición de proyectos no aparece en la interfaz: la API publicada lista proyectos, pero no ofrece un `GET /api/v1/proyectos/{id}` con descripción, licencia y URL de demo para rellenar correctamente un formulario de reemplazo completo. La API backend conserva esa capacidad.
- La edición del perfil usa la lectura privada `/perfiles/{id}/edicion` si está desplegada. Si aún no está, usa el perfil público para la configuración inicial y pide revisar niveles y años antes de guardar. No se inventan esos datos.
- La auditoría requiere una cuenta ADMIN con el permiso efectivo; una cuenta común no verá la opción. La configuración de MFA de administradores corresponde al backend y no se implementa en esta interfaz.

## Verificación y compilación

```bash
pnpm test
pnpm build
pnpm preview
```

`pnpm preview` abre la compilación en **http://127.0.0.1:4173/** y también usa el proxy local. La carpeta `dist/` se ignora en Git. Antes de presentar, prueba manualmente el recorrido anterior contra el backend elegido; los tests de este repositorio no sustituyen esa comprobación.

## Repositorio y eventual despliegue

Esta carpeta está separada de EAP02-Back y tiene su propio `.gitignore`. Puedes crear un repositorio remoto llamado `EAP02-front` y conectarlo desde esta carpeta. No se ha hecho push ni se ha desplegado.

Si más adelante publicas `dist/` en otro dominio, **un alojamiento estático por sí solo no reproduce el proxy de Vite**. Configura un reverse proxy HTTPS que sirva el frontend y encamine `/api` a Render bajo el mismo origen, o coordina con el equipo de backend una política CORS y de cookies apropiada. No pongas tokens ni claves en variables `VITE_` ni en el repositorio.

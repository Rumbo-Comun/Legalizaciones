# Legalizaciones USCOM

Aplicacion web para solicitudes de consignacion, aprobacion, control de fondos, registro de gastos, soportes, observaciones e informes PDF.

## Flujo

- Solicitantes: Andres, William y Felipe crean solicitudes.
- Revisor/aprobador: OTTO recibe la solicitud, aprueba la consignacion y puede cargar soporte.
- Luego de consignado se habilita el registro de gastos.
- La app permite pedir ampliacion cuando el fondo se esta agotando.
- Solo admin administra usuarios.

## Desarrollo local

```bash
npm install
npm run dev -- -p 3020 -H 127.0.0.1
```

Abrir:

```text
http://127.0.0.1:3020
```

Los usuarios se administran desde el panel `Administrador` dentro de la aplicacion.

## Variables de entorno

Copiar `.env.example` y configurar en Coolify:

```env
APP_BASE_URL=https://tu-url-de-coolify
MAIL_FROM=Legalizaciones USCOM <proyectos@uscom.net.co>
RESEND_API_KEY=tu_api_key_de_resend
CRON_SECRET=un_secreto_largo_para_tareas_programadas
DATA_DIR=/app/data
```

Para pruebas con Resend sin dominio verificado, usar:

```env
MAIL_FROM=Legalizaciones USCOM <onboarding@resend.dev>
```

Durante pruebas, OTTO recibe en `canales@uscom.net.co`. Para produccion se puede volver a `otto.urrea@uscom.net.co`.

## Coolify

Opcion recomendada:

1. Subir este repositorio a Git.
2. Crear una app en Coolify desde el repositorio.
3. Elegir build con `Dockerfile`.
4. Configurar las variables de entorno.
5. Definir puerto interno `3000`.
6. Agregar volumen persistente para:

```text
/app/data
```

Ese volumen conserva la base SQLite (`legalizaciones.sqlite`) y los soportes cargados en `evidencias/`.

El contenedor arranca con `npm run start`, que ejecuta `next start` en Node.js. Coolify no necesita Wrangler ni Cloudflare Workers.

## Alertas automaticas

Crear en Coolify una tarea programada diaria que llame:

```text
https://tu-dominio/api/reminders/legalization?secret=TU_CRON_SECRET
```

La tarea envia alertas durante los dias 1, 2 y 3 posteriores a la fecha estimada de finalizacion para solicitudes de tipo `Viaticos` o `Proyecto` que no hayan sido cerradas/legalizadas.

## Comandos

```bash
npm run build
npm run start
```

`npm run start` respeta la variable `PORT` que asigna Coolify.

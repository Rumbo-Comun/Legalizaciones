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

Usuarios locales:

```text
proyectos@uscom.net.co / andres123
william@local / william123
felipe@local / felipe123
otto.urrea@uscom.net.co / otto123
admin@local / admin123
```

## Variables de entorno

Copiar `.env.example` y configurar en Coolify:

```env
APP_BASE_URL=https://tu-url-de-coolify
MAIL_FROM=Legalizaciones USCOM <proyectos@uscom.net.co>
RESEND_API_KEY=tu_api_key_de_resend
```

Para pruebas con Resend sin dominio verificado, usar:

```env
MAIL_FROM=Legalizaciones USCOM <onboarding@resend.dev>
```

Para enviar a `otto.urrea@uscom.net.co`, Resend exige verificar el dominio `uscom.net.co`.

## Coolify

Opcion recomendada:

1. Subir este repositorio a Git.
2. Crear una app en Coolify desde el repositorio.
3. Elegir build con `Dockerfile`.
4. Configurar las variables de entorno.
5. Definir puerto interno `3000`.
6. Agregar volumen persistente para:

```text
/app/.wrangler
```

Ese volumen conserva la base local de D1/Miniflare y soportes R2 simulados cuando se ejecuta en contenedor.

## Comandos

```bash
npm run build
npm run start
```

`npm run start` respeta la variable `PORT` que asigna Coolify.

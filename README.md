# Experiencia CENOA · Encuesta de satisfacción

Terminal de encuestas para tablets (Autosol, Autolux, Autociel) con resultados guardados en **Google Sheets** mediante **Google Apps Script**. Se publica como sitio estático en **Cloudflare Pages**.

## Cómo funciona

```
Tablet (Cloudflare Pages)  ──POST/GET──▶  Apps Script Web App  ──▶  Google Sheet
         │                                                         (Encuestas / Sucursales)
         └─ cola offline en la tablet: si se corta internet, los votos se guardan
            y se reenvían solos cuando vuelve la conexión.
```

## 1. Google Sheets + Apps Script

1. Creá un Google Sheet nuevo.
2. **Extensiones → Apps Script**, pegá el contenido de [`apps-script/Code.gs`](apps-script/Code.gs) y guardá.
3. Ejecutá la función **`setup`** una vez (aceptá los permisos).
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copiá la URL que termina en `/exec`.

## 2. Cloudflare Pages

| Configuración | Valor |
| --- | --- |
| Framework preset | Vite / None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable de entorno | `VITE_APPS_SCRIPT_URL` = URL `/exec` del paso anterior |

Después de cargar la variable, hacé **Retry deployment** para que se aplique.

> También podés pegar la URL directamente en la app: **Configuración → Conexión con Google Sheets** (se guarda en esa tablet).

## Desarrollo local

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

# 🚀 Guía de Despliegue en Netlify - Lavandería Batery Clean

El proyecto ya está **100% configurado y adaptado** para funcionar en **Netlify** utilizando:
- **Frontend Estático**: Servido directamente desde la carpeta `public/` a través de la CDN global de Netlify.
- **Backend Serverless**: Express adaptado mediante `serverless-http` dentro de `netlify/functions/api.js`.
- **Configuración Automática**: Archivo `netlify.toml` con redirecciones `/api/*`, inclusión de la base de datos `batery_clean.db` y Node.js versión 22.

---

## 📋 Método 1: Despliegue mediante GitHub (Recomendado)

Este es el método más rápido y estándar en Netlify:

### Paso 1: Subir el proyecto a GitHub
Si aún no tienes el proyecto en un repositorio Git:
```bash
git init
git add .
git commit -m "feat: Batery Clean listo para Netlify"
```
Crea un repositorio en [GitHub](https://github.com/new) (por ejemplo `batery-clean`) y sube tus archivos:
```bash
git remote add origin https://github.com/TU_USUARIO/batery-clean.git
git branch -M main
git push -u origin main
```

### Paso 2: Conectar a Netlify
1. Ingresa a [Netlify.com](https://app.netlify.com) e inicia sesión.
2. Haz clic en el botón **"Add new site"** ➔ **"Import an existing project"**.
3. Selecciona **GitHub** y autoriza el acceso a tu repositorio `batery-clean`.
4. Netlify detectará automáticamente el archivo `netlify.toml`:
   - **Build command**: `npm run build`
   - **Publish directory**: `public`
   - **Functions directory**: `netlify/functions`
5. Haz clic en **"Deploy site"**.
6. En 1 a 2 minutos tu sitio estará en línea con una URL pública gratuita (por ejemplo: `https://batery-clean.netlify.app`).

---

## ⚡ Método 2: Despliegue directo mediante Netlify CLI

Si prefieres desplegar desde la terminal sin pasar por GitHub:

```bash
npx netlify-cli login
npx netlify-cli deploy --prod
```
Selecciona crear un nuevo sitio y presiona Enter para aceptar los valores por defecto configurados en `netlify.toml`.

---

## 🧠 Información Importante sobre la Base de Datos en Netlify

1. **Datos Incluidos**: La base de datos actual `batery_clean.db` (con los 6 meses de historial, reportes, catálogo y configuración) está empaquetada dentro de la función serverless y se copia automáticamente al directorio temporal `/tmp` de la función.
2. **Naturaleza Serverless**: Las funciones de Netlify son *serverless* (instancias temporales que se crean y destruyen según la demanda). Todo lo que ya está grabado en `batery_clean.db` estará disponible para consultar reportes, estadísticas y catálogo.
3. **Persistencia Permanente en Producción**: Si en el futuro deseas que los pedidos que crees en la versión web se guarden permanentemente en la nube sin depender del reinicio de las instancias serverless:
   - Puedes conectar una base de datos SQLite en la nube gratuita como **Turso (LibSQL)**.
   - O bien desplegar el mismo backend en plataformas con disco persistente como **Render** o **Railway**.

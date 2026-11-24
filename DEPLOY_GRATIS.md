# 🌐 Dónde Alojar el Proyecto Gratis (Alternativas a Netlify)

## 🤔 ¿Por qué Netlify no es ideal para este proyecto?
Netlify fue creado originalmente para sitios web puramente **estáticos** (HTML, CSS y JavaScript de cliente). 
Al tratarse de una aplicación completa con **servidor Node.js (Express)** y **base de datos SQLite**:
1. Si subiste la carpeta arrastrándola (Drag & Drop), Netlify **no ejecuta el servidor ni la base de datos**, por lo que cualquier llamada a `/api/...` devuelve error 404.
2. Netlify solo corre código de backend mediante *Funciones Serverless* efímeras que se apagan tras pocos segundos y borran el disco temporal.

Para una aplicación con Node.js y SQLite, la mejor opción es un **servicio de servidor continuo gratuito** (PaaS). A continuación tienes las 3 mejores opciones:

---

## 🥇 Opción 1: Render.com (La Más Recomendada y 100% Gratis)

Render es la plataforma más popular y sencilla para alojar aplicaciones Node.js completas con Express y SQLite.

### Ventajas de Render:
- ✅ **100% Gratuito** (Plan *Free Web Service* permanente).
- ✅ Asigna un dominio seguro automático con candado SSL (ej: `https://batery-clean.onrender.com`).
- ✅ Ejecuta `node server.js` como un servidor real, sin las limitaciones de Netlify.
- ✅ Ya dejamos el archivo [`render.yaml`](file:///c:/Users/Dell/Desktop/Batery%20Clean/render.yaml) configurado para que detecte Node 22 automáticamente.

### Pasos para montar en Render:
1. **Sube el proyecto a GitHub**:
   Si aún no lo tienes en GitHub, abre la terminal en la carpeta del proyecto y ejecuta:
   ```bash
   git init
   git add .
   git commit -m "Batery Clean listo para Render"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/batery-clean.git
   git push -u origin main
   ```
2. **Crea tu cuenta en Render**:
   - Entra a [https://render.com](https://render.com) y regístrate gratis con tu cuenta de GitHub.
3. **Crea el Servicio Web**:
   - En el panel de Render, haz clic en **"New +"** (arriba a la derecha) y elige **"Web Service"**.
   - Selecciona **"Build and deploy from a Git repository"** y elige tu repositorio `batery-clean`.
   - Render rellenará los campos automáticamente gracias a `render.yaml`:
     - **Name**: `batery-clean`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`
4. Haz clic en **"Deploy Web Service"**.
5. En 2 minutos tu sistema estará funcionando en internet con su URL pública.

---

## 🥈 Opción 2: Railway.app (Excelente rendimiento con disco)

Railway es otra alternativa de primer nivel para Node.js:
- **Web**: [https://railway.app](https://railway.app)
- Inicias sesión con GitHub.
- Clic en **"New Project"** ➔ **"Deploy from GitHub repo"** ➔ Seleccionas `batery-clean`.
- Te permite añadir un *Volume* (disco persistente) para la base de datos SQLite con 1 solo clic.

---

## 🥉 Opción 3: Koyeb.com (Sin tarjeta de crédito)

Koyeb ofrece un nivel gratuito permanente (Eco Tier):
- **Web**: [https://koyeb.com](https://koyeb.com)
- Soporta Node.js y detecta automáticamente el [`Dockerfile`](file:///c:/Users/Dell/Desktop/Batery%20Clean/Dockerfile) que dejamos en el proyecto.
- No solicita tarjeta de crédito para iniciar.

---

## 💡 Recordatorio: Uso Local en la Lavandería (100% Gratis y Sin Internet)

Si el objetivo principal es usar el sistema dentro del local en **Calle Villa Alegre 603, Nacimiento**, **no necesitas subirlo a internet**:
- El sistema está listo para funcionar de forma **100% offline** en tu computador abriendo `http://localhost:3050`.
- Cualquier celular, tablet o notebook conectado al Wi-Fi del local puede entrar ingresando la IP local del equipo (ej: `http://192.168.5.56:3050`) para tomar pedidos e imprimir comprobantes sin depender de conexiones externas.

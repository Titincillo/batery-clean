# ⚡ Lavandería Batery Clean - Sistema de Gestión de Pedidos & Clientes

Sistema integral desarrollado a medida para **Lavandería Batery Clean** ("Lavado de Alta Energía"), basado fielmente en su **Guía de Recepción física**, respetando su identidad visual corporativa (azules eléctricos, cyan agua y verde neón) y optimizado para funcionar **100% sin conexión a internet (Offline-First)** con base de datos local SQLite.

---

## 🚀 Inicio Rápido (1 Clic)

Simplemente haz doble clic en el archivo:
```
▶ Iniciar_Batery_Clean.bat
```
Esto iniciará el servidor local y abrirá automáticamente tu navegador en:
👉 `http://localhost:3050`

---

## 📋 Módulos y Funcionalidades

### 1. 📝 Nueva Guía de Recepción (Toma de Pedidos)
* **Folio Automático:** Genera correlativos automáticos e incrementales (`000001`, `000002`...).
* **Búsqueda Inteligente de Clientes:** Autocompletado rápido al escribir nombre o teléfono. Si el cliente ya existe, rellena su dirección y teléfono automáticamente; si es nuevo, lo guarda de forma transparente.
* **Catálogo de 41 Prendas del Afiche:** Organizado en 2 columnas idénticas al volante original:
  * **Columna 1:** Lavado + Secado, Servicio Completo, Ropa interior, Sábanas, Toallas, Manteles, Secado, Planchado, Sintético, Sherpa, Plumón, Frazada sintética, Frazada lana, Cubre colchón, Cubre plumón, Saco dormir, Colcha, Casaca pluma, Casaca acolchada, Casaca simple.
  * **Columna 2:** Impermeable, Abrigo corto, Abrigo mediano, Abrigo largo, Blazer, Vestón, Gilet, Terno, Corbata, Camisa, Blusa, Vestido fiesta, Vestido novia, Pantalón, Polera, Polerón, Chaleco delgado, Chaleco grueso, Falda, Delantal, Overol.
  * Botón para **agregar prendas personalizadas** fuera de catálogo.
* **Servicios Especiales:** Casillas de selección para *Blanqueador, Desmanchado, Colgador, Bolsa y Ropa ignífuga*.
* **Observaciones:** Espacio para registrar detalles específicos, roturas previas o manchas delicadas.
* **Cálculo Automático en Tiempo Real:** Totaliza las prendas y subtotales al instante.
* **Documento y Pago:** Selección de Boleta, Factura o Sin Documento, y estado de pago (Pendiente o Pagado).

### 2. 🖨️ Impresión / Réplica Digital de la Guía
* Genera una réplica digital de la **Guía de Recepción** lista para imprimir en papel o exportar como PDF.
* Incluye los datos del negocio (Calle Villa Alegre 603, Nacimiento; +569 68096021; Instagram; Email), Folio destacado en rojo y los **5 Términos y Condiciones oficiales** del afiche.

### 3. 📲 Notificación Automática por WhatsApp
* Botón de un solo clic que abre WhatsApp con un mensaje pre-redactado y personalizado para el cliente:
  > *"¡Hola [Nombre]! Le saludamos de Lavandería Batery Clean 🧼⚡. Le informamos que su pedido Folio #[Folio] ya está listo para retiro. Total: $[Total]. ¡Muchas gracias por su preferencia!"*

### 4. 🧺 Control de Pedidos & Estados
* Flujo de estados claro: `📥 Recibido` ➔ `🧼 En Lavado` ➔ `✅ Listo para Retiro` ➔ `📦 Entregado`.
* Filtros por estado, buscador rápido por número de folio o cliente.

### 5. 👥 Directorio de Clientes
* **Gestión Completa:** Agregar nuevos clientes, editar datos existentes y eliminar con modal de confirmación y alerta de pedidos históricos.
* **Datos Registrados:** Nombre, Teléfono / WhatsApp, Correo electrónico (con enlace directo `mailto:`), RUT, Dirección, Notas internas e Historial de pedidos.
* **Control de Grilla y Columnas Visibles:**
  * **Dirección y Fecha de Integración ocultas por defecto** para mantener una vista limpia, compacta y moderna.
  * **Selector de columnas:** Casillas interactivas (`[✓] Correo`, `[✓] RUT`, `[✓] Pedidos`, `[ ] Dirección`, `[ ] Fecha`) para mostrar u ocultar cualquier columna al instante.
  * **Botón `👁️ Ocultar / Mostrar Grilla`:** Permite plegar o desplegar la grilla completa de clientes según convenga, recordando tus preferencias en el navegador.

### 6. 🏷️ Catálogo & Precios (100% Editable)
* **Todo Editable en Línea:** Puedes modificar directamente en la tabla el **Nombre de la prenda**, la **Categoría** y el **Precio en CLP** y presionar `💾 Guardar`.
* **Edición en Modal:** Botón `✏️` para editar la prenda de forma cómoda en una ventana emergente.
* **➕ Agregar Servicios / Prendas:** Botón para dar de alta nuevas prendas con su categoría y tarifa.
* **🗑️ Eliminar con Confirmación:** Botón para quitar prendas o servicios del catálogo cuando ya no se ofrezcan.
* **Buscador & Filtro por Categoría:** Filtra instantáneamente por texto o por categorías (*Hogar y Cama, Abrigos y Casacas, Trajes y Formal, Lavado General, etc.*).
* **Sincronización Total:** Cada vez que agregas o editas una prenda, se actualiza inmediatamente en el formulario de la **Guía de Recepción**.

---

## 📱 Acceso desde el Teléfono en Red Local (Gratis e Inmediato)

Sin necesidad de internet ni pagar suscripciones, cualquier teléfono conectado a la **misma red Wi-Fi del local** puede abrir el sistema:
1. Al iniciar la app, la consola y la pestaña **"📱 Versión Móvil & Nube"** te muestran la IP local (ejemplo: `http://192.168.1.XX:3050`).
2. Ingresas esa dirección en el navegador Chrome o Safari de tu celular.
3. ¡Listo! Puedes tomar pedidos y revisar estados desde el celular mientras te mueves por la lavandería.

---

## ☁️ Hoja de Ruta para Versión Premium (Suscripción Cloud)

Para convertir esto en un modelo de suscripción mensual (donde el dueño pueda ver su negocio fuera de la lavandería desde cualquier lugar del mundo con datos 4G/5G):
1. **Base de Datos Híbrida (Offline-First):** La base de datos SQLite local sigue siendo el maestro en el local (si se cae el internet, la lavandería sigue funcionando sin interrupción).
2. **Sincronizador Cloud (REST / Supabase / Firebase):**
   * El sistema ya cuenta con el endpoint `/api/sync/export` para volcado de datos.
   * Se añade un webhook/background worker que, cada vez que hay internet, replica los pedidos a una base de datos en la nube (ej. Supabase PostgreSQL gratuita o de bajo costo).
3. **App Móvil PWA / Web Móvil Premium:** El cliente accede a una URL pública segura (ej: `app.bateryclean.cl`) con autenticación, permitiéndole consultar métricas, ingresos diarios y enviar WhatsApps desde su casa.

---

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js + Express
* **Base de Datos:** SQLite nativo embebido (`node:sqlite`), sin dependencias complejas ni configuración externa. Archivo: `batery_clean.db`.
* **Frontend:** HTML5 semántico, CSS3 moderno con variables y paleta oficial del afiche, JavaScript Vanilla responsivo (cero dependencias de CDNs externas, 100% autónomo).

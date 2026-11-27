const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
let DB_PATH;

if (isServerless) {
  DB_PATH = path.join('/tmp', 'batery_clean.db');
  const bundledDb = path.join(__dirname, 'batery_clean.db');
  if (!fs.existsSync(DB_PATH) && fs.existsSync(bundledDb)) {
    try {
      fs.copyFileSync(bundledDb, DB_PATH);
      console.log('📦 Base de datos copiada exitosamente a /tmp para ejecución en Netlify/Serverless');
    } catch (e) {
      console.warn('⚠️ No se pudo copiar la base de datos a /tmp:', e.message);
    }
  }
} else {
  DB_PATH = path.join(__dirname, 'batery_clean.db');
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrency and reliability (only if supported)
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  // Fallback to DELETE mode if WAL is restricted in serverless environment
  try { db.exec('PRAGMA journal_mode = DELETE;'); } catch (err) {}
}
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  // 1. Business Config
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'LAVANDERÍA BATERY CLEAN',
      slogan TEXT DEFAULT 'Lavado de Alta Energía',
      address TEXT DEFAULT 'Calle Villa Alegre 603, Nacimiento',
      phone TEXT DEFAULT '+569 68096021',
      instagram TEXT DEFAULT 'lavanderiabateryclean_',
      email TEXT DEFAULT 'lavanderiabateryclean@gmail.com',
      next_folio INTEGER DEFAULT 1,
      terms TEXT
    );
  `);

  // Default terms
  const defaultTerms = `1. La ropa se recibe en buen estado, y se entrega en el mismo estado, salvo desgaste normal por el proceso de lavado y secado.
2. No nos hacemos responsables por prendas de valor, dinero u objetos olvidados en las prendas.
3. En caso de pérdida o daño, se hará el reembolso del valor de la prenda, según su depreciación.
4. El cliente deberá revisar su ropa al momento de la entrega.
5. Este comprobante es su respaldo de recepción.`;

  const configRow = db.prepare('SELECT * FROM business_config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(`
      INSERT INTO business_config (id, name, slogan, address, phone, instagram, email, next_folio, terms)
      VALUES (1, 'LAVANDERÍA BATERY CLEAN', 'Lavado de Alta Energía', 'Calle Villa Alegre 603, Nacimiento', '+569 68096021', 'lavanderiabateryclean_', 'lavanderiabateryclean@gmail.com', 1, ?)
    `).run(defaultTerms);
  }

  // 2. Services catalog
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      default_price REAL NOT NULL DEFAULT 0,
      active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0
    );
  `);

  // 3. Clients
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      rut TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: ensure email column exists if table was created previously
  try {
    db.exec('ALTER TABLE clients ADD COLUMN email TEXT;');
  } catch (e) {
    // Column already exists
  }

  // 4. Orders (Guías de recepción)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT NOT NULL UNIQUE,
      client_id INTEGER,
      client_name TEXT NOT NULL,
      client_rut TEXT,
      client_phone TEXT,
      client_address TEXT,
      reception_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      exit_date TEXT,
      document_type TEXT DEFAULT 'BOLETA',
      status TEXT DEFAULT 'RECIBIDO',
      payment_status TEXT DEFAULT 'PENDIENTE',
      payment_method TEXT DEFAULT 'EFECTIVO',
      paid_amount REAL DEFAULT 0,
      special_services TEXT DEFAULT '[]',
      observations TEXT,
      total REAL NOT NULL DEFAULT 0,
      sync_status TEXT DEFAULT 'LOCAL_ONLY',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );
  `);

  // Safe migrations for existing databases: add client_rut and exit_date columns
  try {
    db.exec('ALTER TABLE orders ADD COLUMN client_rut TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec('ALTER TABLE orders ADD COLUMN exit_date TEXT;');
  } catch (e) {
    // Column already exists
  }

  // Normalize RUTs without dots & align legacy workshop status values
  try {
    db.exec("UPDATE clients SET rut = REPLACE(rut, '.', '') WHERE rut LIKE '%.%';");
    db.exec("UPDATE orders SET client_rut = (SELECT REPLACE(c.rut, '.', '') FROM clients c WHERE c.id = orders.client_id) WHERE (client_rut IS NULL OR client_rut = '') AND client_id IS NOT NULL;");
    db.exec("UPDATE orders SET client_rut = REPLACE(client_rut, '.', '') WHERE client_rut LIKE '%.%';");
    db.exec("UPDATE orders SET status = 'EN_LAVADO' WHERE status = 'EN_PROCESO';");
    db.exec("UPDATE orders SET exit_date = delivery_date WHERE status = 'ENTREGADO' AND (exit_date IS NULL OR exit_date = '');");
  } catch (e) {
    console.warn('Migration cleanup warning:', e.message);
  }

  // 5. Order Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // 6. Expenses (Gastos e Insumos)
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      product_type TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      purchase_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default services if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM services').get().cnt;
  if (count === 0) {
    const initialServices = [
      // Columna 1 del afiche
      { name: 'Lavado + Secado', category: 'Lavado General', default_price: 6000, display_order: 1 },
      { name: 'Servicio Completo', category: 'Lavado General', default_price: 8000, display_order: 2 },
      { name: 'Ropa interior', category: 'Prendas Básicas', default_price: 500, display_order: 3 },
      { name: 'Sabanas', category: 'Hogar y Cama', default_price: 4500, display_order: 4 },
      { name: 'Toallas', category: 'Hogar y Cama', default_price: 2500, display_order: 5 },
      { name: 'Manteles', category: 'Hogar y Cama', default_price: 3500, display_order: 6 },
      { name: 'Secado', category: 'Lavado General', default_price: 3000, display_order: 7 },
      { name: 'Planchado', category: 'Lavado General', default_price: 3000, display_order: 8 },
      { name: 'Sintético', category: 'Prendas Básicas', default_price: 3500, display_order: 9 },
      { name: 'Sherpa', category: 'Hogar y Cama', default_price: 7000, display_order: 10 },
      { name: 'Plumón', category: 'Hogar y Cama', default_price: 8500, display_order: 11 },
      { name: 'Frazada sintética', category: 'Hogar y Cama', default_price: 6500, display_order: 12 },
      { name: 'Frazada lana', category: 'Hogar y Cama', default_price: 7500, display_order: 13 },
      { name: 'Cubre colchón', category: 'Hogar y Cama', default_price: 6000, display_order: 14 },
      { name: 'Cubre plumón', category: 'Hogar y Cama', default_price: 5500, display_order: 15 },
      { name: 'Saco dormir', category: 'Especiales', default_price: 7500, display_order: 16 },
      { name: 'Colcha', category: 'Hogar y Cama', default_price: 6500, display_order: 17 },
      { name: 'Casaca pluma', category: 'Abrigos y Casacas', default_price: 8000, display_order: 18 },
      { name: 'Casaca acolchada', category: 'Abrigos y Casacas', default_price: 7000, display_order: 19 },
      { name: 'Casaca simple', category: 'Abrigos y Casacas', default_price: 5500, display_order: 20 },

      // Columna 2 del afiche
      { name: 'Impermeable', category: 'Abrigos y Casacas', default_price: 6500, display_order: 21 },
      { name: 'Abrigo corto', category: 'Abrigos y Casacas', default_price: 7000, display_order: 22 },
      { name: 'Abrigo mediano', category: 'Abrigos y Casacas', default_price: 8500, display_order: 23 },
      { name: 'Abrigo largo', category: 'Abrigos y Casacas', default_price: 10000, display_order: 24 },
      { name: 'Blazer', category: 'Trajes y Formal', default_price: 5000, display_order: 25 },
      { name: 'Veston', category: 'Trajes y Formal', default_price: 5500, display_order: 26 },
      { name: 'Gilet', category: 'Trajes y Formal', default_price: 3500, display_order: 27 },
      { name: 'Terno', category: 'Trajes y Formal', default_price: 11000, display_order: 28 },
      { name: 'Corbata', category: 'Trajes y Formal', default_price: 2000, display_order: 29 },
      { name: 'Camisa', category: 'Vestuario', default_price: 3000, display_order: 30 },
      { name: 'Blusa', category: 'Vestuario', default_price: 3000, display_order: 31 },
      { name: 'Vestido fiesta', category: 'Trajes y Formal', default_price: 12000, display_order: 32 },
      { name: 'Vestido novia', category: 'Trajes y Formal', default_price: 35000, display_order: 33 },
      { name: 'Pantalón', category: 'Vestuario', default_price: 3500, display_order: 34 },
      { name: 'Polera', category: 'Vestuario', default_price: 2000, display_order: 35 },
      { name: 'Poleron', category: 'Vestuario', default_price: 3500, display_order: 36 },
      { name: 'Chaleco delgado', category: 'Vestuario', default_price: 3000, display_order: 37 },
      { name: 'Chaleco grueso', category: 'Vestuario', default_price: 4500, display_order: 38 },
      { name: 'Falda', category: 'Vestuario', default_price: 3000, display_order: 39 },
      { name: 'Delantal', category: 'Trabajo e Institucional', default_price: 3000, display_order: 40 },
      { name: 'Overol', category: 'Trabajo e Institucional', default_price: 6000, display_order: 41 }
    ];

    const insertService = db.prepare(`
      INSERT INTO services (name, category, default_price, display_order)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of initialServices) {
      insertService.run(item.name, item.category, item.default_price, item.display_order);
    }
  }
}

initDatabase();

module.exports = {
  db,
  getConfig: () => db.prepare('SELECT * FROM business_config WHERE id = 1').get(),
  updateConfig: (data) => {
    db.prepare(`
      UPDATE business_config
      SET name = ?, slogan = ?, address = ?, phone = ?, instagram = ?, email = ?, terms = ?
      WHERE id = 1
    `).run(data.name, data.slogan, data.address, data.phone, data.instagram, data.email, data.terms);
    return db.prepare('SELECT * FROM business_config WHERE id = 1').get();
  },
  getNextFolio: () => {
    const row = db.prepare('SELECT next_folio FROM business_config WHERE id = 1').get();
    const current = row ? row.next_folio : 1;
    return String(current).padStart(6, '0');
  },
  incrementFolio: () => {
    db.prepare('UPDATE business_config SET next_folio = next_folio + 1 WHERE id = 1').run();
  }
};

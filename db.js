const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  try { db.exec('PRAGMA journal_mode = DELETE;'); } catch (err) {}
}
db.exec('PRAGMA foreign_keys = ON;');

const DEFAULT_TERMS = `1. No se responde por desprendimiento de botones, broches, rotura de carros de cierre, manchas rebeldes de tratamiento profesional, roturas, desgaste por calidad de tela, prendas que estiran o encojan, bajen de tono de color o por riesgos inherentes al lavado mismo.
2. No nos hacemos responsables por dinero u objetos olvidados en las prendas.
3. Es responsabilidad del cliente revisar su ropa al momento de retirarla.
4. No se responde por robos, incendio y otro accidente de fuerza mayor.
5. Los trabajos se entregarán a quien porte este recibo; en caso de pérdida de este, se deberá dar aviso.
6. Especies no retiradas en 30 días pasarán a rezago, debiendo pagar el precio vigente de bodegaje al momento de retirarlas.
7. No se responde por trabajos entregados después de 7 días hábiles.`;

const PERMISSION_CATALOG = [
  { key: 'view_reception', label: 'Acceso a Recepción (Inicio)', group: 'Módulos' },
  { key: 'view_orders', label: 'Ver Control de Pedidos', group: 'Módulos' },
  { key: 'view_clients', label: 'Ver Módulo de Clientes', group: 'Módulos' },
  { key: 'view_catalog', label: 'Ver Catálogo & Precios', group: 'Módulos' },
  { key: 'view_expenses', label: 'Ver Gastos e Insumos', group: 'Módulos' },
  { key: 'view_reports', label: 'Ver Reportes y Estadísticas', group: 'Módulos' },
  { key: 'view_settings', label: 'Ver Ajustes y Respaldos', group: 'Módulos' },
  { key: 'create_orders', label: 'Crear Guías / Recepcionar Pedidos', group: 'Operación' },
  { key: 'manage_orders', label: 'Editar Estado, Salida y Pagos de Pedidos', group: 'Operación' },
  { key: 'manage_clients', label: 'Crear y Editar Clientes', group: 'Operación' },
  { key: 'manage_catalog', label: 'Crear, Editar y Eliminar Prendas/Precios', group: 'Operación' },
  { key: 'manage_expenses', label: 'Registrar, Editar y Eliminar Gastos', group: 'Operación' },
  { key: 'export_backups', label: 'Exportar Reportes y Respaldos BD', group: 'Operación' },
  { key: 'manage_users', label: 'Crear y Editar Usuarios de su Lavandería', group: 'Administración' },
  { key: 'manage_roles', label: 'Crear y Editar Roles y Permisos', group: 'Administración' }
];

const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map(p => p.key);

const DEFAULT_SERVICES_SEED = [
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hashHex] = storedHash.split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function seedServicesForLaundry(laundryId) {
  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (laundry_id, name, category, default_price, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of DEFAULT_SERVICES_SEED) {
    insertService.run(laundryId, item.name, item.category, item.default_price, item.display_order);
  }
}

function seedDefaultRolesForLaundry(laundryId) {
  const defaults = [
    {
      name: 'Administrador',
      description: 'Acceso total a la operación, reportes, usuarios y roles de su lavandería.',
      permissions: ALL_PERMISSION_KEYS,
      is_system: 1
    },
    {
      name: 'Cajero',
      description: 'Recepción de pedidos, cobros, entregas y atención de clientes en mostrador.',
      permissions: [
        'view_reception',
        'create_orders',
        'view_orders',
        'manage_orders',
        'view_clients',
        'manage_clients',
        'view_catalog'
      ],
      is_system: 0
    },
    {
      name: 'Operador Taller',
      description: 'Actualización de estados de lavado y prendas listas para retiro.',
      permissions: ['view_orders', 'manage_orders'],
      is_system: 0
    }
  ];

  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (laundry_id, name, description, permissions, is_system)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const role of defaults) {
    insertRole.run(laundryId, role.name, role.description, JSON.stringify(role.permissions), role.is_system);
  }

  return db.prepare('SELECT * FROM roles WHERE laundry_id = ?').all(laundryId);
}

function initDatabase() {
  // 1. Legacy Business Config (preserved for backward compatibility)
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

  let configRow = db.prepare('SELECT * FROM business_config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(`
      INSERT INTO business_config (id, name, slogan, address, phone, instagram, email, next_folio, terms)
      VALUES (1, 'LAVANDERÍA BATERY CLEAN', 'Lavado de Alta Energía', 'Calle Villa Alegre 603, Nacimiento', '+569 68096021', 'lavanderiabateryclean_', 'lavanderiabateryclean@gmail.com', 1, ?)
    `).run(DEFAULT_TERMS);
    configRow = db.prepare('SELECT * FROM business_config WHERE id = 1').get();
  }

  // 2. SaaS Plans & Laundries (Tenants)
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      limit_users INTEGER NOT NULL DEFAULT 0,
      limit_services INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      allowed_menus TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '{}',
      support_level TEXT DEFAULT 'normal',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const planCount = db.prepare('SELECT COUNT(*) as cnt FROM plans').get().cnt;
  if (planCount === 0) {
    const allTenantMenus = [
      'nueva-guia',
      'pedidos-list',
      'clientes-list',
      'precios-catalog',
      'gastos-list',
      'reportes-ventas',
      'usuarios-roles',
      'soporte',
      'ajustes'
    ];
    const insertPlan = db.prepare(`
      INSERT INTO plans (name, price, limit_users, limit_services, description, allowed_menus, features, support_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPlan.run(
      'Plan Emprendedor',
      19990,
      3,
      50,
      'Ideal para lavanderías que inician en la nube con recepción, pedidos y clientes.',
      JSON.stringify(['nueva-guia', 'pedidos-list', 'clientes-list', 'precios-catalog', 'usuarios-roles', 'soporte', 'ajustes']),
      JSON.stringify({ basicReports: false, advancedReports: false, expenses: false, exportBackups: true, offlineMode: false }),
      'normal'
    );
    insertPlan.run(
      'Plan Profesional',
      34990,
      10,
      150,
      'Gestión completa en la nube con reportes financieros, gastos, roles editables, Modo Offline y soporte preferente.',
      JSON.stringify(allTenantMenus),
      JSON.stringify({ basicReports: true, advancedReports: true, expenses: true, exportBackups: true, offlineMode: true }),
      'preferred'
    );
    insertPlan.run(
      'Plan Cadena / Full',
      59990,
      0,
      0,
      'Usuarios y catálogo ilimitados en la nube, Modo Offline incluido y soporte prioritario.',
      JSON.stringify(allTenantMenus),
      JSON.stringify({ basicReports: true, advancedReports: true, expenses: true, exportBackups: true, offlineMode: true }),
      'priority'
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS laundries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slogan TEXT DEFAULT 'Lavado de Alta Energía',
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      email TEXT DEFAULT '',
      rut TEXT DEFAULT '',
      next_folio INTEGER NOT NULL DEFAULT 1,
      terms TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      plan_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Activo',
      last_payment_date TEXT,
      paid_until TEXT,
      trial_enabled INTEGER NOT NULL DEFAULT 0,
      trial_ends_at TEXT,
      grace_until TEXT,
      grace_days_total INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { db.exec('ALTER TABLE laundries ADD COLUMN plan_id INTEGER;'); } catch (e) {}
  try { db.exec("ALTER TABLE laundries ADD COLUMN status TEXT NOT NULL DEFAULT 'Activo';"); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN last_payment_date TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN paid_until TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN trial_enabled INTEGER NOT NULL DEFAULT 0;'); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN trial_ends_at TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN grace_until TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE laundries ADD COLUMN grace_days_total INTEGER NOT NULL DEFAULT 0;'); } catch (e) {}
  try { db.exec("ALTER TABLE laundries ADD COLUMN logo_url TEXT DEFAULT '';"); } catch (e) {}

  const laundryCount = db.prepare('SELECT COUNT(*) as cnt FROM laundries').get().cnt;
  if (laundryCount === 0) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 86400000).toISOString();
    db.prepare(`
      INSERT INTO laundries (id, name, slogan, address, phone, instagram, email, rut, next_folio, terms, active, plan_id, status, last_payment_date, paid_until)
      VALUES (1, ?, ?, ?, ?, ?, ?, '', ?, ?, 1, 2, 'Activo', ?, ?)
    `).run(
      configRow.name,
      configRow.slogan,
      configRow.address,
      configRow.phone,
      configRow.instagram,
      configRow.email,
      configRow.next_folio || 1,
      configRow.terms || DEFAULT_TERMS,
      todayIso,
      in30Days
    );
  }

  // Assign sensible default plans & validity dates to existing laundries lacking them
  const existingLaundriesNeedingPlan = db.prepare('SELECT id, name, active, status, plan_id, paid_until FROM laundries').all();
  for (const l of existingLaundriesNeedingPlan) {
    if (!l.plan_id || !l.paid_until) {
      const todayIso = new Date().toISOString().slice(0, 10);
      let defaultPlanId = 2;
      let daysAhead = 28;
      if (l.id === 3 || String(l.name).toUpperCase().includes('BURBUJA')) {
        defaultPlanId = 1;
        daysAhead = 4; // Para mostrar alerta de vencimiento próximo en el panel SaaS
      } else if (l.id === 4 || String(l.name).toUpperCase().includes('LAVASECO')) {
        defaultPlanId = 3;
        daysAhead = 24;
      }
      const nextPaidUntil = l.paid_until || new Date(Date.now() + daysAhead * 86400000).toISOString();
      const resolvedStatus = l.status || (l.active ? 'Activo' : 'Suspendido');
      db.prepare(`
        UPDATE laundries
        SET plan_id = COALESCE(plan_id, ?),
            status = ?,
            last_payment_date = COALESCE(last_payment_date, ?),
            paid_until = COALESCE(paid_until, ?)
        WHERE id = ?
      `).run(defaultPlanId, resolvedStatus, todayIso, nextPaidUntil, l.id);
    }
  }

  // Grace grants, SaaS Audit Logs, Legal Agreements & Support Tickets
  db.exec(`
    CREATE TABLE IF NOT EXISTS grace_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT NOT NULL,
      previous_valid_until TEXT,
      new_valid_until TEXT NOT NULL,
      granted_by_user_id INTEGER,
      granted_by_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (laundry_id) REFERENCES laundries(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      laundry_id INTEGER,
      laundry_name TEXT,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      published_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const agreementCnt = db.prepare('SELECT COUNT(*) as cnt FROM legal_agreements').get().cnt;
  if (agreementCnt === 0) {
    db.prepare(`
      INSERT INTO legal_agreements (title, version, content, active, published_by)
      VALUES (?, ?, ?, 1, 'Super Administrador SaaS')
    `).run(
      'Acuerdo de Privacidad y Licencia SaaS Lavanderías',
      'v1.0',
      '1. CONFIDENCIALIDAD Y PRIVACIDAD DE DATOS: Cada lavandería es exclusiva propietaria de su base de ventas, órdenes, boletas/facturas, gastos y cartera de clientes.\n2. AISLAMIENTO SAAS: El Super Administrador de la plataforma gestiona exclusivamente suscripciones, planes, vigencias, límites técnicos y soporte sin acceso a datos comerciales privados.\n3. DISPONIBILIDAD Y RESPALDOS: Cada administrador local puede exportar copias de seguridad JSON de su propia sede en todo momento.'
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL,
      laundry_name TEXT NOT NULL,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'ASSISTANCE',
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'PENDING',
      unread_by_superadmin INTEGER NOT NULL DEFAULT 1,
      unread_by_tenant INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (laundry_id) REFERENCES laundries(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      sender_user_id INTEGER,
      sender_name TEXT,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    );
  `);

  // 3. Roles & Users & Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      permissions TEXT NOT NULL DEFAULT '[]',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(laundry_id, name),
      FOREIGN KEY (laundry_id) REFERENCES laundries(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER,
      role_id INTEGER,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (laundry_id) REFERENCES laundries(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      active_laundry_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 4. Services catalog
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      default_price REAL NOT NULL DEFAULT 0,
      active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      UNIQUE(laundry_id, name)
    );
  `);

  // Migrate legacy services table if created without laundry_id
  const servicesDdl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='services'").get();
  if (servicesDdl && servicesDdl.sql && !servicesDdl.sql.includes('laundry_id')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec('ALTER TABLE services RENAME TO services_legacy_mig;');
      db.exec(`
        CREATE TABLE services (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          laundry_id INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          default_price REAL NOT NULL DEFAULT 0,
          active INTEGER DEFAULT 1,
          display_order INTEGER DEFAULT 0,
          UNIQUE(laundry_id, name)
        );
      `);
      db.exec(`
        INSERT INTO services (id, laundry_id, name, category, default_price, active, display_order)
        SELECT id, 1, name, category, default_price, active, display_order FROM services_legacy_mig;
      `);
      db.exec('DROP TABLE services_legacy_mig;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // 5. Clients
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL DEFAULT 1,
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
  try { db.exec('ALTER TABLE clients ADD COLUMN email TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE clients ADD COLUMN laundry_id INTEGER NOT NULL DEFAULT 1;'); } catch (e) {}

  // 6. Orders & Order Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL DEFAULT 1,
      folio TEXT NOT NULL,
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
      created_by_user_id INTEGER,
      created_by_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(laundry_id, folio),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );
  `);

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

  // Safe migrations for existing orders columns before checking full SaaS rebuild
  try { db.exec('ALTER TABLE orders ADD COLUMN client_rut TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE orders ADD COLUMN exit_date TEXT;'); } catch (e) {}

  const ordersDdl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
  if (ordersDdl && ordersDdl.sql && !ordersDdl.sql.includes('laundry_id')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec('ALTER TABLE order_items RENAME TO order_items_legacy_mig;');
      db.exec('ALTER TABLE orders RENAME TO orders_legacy_mig;');
      db.exec(`
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          laundry_id INTEGER NOT NULL DEFAULT 1,
          folio TEXT NOT NULL,
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
          created_by_user_id INTEGER,
          created_by_name TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(laundry_id, folio),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
        );
      `);
      db.exec(`
        INSERT INTO orders (
          id, laundry_id, folio, client_id, client_name, client_rut, client_phone, client_address,
          reception_date, delivery_date, exit_date, document_type, status,
          payment_status, payment_method, paid_amount, special_services, observations, total,
          sync_status, created_at, updated_at
        )
        SELECT
          id, 1, folio, client_id, client_name, client_rut, client_phone, client_address,
          reception_date, delivery_date, exit_date, document_type, status,
          payment_status, payment_method, paid_amount, special_services, observations, total,
          sync_status, created_at, updated_at
        FROM orders_legacy_mig;
      `);
      db.exec(`
        CREATE TABLE order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          service_name TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          unit_price REAL NOT NULL DEFAULT 0,
          subtotal REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
      `);
      db.exec(`
        INSERT INTO order_items (id, order_id, service_name, quantity, unit_price, subtotal)
        SELECT id, order_id, service_name, quantity, unit_price, subtotal FROM order_items_legacy_mig;
      `);
      db.exec('DROP TABLE order_items_legacy_mig;');
      db.exec('DROP TABLE orders_legacy_mig;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Normalize legacy RUTs & workshop statuses
  try {
    db.exec("UPDATE clients SET rut = REPLACE(rut, '.', '') WHERE rut LIKE '%.%';");
    db.exec("UPDATE orders SET client_rut = (SELECT REPLACE(c.rut, '.', '') FROM clients c WHERE c.id = orders.client_id) WHERE (client_rut IS NULL OR client_rut = '') AND client_id IS NOT NULL;");
    db.exec("UPDATE orders SET client_rut = REPLACE(client_rut, '.', '') WHERE client_rut LIKE '%.%';");
    db.exec("UPDATE orders SET status = 'EN_LAVADO' WHERE status = 'EN_PROCESO';");
    db.exec("UPDATE orders SET exit_date = delivery_date WHERE status = 'ENTREGADO' AND (exit_date IS NULL OR exit_date = '');");
  } catch (e) {
    console.warn('Migration cleanup warning:', e.message);
  }

  // 7. Expenses
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laundry_id INTEGER NOT NULL DEFAULT 1,
      product_name TEXT NOT NULL,
      product_type TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      purchase_date TEXT NOT NULL,
      notes TEXT,
      created_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try { db.exec('ALTER TABLE expenses ADD COLUMN laundry_id INTEGER NOT NULL DEFAULT 1;'); } catch (e) {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN created_by_user_id INTEGER;'); } catch (e) {}

  // Seed default services for laundry 1 if empty
  const srvCount = db.prepare('SELECT COUNT(*) as cnt FROM services WHERE laundry_id = 1').get().cnt;
  if (srvCount === 0) {
    seedServicesForLaundry(1);
  }

  // Ensure default roles exist for all laundries
  const allLaundries = db.prepare('SELECT id FROM laundries').all();
  for (const l of allLaundries) {
    const rCnt = db.prepare('SELECT COUNT(*) as cnt FROM roles WHERE laundry_id = ?').get(l.id).cnt;
    if (rCnt === 0) {
      seedDefaultRolesForLaundry(l.id);
    }
  }

  // Seed initial SaaS users if users table is empty
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount === 0) {
    const adminRole = db.prepare("SELECT id FROM roles WHERE laundry_id = 1 AND name = 'Administrador'").get();
    const cashierRole = db.prepare("SELECT id FROM roles WHERE laundry_id = 1 AND name = 'Cajero'").get();

    const insertUser = db.prepare(`
      INSERT INTO users (laundry_id, role_id, username, full_name, email, password_hash, is_superadmin, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    insertUser.run(1, null, 'superadmin', 'Super Administrador SaaS', 'superadmin@bateryclean.cl', hashPassword('super123'), 1);
    insertUser.run(1, adminRole ? adminRole.id : null, 'admin', 'Administrador Batery Clean', 'admin@bateryclean.cl', hashPassword('admin123'), 0);
    insertUser.run(1, cashierRole ? cashierRole.id : null, 'cajero', 'Cajero Mostrador', 'cajero@bateryclean.cl', hashPassword('cajero123'), 0);
  }
}

initDatabase();

function getConfig(laundryId = 1) {
  return db.prepare('SELECT * FROM laundries WHERE id = ?').get(laundryId) || db.prepare('SELECT * FROM laundries ORDER BY id ASC LIMIT 1').get();
}

function updateConfig(laundryId = 1, data = {}) {
  const existing = getConfig(laundryId);
  if (!existing) return null;
  db.prepare(`
    UPDATE laundries
    SET name = ?, slogan = ?, address = ?, phone = ?, instagram = ?, email = ?, rut = ?, terms = ?, logo_url = ?
    WHERE id = ?
  `).run(
    data.name !== undefined ? data.name : existing.name,
    data.slogan !== undefined ? data.slogan : existing.slogan,
    data.address !== undefined ? data.address : existing.address,
    data.phone !== undefined ? data.phone : existing.phone,
    data.instagram !== undefined ? data.instagram : existing.instagram,
    data.email !== undefined ? data.email : existing.email,
    data.rut !== undefined ? data.rut : existing.rut,
    data.terms !== undefined ? data.terms : existing.terms,
    data.logo_url !== undefined ? data.logo_url : (existing.logo_url || ''),
    laundryId
  );

  if (Number(laundryId) === 1) {
    db.prepare(`
      UPDATE business_config
      SET name = ?, slogan = ?, address = ?, phone = ?, instagram = ?, email = ?, terms = ?
      WHERE id = 1
    `).run(
      data.name !== undefined ? data.name : existing.name,
      data.slogan !== undefined ? data.slogan : existing.slogan,
      data.address !== undefined ? data.address : existing.address,
      data.phone !== undefined ? data.phone : existing.phone,
      data.instagram !== undefined ? data.instagram : existing.instagram,
      data.email !== undefined ? data.email : existing.email,
      data.terms !== undefined ? data.terms : existing.terms
    );
  }
  return getConfig(laundryId);
}

function getNextFolio(laundryId = 1) {
  const row = db.prepare('SELECT next_folio FROM laundries WHERE id = ?').get(laundryId);
  const current = row ? row.next_folio : 1;
  return String(current).padStart(6, '0');
}

function incrementFolio(laundryId = 1) {
  db.prepare('UPDATE laundries SET next_folio = next_folio + 1 WHERE id = ?').run(laundryId);
  if (Number(laundryId) === 1) {
    db.prepare('UPDATE business_config SET next_folio = next_folio + 1 WHERE id = 1').run();
  }
}

function computeLaundryValidity(laundry) {
  if (!laundry) return { validUntil: null, daysRemaining: 0, isTrialActive: false };
  const dates = [];
  if (laundry.paid_until) {
    const d = new Date(laundry.paid_until);
    if (!Number.isNaN(d.getTime())) dates.push(d);
  }
  const now = new Date();
  let isTrialActive = false;
  if (laundry.trial_enabled && laundry.trial_ends_at) {
    const td = new Date(laundry.trial_ends_at);
    if (!Number.isNaN(td.getTime())) {
      dates.push(td);
      if (td.getTime() > now.getTime()) isTrialActive = true;
    }
  }
  if (laundry.grace_until) {
    const gd = new Date(laundry.grace_until);
    if (!Number.isNaN(gd.getTime())) dates.push(gd);
  }
  if (dates.length === 0 && laundry.created_at) {
    const cd = new Date(laundry.created_at);
    if (!Number.isNaN(cd.getTime())) dates.push(new Date(cd.getTime() + 30 * 86400000));
  }
  if (dates.length === 0) return { validUntil: null, daysRemaining: 30, isTrialActive: false };
  const validUntilDate = new Date(Math.max(...dates.map(d => d.getTime())));
  const diffMs = validUntilDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
  return {
    validUntil: validUntilDate.toISOString(),
    daysRemaining,
    isTrialActive
  };
}

function logSaasAudit({ userId = null, userName = 'Sistema', laundryId = null, laundryName = '', actionType, entityType, entityId = '', details = {} }) {
  try {
    db.prepare(`
      INSERT INTO saas_audit_logs (user_id, user_name, laundry_id, laundry_name, action_type, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, userName, laundryId, laundryName, actionType, entityType, String(entityId || ''), JSON.stringify(details || {}));
  } catch (e) {
    console.warn('Audit log warning:', e.message);
  }
}

module.exports = {
  db,
  DB_PATH,
  DEFAULT_TERMS,
  PERMISSION_CATALOG,
  ALL_PERMISSION_KEYS,
  hashPassword,
  verifyPassword,
  seedServicesForLaundry,
  seedDefaultRolesForLaundry,
  computeLaundryValidity,
  logSaasAudit,
  getConfig,
  updateConfig,
  getNextFolio,
  incrementFolio
};

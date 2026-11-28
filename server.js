const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const {
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
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir Landing Page Oficial en / y /landing
app.get(['/', '/landing'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Servir Sistema POS / Login SaaS en /app y /login
app.get(['/app', '/login'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Path normalizer for serverless / Netlify Function redirects
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '');
  } else if (req.url.startsWith('/.netlify/functions')) {
    req.url = req.url.replace(/^\/\.netlify\/functions\/[^/]+/, '');
  }
  if (!req.url.startsWith('/')) {
    req.url = '/' + req.url;
  }
  if (req.url !== '/' && req.url !== '/landing' && req.url !== '/app' && req.url !== '/login' && !req.url.startsWith('/api') && !req.url.includes('.')) {
    req.url = '/api' + req.url;
  }
  next();
});

// ----------------- HELPERS -----------------
function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeRut(rut) {
  return String(rut || '')
    .replace(/\./g, '')
    .replace(/[^0-9kK-]/g, '')
    .trim()
    .toUpperCase();
}

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, ip: net.address });
      }
    }
  }
  return addresses;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      if (key) list[key] = val;
    });
  }
  return list;
}

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.headers['x-auth-token']) {
    return String(req.headers['x-auth-token']).trim();
  }
  const cookies = parseCookies(req);
  return cookies.bc_token || null;
}

function parsePermissions(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function buildPlanObject(planRow) {
  if (!planRow) return null;
  let allowedMenus = [];
  let features = {};
  try { allowedMenus = JSON.parse(planRow.allowed_menus || '[]'); } catch (e) {}
  try { features = JSON.parse(planRow.features || '{}'); } catch (e) {}
  return {
    id: planRow.id,
    name: planRow.name,
    price: Number(planRow.price || 0),
    limit_users: Number(planRow.limit_users || 0),
    limit_services: Number(planRow.limit_services || 0),
    description: planRow.description || '',
    allowed_menus: Array.isArray(allowedMenus) ? allowedMenus : [],
    features,
    support_level: planRow.support_level || 'normal'
  };
}

function getMenuRequiredForPerm(perm) {
  const map = {
    view_reception: 'nueva-guia',
    create_orders: 'nueva-guia',
    view_orders: 'pedidos-list',
    manage_orders: 'pedidos-list',
    view_clients: 'clientes-list',
    manage_clients: 'clientes-list',
    view_catalog: 'precios-catalog',
    manage_catalog: 'precios-catalog',
    view_expenses: 'gastos-list',
    manage_expenses: 'gastos-list',
    view_reports: 'reportes-ventas',
    manage_users: 'usuarios-roles',
    manage_roles: 'usuarios-roles',
    view_settings: 'ajustes',
    export_backups: 'ajustes'
  };
  return map[perm] || null;
}

function buildAuthPayload(user) {
  const isSuper = Boolean(user.is_superadmin);

  // PRIVACY: SuperAdmin NEVER attaches to any laundry operational context or private sales data
  if (isSuper) {
    const unreadRow = db.prepare('SELECT COUNT(*) as cnt FROM support_tickets WHERE unread_by_superadmin = 1').get();
    return {
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email || '',
        laundry_id: null,
        active_laundry_id: null,
        role_id: null,
        role_name: 'Super Usuario SaaS',
        is_superadmin: true
      },
      permissions: [],
      laundry: null,
      plan: null,
      supportUnreadCount: unreadRow ? unreadRow.cnt : 0
    };
  }

  const laundry = getConfig(user.laundry_id);
  const planRow = laundry?.plan_id ? db.prepare('SELECT * FROM plans WHERE id = ?').get(laundry.plan_id) : null;
  const plan = buildPlanObject(planRow);
  const validity = computeLaundryValidity(laundry);

  let permissions = [];
  let roleName = 'Sin Rol';

  if (user.role_id) {
    const role = db.prepare('SELECT id, name, permissions FROM roles WHERE id = ? AND laundry_id = ?').get(user.role_id, user.laundry_id);
    if (role) {
      roleName = role.name;
      permissions = parsePermissions(role.permissions);
    }
  }

  // Enforce subscribed Plan allowed menus over permissions
  if (plan && Array.isArray(plan.allowed_menus) && plan.allowed_menus.length > 0) {
    const allowedSet = new Set(plan.allowed_menus);
    permissions = permissions.filter(perm => {
      const reqMenu = getMenuRequiredForPerm(perm);
      return !reqMenu || allowedSet.has(reqMenu);
    });
  }

  const unreadTenantRow = db.prepare('SELECT COUNT(*) as cnt FROM support_tickets WHERE laundry_id = ? AND unread_by_tenant = 1').get(user.laundry_id);

  return {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email || '',
      laundry_id: user.laundry_id,
      active_laundry_id: user.laundry_id,
      role_id: user.role_id,
      role_name: roleName,
      is_superadmin: false
    },
    permissions,
    laundry: laundry ? { ...laundry, ...validity } : null,
    plan,
    supportUnreadCount: unreadTenantRow ? unreadTenantRow.cnt : 0
  };
}

function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Sesión no iniciada. Inicia sesión para continuar.' });
    }

    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!session) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario deshabilitado o inexistente.' });
    }

    const payload = buildAuthPayload(user);
    if (!user.is_superadmin) {
      if (!payload.laundry || payload.laundry.status !== 'Activo' || !payload.laundry.active) {
        return res.status(403).json({ error: `Esta lavandería se encuentra ${payload.laundry?.status || 'inactiva'}. Contacta al soporte SaaS.` });
      }
      if ((payload.laundry.daysRemaining ?? 0) <= 0) {
        return res.status(403).json({ error: 'La vigencia de tu plan ha expirado. Contacta al administrador SaaS para renovar o solicitar días de gracia.' });
      }
    }

    req.session = session;
    req.token = token;
    req.user = payload.user;
    req.permissions = new Set(payload.permissions);
    req.laundryId = payload.user.active_laundry_id;
    req.laundry = payload.laundry;
    req.plan = payload.plan;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function requireTenantOnly(req, res, next) {
  if (req.user?.is_superadmin || !req.laundryId) {
    return res.status(403).json({
      error: 'Privacidad SaaS: El Super Administrador no tiene acceso a las ventas, pedidos, clientes ni datos privados de las lavanderías.'
    });
  }
  next();
}

function requirePermission(...anyPerm) {
  return (req, res, next) => {
    if (req.user?.is_superadmin || !req.laundryId) {
      return res.status(403).json({
        error: 'Privacidad SaaS: Acción exclusiva del personal autorizado de cada lavandería.'
      });
    }
    const ok = anyPerm.some(p => req.permissions && req.permissions.has(p));
    if (!ok) {
      return res.status(403).json({ error: 'No tienes permiso o tu plan actual no incluye esta función.' });
    }
    next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user?.is_superadmin) {
    return res.status(403).json({ error: 'Acceso restringido al Super Usuario SaaS.' });
  }
  next();
}

// ----------------- AUTH & SESSION ENDPOINTS -----------------
app.post('/api/auth/login', (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Este usuario está desactivado. Consulta con tu administrador.' });
    }

    if (!user.is_superadmin) {
      const userLaundry = db.prepare('SELECT * FROM laundries WHERE id = ?').get(user.laundry_id);
      if (!userLaundry || userLaundry.status !== 'Activo' || !userLaundry.active) {
        return res.status(403).json({ error: `Esta lavandería está ${userLaundry?.status || 'inactiva'}.` });
      }
      const validity = computeLaundryValidity(userLaundry);
      if (validity.daysRemaining <= 0) {
        return res.status(403).json({ error: 'La vigencia del plan de esta lavandería ha expirado (0 días restantes).' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (token, user_id, active_laundry_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(token, user.id, user.is_superadmin ? null : user.laundry_id, expiresAt);

    const payload = buildAuthPayload(user);

    res.setHeader('Set-Cookie', `bc_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    res.json({ ...payload, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.setHeader('Set-Cookie', 'bc_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(buildAuthPayload(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/permissions-catalog', requireAuth, (req, res) => {
  res.json(PERMISSION_CATALOG);
});

// ----------------- ROLES & PERMISSIONS (SCOPED PER LAUNDRY) -----------------
app.get('/api/roles', requireAuth, requirePermission('manage_roles', 'manage_users'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*,
             (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.laundry_id = r.laundry_id) as users_count
      FROM roles r
      WHERE r.laundry_id = ?
      ORDER BY r.is_system DESC, r.name ASC
    `).all(req.laundryId);

    const roles = rows.map(r => ({
      ...r,
      permissions: parsePermissions(r.permissions)
    }));
    res.json(roles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', requireAuth, requirePermission('manage_roles'), (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const rawPerms = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const cleanPerms = Array.from(new Set(rawPerms.filter(p => ALL_PERMISSION_KEYS.includes(p))));

    if (!name) return res.status(400).json({ error: 'El nombre del rol es obligatorio.' });

    const resInsert = db.prepare(`
      INSERT INTO roles (laundry_id, name, description, permissions, is_system)
      VALUES (?, ?, ?, ?, 0)
    `).run(req.laundryId, name, description, JSON.stringify(cleanPerms));

    const created = db.prepare('SELECT *, 0 as users_count FROM roles WHERE id = ?').get(resInsert.lastInsertRowid);
    res.status(201).json({ ...created, permissions: cleanPerms });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe un rol con ese nombre en esta lavandería.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id', requireAuth, requirePermission('manage_roles'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM roles WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado.' });

    const name = String(req.body?.name ?? existing.name).trim();
    const description = String(req.body?.description ?? existing.description ?? '').trim();
    const rawPerms = Array.isArray(req.body?.permissions) ? req.body.permissions : parsePermissions(existing.permissions);
    const cleanPerms = Array.from(new Set(rawPerms.filter(p => ALL_PERMISSION_KEYS.includes(p))));

    if (!name) return res.status(400).json({ error: 'El nombre del rol es obligatorio.' });

    db.prepare(`
      UPDATE roles SET name = ?, description = ?, permissions = ?
      WHERE id = ? AND laundry_id = ?
    `).run(name, description, JSON.stringify(cleanPerms), req.params.id, req.laundryId);

    const updated = db.prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) as users_count
      FROM roles r WHERE r.id = ?
    `).get(req.params.id);
    res.json({ ...updated, permissions: cleanPerms });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe otro rol con ese nombre en esta lavandería.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/roles/:id', requireAuth, requirePermission('manage_roles'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM roles WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Rol no encontrado.' });
    if (existing.is_system) {
      return res.status(400).json({ error: 'El rol base Administrador no se puede eliminar (puedes editar sus permisos si deseas).' });
    }

    const assigned = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role_id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (assigned && assigned.cnt > 0) {
      return res.status(400).json({ error: `Este rol está asignado a ${assigned.cnt} usuario(s). Reasígnalos antes de eliminarlo.` });
    }

    db.prepare('DELETE FROM roles WHERE id = ? AND laundry_id = ?').run(req.params.id, req.laundryId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- USERS MANAGEMENT (SCOPED PER LAUNDRY) -----------------
app.get('/api/users', requireAuth, requirePermission('manage_users'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.laundry_id, u.role_id, u.username, u.full_name, u.email, u.is_superadmin, u.active, u.created_at,
             COALESCE(r.name, 'Sin rol') as role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.laundry_id = ? AND u.is_superadmin = 0
      ORDER BY u.active DESC, u.full_name ASC
    `).all(req.laundryId);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requirePermission('manage_users'), (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const full_name = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const role_id = req.body?.role_id ? parseInt(req.body.role_id, 10) : null;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;

    if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Usuario inválido (3 a 40 caracteres: letras, números, punto o guion).' });
    }
    if (!full_name) return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });

    // Enforce plan user limit if set
    const limitUsers = req.plan?.limit_users || 0;
    if (limitUsers > 0 && active) {
      const currentUsersCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE laundry_id = ? AND is_superadmin = 0 AND active = 1').get(req.laundryId).cnt;
      if (currentUsersCount >= limitUsers) {
        return res.status(400).json({
          error: `Tu plan "${req.plan.name}" permite máximo ${limitUsers} usuario(s) activos. Mejora tu plan para crear más cuentas.`
        });
      }
    }

    if (role_id) {
      const validRole = db.prepare('SELECT id FROM roles WHERE id = ? AND laundry_id = ?').get(role_id, req.laundryId);
      if (!validRole) return res.status(400).json({ error: 'El rol seleccionado no pertenece a esta lavandería.' });
    }

    const resIns = db.prepare(`
      INSERT INTO users (laundry_id, role_id, username, full_name, email, password_hash, is_superadmin, active)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(req.laundryId, role_id, username, full_name, email, hashPassword(password), active);

    const created = db.prepare(`
      SELECT u.id, u.laundry_id, u.role_id, u.username, u.full_name, u.email, u.is_superadmin, u.active, u.created_at,
             COALESCE(r.name, 'Sin rol') as role_name
      FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `).get(resIns.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso en el sistema.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', requireAuth, requirePermission('manage_users'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND laundry_id = ? AND is_superadmin = 0').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado en esta lavandería.' });

    const full_name = String(req.body?.full_name ?? existing.full_name).trim();
    const email = String(req.body?.email ?? existing.email ?? '').trim();
    const role_id = req.body?.role_id !== undefined ? (req.body.role_id ? parseInt(req.body.role_id, 10) : null) : existing.role_id;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
    const newPassword = String(req.body?.password || '');

    if (!full_name) return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    if (Number(req.params.id) === req.user.id && !active) {
      return res.status(400).json({ error: 'No puedes desactivar tu propio usuario.' });
    }
    if (role_id) {
      const validRole = db.prepare('SELECT id FROM roles WHERE id = ? AND laundry_id = ?').get(role_id, req.laundryId);
      if (!validRole) return res.status(400).json({ error: 'El rol seleccionado no pertenece a esta lavandería.' });
    }

    const password_hash = newPassword ? hashPassword(newPassword) : existing.password_hash;
    if (newPassword && newPassword.length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }

    db.prepare(`
      UPDATE users
      SET full_name = ?, email = ?, role_id = ?, active = ?, password_hash = ?
      WHERE id = ? AND laundry_id = ?
    `).run(full_name, email, role_id, active, password_hash, req.params.id, req.laundryId);

    const updated = db.prepare(`
      SELECT u.id, u.laundry_id, u.role_id, u.username, u.full_name, u.email, u.is_superadmin, u.active, u.created_at,
             COALESCE(r.name, 'Sin rol') as role_name
      FROM users u LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAuth, requirePermission('manage_users'), (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }
    const existing = db.prepare('SELECT id, username FROM users WHERE id = ? AND laundry_id = ? AND is_superadmin = 0').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado.' });

    db.prepare('DELETE FROM users WHERE id = ? AND laundry_id = ?').run(req.params.id, req.laundryId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SUPERADMIN: SAAS MANAGEMENT (ZERO PRIVATE TENANT SALES/CLIENT DATA) -----------------
function getSanitizedSaasLaundries() {
  const rows = db.prepare(`
    SELECT l.id, l.name, l.slogan, l.address, l.phone, l.email, l.instagram, l.rut,
           l.active, l.plan_id, l.status, l.last_payment_date, l.paid_until,
           l.trial_enabled, l.trial_ends_at, l.grace_until, l.grace_days_total, l.created_at,
           p.name as plan_name, p.price as plan_price, p.limit_users as plan_limit_users, p.limit_services as plan_limit_services,
           (SELECT COUNT(*) FROM users u WHERE u.laundry_id = l.id AND u.is_superadmin = 0 AND u.active = 1) as users_count,
           (SELECT COUNT(*) FROM services s WHERE s.laundry_id = l.id AND s.active = 1) as services_count
    FROM laundries l
    LEFT JOIN plans p ON p.id = l.plan_id
    ORDER BY l.id ASC
  `).all();

  return rows.map(row => {
    const validity = computeLaundryValidity(row);
    const adminUser = db.prepare(`
      SELECT u.id, u.username, u.full_name, u.email
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.laundry_id = ? AND u.is_superadmin = 0 AND LOWER(COALESCE(r.name, '')) = 'administrador'
      ORDER BY u.id ASC LIMIT 1
    `).get(row.id);

    return {
      ...row,
      ...validity,
      admin_username: adminUser?.username || '',
      admin_full_name: adminUser?.full_name || '',
      admin_email: adminUser?.email || ''
    };
  });
}

app.get('/api/saas/dashboard', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const laundries = getSanitizedSaasLaundries();
    const plans = db.prepare('SELECT * FROM plans ORDER BY price ASC, id ASC').all().map(buildPlanObject);

    const activeLaundries = laundries.filter(l => l.status === 'Activo');
    const deactivatedCount = laundries.filter(l => l.status === 'Dado de Baja').length;

    let mrr = 0;
    for (const l of activeLaundries) {
      const p = plans.find(pl => Number(pl.id) === Number(l.plan_id));
      if (p) mrr += p.price;
    }
    const arr = mrr * 12;
    const arpu = activeLaundries.length > 0 ? Math.round(mrr / activeLaundries.length) : 0;

    const totalStaffAccounts = laundries.reduce((acc, l) => acc + (l.users_count || 0), 0);
    const totalCatalogItems = laundries.reduce((acc, l) => acc + (l.services_count || 0), 0);

    const expiringSoon = activeLaundries.filter(l => l.daysRemaining <= 5);
    const upgradeCandidates = activeLaundries.filter(l => {
      const p = plans.find(pl => Number(pl.id) === Number(l.plan_id));
      if (!p) return false;
      const nearUsers = p.limit_users > 0 && (l.users_count / p.limit_users) >= 0.8;
      const nearServices = p.limit_services > 0 && (l.services_count / p.limit_services) >= 0.8;
      return nearUsers || nearServices;
    });

    res.json({
      laundries,
      plans,
      summary: {
        totalLaundries: laundries.length,
        activeLaundries: activeLaundries.length,
        inactiveLaundries: laundries.length - activeLaundries.length,
        deactivatedCount,
        mrr,
        arr,
        arpu,
        totalStaffAccounts,
        avgStaffPerLaundry: laundries.length > 0 ? Number((totalStaffAccounts / laundries.length).toFixed(1)) : 0,
        totalCatalogItems
      },
      expiringSoon,
      upgradeCandidates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/laundries', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const laundries = getSanitizedSaasLaundries();
    res.json({ laundries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/laundries', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const {
      name,
      slogan,
      address,
      phone,
      email,
      instagram,
      rut,
      plan_id,
      last_payment_date,
      trial_enabled,
      admin_username,
      admin_password,
      admin_full_name,
      admin_email
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la lavandería es obligatorio.' });
    }

    const resolvedPlanId = parseInt(plan_id, 10) || 1;
    const validPlan = db.prepare('SELECT id, name FROM plans WHERE id = ?').get(resolvedPlanId);
    if (!validPlan) {
      return res.status(400).json({ error: 'El plan seleccionado no existe.' });
    }

    const hasAdminInit = Boolean(admin_username && admin_username.trim());
    const cleanAdminUser = hasAdminInit ? admin_username.trim().toLowerCase() : '';
    if (hasAdminInit) {
      if (!/^[a-z0-9._-]{3,40}$/.test(cleanAdminUser)) {
        return res.status(400).json({ error: 'Usuario administrador inicial inválido (3 a 40 caracteres sin espacios).' });
      }
      if (!admin_password || admin_password.length < 4) {
        return res.status(400).json({ error: 'La contraseña del administrador inicial debe tener al menos 4 caracteres.' });
      }
    }

    const payDateStr = last_payment_date && String(last_payment_date).trim()
      ? String(last_payment_date).trim().slice(0, 10)
      : getLocalDateStr();
    const paidUntilIso = new Date(new Date(`${payDateStr}T12:00:00`).getTime() + 30 * 86400000).toISOString();
    const isTrial = Boolean(trial_enabled);
    const trialEndsIso = isTrial ? new Date(Date.now() + 14 * 86400000).toISOString() : null;

    db.exec('BEGIN IMMEDIATE');
    try {
      const insertLaundry = db.prepare(`
        INSERT INTO laundries (
          name, slogan, address, phone, instagram, email, rut, next_folio, terms,
          active, status, plan_id, last_payment_date, paid_until, trial_enabled, trial_ends_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 'Activo', ?, ?, ?, ?, ?)
      `).run(
        name.trim(),
        (slogan || 'Lavado de Alta Energía').trim(),
        (address || '').trim(),
        (phone || '').trim(),
        (instagram || '').trim(),
        (email || '').trim(),
        normalizeRut(rut),
        DEFAULT_TERMS,
        resolvedPlanId,
        payDateStr,
        paidUntilIso,
        isTrial ? 1 : 0,
        trialEndsIso
      );

      const newLaundryId = Number(insertLaundry.lastInsertRowid);
      seedServicesForLaundry(newLaundryId);
      const seededRoles = seedDefaultRolesForLaundry(newLaundryId);

      if (hasAdminInit) {
        const adminRole = seededRoles.find(r => r.name === 'Administrador');
        db.prepare(`
          INSERT INTO users (laundry_id, role_id, username, full_name, email, password_hash, is_superadmin, active)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `).run(
          newLaundryId,
          adminRole ? adminRole.id : null,
          cleanAdminUser,
          (admin_full_name || `Admin ${name.trim()}`).trim(),
          (admin_email || email || '').trim(),
          hashPassword(admin_password)
        );
      }

      logSaasAudit({
        userId: req.user.id,
        userName: req.user.full_name,
        laundryId: newLaundryId,
        laundryName: name.trim(),
        actionType: 'CREATE',
        entityType: 'Laundry',
        entityId: newLaundryId,
        details: { name: name.trim(), rut: normalizeRut(rut), plan: validPlan.name, trial: isTrial }
      });

      db.exec('COMMIT');
      const created = getSanitizedSaasLaundries().find(l => l.id === newLaundryId);
      res.status(201).json(created);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'El usuario administrador inicial ya existe. Elige otro nombre de usuario.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/laundries/:id', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM laundries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lavandería no encontrada.' });

    const {
      name, slogan, address, phone, email, instagram, rut,
      plan_id, last_payment_date, trial_enabled,
      admin_email, admin_password, admin_full_name
    } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre de la lavandería no puede estar vacío.' });
    }

    const nextPlanId = plan_id !== undefined ? (parseInt(plan_id, 10) || existing.plan_id) : existing.plan_id;
    const nextPayDate = last_payment_date !== undefined
      ? (String(last_payment_date || '').trim().slice(0, 10) || existing.last_payment_date)
      : existing.last_payment_date;
    let nextPaidUntil = existing.paid_until;
    if (last_payment_date !== undefined && nextPayDate && nextPayDate !== existing.last_payment_date) {
      nextPaidUntil = new Date(new Date(`${nextPayDate}T12:00:00`).getTime() + 30 * 86400000).toISOString();
    }

    const nextTrialEnabled = trial_enabled !== undefined ? (trial_enabled ? 1 : 0) : existing.trial_enabled;
    let nextTrialEnds = existing.trial_ends_at;
    if (trial_enabled && !existing.trial_ends_at) {
      nextTrialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
    } else if (trial_enabled === false) {
      nextTrialEnds = null;
    }

    db.prepare(`
      UPDATE laundries
      SET name = ?, slogan = ?, address = ?, phone = ?, email = ?, instagram = ?, rut = ?,
          plan_id = ?, last_payment_date = ?, paid_until = ?, trial_enabled = ?, trial_ends_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : existing.name,
      slogan !== undefined ? String(slogan).trim() : existing.slogan,
      address !== undefined ? String(address).trim() : existing.address,
      phone !== undefined ? String(phone).trim() : existing.phone,
      email !== undefined ? String(email).trim() : existing.email,
      instagram !== undefined ? String(instagram).trim() : existing.instagram,
      rut !== undefined ? normalizeRut(rut) : existing.rut,
      nextPlanId,
      nextPayDate,
      nextPaidUntil,
      nextTrialEnabled,
      nextTrialEnds,
      req.params.id
    );

    // Optional update of that laundry's main Admin email/password (matching Kajero SuperAdmin)
    if (admin_email !== undefined || admin_password || admin_full_name !== undefined) {
      const adminUser = db.prepare(`
        SELECT u.* FROM users u LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.laundry_id = ? AND u.is_superadmin = 0 AND LOWER(COALESCE(r.name, '')) = 'administrador'
        ORDER BY u.id ASC LIMIT 1
      `).get(req.params.id);

      if (adminUser) {
        if (admin_password && String(admin_password).length < 4) {
          return res.status(400).json({ error: 'La nueva contraseña del administrador debe tener al menos 4 caracteres.' });
        }
        db.prepare(`
          UPDATE users SET email = ?, full_name = ?, password_hash = ? WHERE id = ?
        `).run(
          admin_email !== undefined ? String(admin_email).trim() : adminUser.email,
          admin_full_name !== undefined && String(admin_full_name).trim() ? String(admin_full_name).trim() : adminUser.full_name,
          admin_password ? hashPassword(admin_password) : adminUser.password_hash,
          adminUser.id
        );
      }
    }

    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      laundryId: existing.id,
      laundryName: name !== undefined ? String(name).trim() : existing.name,
      actionType: 'UPDATE',
      entityType: 'Laundry',
      entityId: existing.id,
      details: { plan_id: nextPlanId, last_payment_date: nextPayDate, trial_enabled: Boolean(nextTrialEnabled) }
    });

    const updated = getSanitizedSaasLaundries().find(l => Number(l.id) === Number(req.params.id));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/saas/laundries/:id/status', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM laundries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lavandería no encontrada.' });

    const allowedStatuses = ['Activo', 'Suspendido', 'Dado de Baja'];
    const nextStatus = String(req.body?.status || '').trim();
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const nextActive = nextStatus === 'Activo' ? 1 : 0;
    db.prepare('UPDATE laundries SET status = ?, active = ? WHERE id = ?').run(nextStatus, nextActive, req.params.id);

    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      laundryId: existing.id,
      laundryName: existing.name,
      actionType: 'UPDATE',
      entityType: 'Laundry',
      entityId: existing.id,
      details: { previousStatus: existing.status, newStatus: nextStatus }
    });

    res.json({ success: true, status: nextStatus, active: nextActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/laundries/:id/grace-history', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM grace_grants WHERE laundry_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/laundries/:id/grace', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM laundries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lavandería no encontrada.' });

    const days = parseInt(req.body?.days, 10);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      return res.status(400).json({ error: 'Ingresa un número entero entre 1 y 90 días.' });
    }
    if (reason.length < 5) {
      return res.status(400).json({ error: 'Indica el motivo de la compensación (mínimo 5 caracteres).' });
    }

    const validity = computeLaundryValidity(existing);
    const baseMs = validity.validUntil ? Math.max(Date.now(), new Date(validity.validUntil).getTime()) : Date.now();
    const newValidUntil = new Date(baseMs + days * 86400000).toISOString();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        UPDATE laundries
        SET grace_until = ?, grace_days_total = COALESCE(grace_days_total, 0) + ?, status = 'Activo', active = 1
        WHERE id = ?
      `).run(newValidUntil, days, existing.id);

      db.prepare(`
        INSERT INTO grace_grants (laundry_id, days, reason, previous_valid_until, new_valid_until, granted_by_user_id, granted_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(existing.id, days, reason, validity.validUntil, newValidUntil, req.user.id, req.user.full_name);

      logSaasAudit({
        userId: req.user.id,
        userName: req.user.full_name,
        laundryId: existing.id,
        laundryName: existing.name,
        actionType: 'GRACE',
        entityType: 'Laundry',
        entityId: existing.id,
        details: { days, reason, newValidUntil }
      });

      db.exec('COMMIT');
      res.json({ success: true, newValidUntil, laundry: getSanitizedSaasLaundries().find(l => l.id === existing.id) });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/laundries/:id', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM laundries WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lavandería no encontrada.' });

    const password = String(req.body?.password || '');
    const superUserRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!password || !verifyPassword(password, superUserRow?.password_hash)) {
      return res.status(401).json({ error: 'Contraseña de Super Administrador incorrecta.' });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE laundry_id = ?)').run(existing.id);
      db.prepare('DELETE FROM orders WHERE laundry_id = ?').run(existing.id);
      db.prepare('DELETE FROM clients WHERE laundry_id = ?').run(existing.id);
      db.prepare('DELETE FROM services WHERE laundry_id = ?').run(existing.id);
      db.prepare('DELETE FROM expenses WHERE laundry_id = ?').run(existing.id);
      db.prepare('DELETE FROM users WHERE laundry_id = ? AND is_superadmin = 0').run(existing.id);
      db.prepare('DELETE FROM roles WHERE laundry_id = ?').run(existing.id);
      db.prepare('DELETE FROM laundries WHERE id = ?').run(existing.id);

      logSaasAudit({
        userId: req.user.id,
        userName: req.user.full_name,
        laundryId: null,
        laundryName: existing.name,
        actionType: 'DELETE',
        entityType: 'Laundry',
        entityId: existing.id,
        details: { deletedName: existing.name, rut: existing.rut }
      });

      db.exec('COMMIT');
      res.json({ success: true });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SUPERADMIN: PLANS, SAAS ADMINS, AUDIT LOGS & AGREEMENTS -----------------
app.get('/api/saas/plans', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM plans ORDER BY price ASC, id ASC').all().map(buildPlanObject);
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/plans', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const price = Number(req.body?.price) || 0;
    const limit_users = Math.max(0, parseInt(req.body?.limit_users, 10) || 0);
    const limit_services = Math.max(0, parseInt(req.body?.limit_services, 10) || 0);
    const description = String(req.body?.description || '').trim();
    const allowed_menus = Array.isArray(req.body?.allowed_menus) ? req.body.allowed_menus : [];
    const features = req.body?.features || {};
    const support_level = String(req.body?.support_level || 'normal');

    if (!name) return res.status(400).json({ error: 'El nombre del plan es obligatorio.' });

    const resIns = db.prepare(`
      INSERT INTO plans (name, price, limit_users, limit_services, description, allowed_menus, features, support_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, price, limit_users, limit_services, description, JSON.stringify(allowed_menus), JSON.stringify(features), support_level);

    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      actionType: 'CREATE',
      entityType: 'Plan',
      entityId: resIns.lastInsertRowid,
      details: { name, price, limit_users, limit_services }
    });

    const created = db.prepare('SELECT * FROM plans WHERE id = ?').get(resIns.lastInsertRowid);
    res.status(201).json(buildPlanObject(created));
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe un plan con ese nombre.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/plans/:id', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Plan no encontrado.' });

    const name = String(req.body?.name ?? existing.name).trim();
    const price = req.body?.price !== undefined ? Number(req.body.price) || 0 : existing.price;
    const limit_users = req.body?.limit_users !== undefined ? Math.max(0, parseInt(req.body.limit_users, 10) || 0) : existing.limit_users;
    const limit_services = req.body?.limit_services !== undefined ? Math.max(0, parseInt(req.body.limit_services, 10) || 0) : existing.limit_services;
    const description = String(req.body?.description ?? existing.description ?? '').trim();
    const allowed_menus = Array.isArray(req.body?.allowed_menus) ? JSON.stringify(req.body.allowed_menus) : existing.allowed_menus;
    const features = req.body?.features !== undefined ? JSON.stringify(req.body.features) : existing.features;
    const support_level = String(req.body?.support_level ?? existing.support_level ?? 'normal');

    if (!name) return res.status(400).json({ error: 'El nombre del plan es obligatorio.' });

    db.prepare(`
      UPDATE plans
      SET name = ?, price = ?, limit_users = ?, limit_services = ?, description = ?, allowed_menus = ?, features = ?, support_level = ?
      WHERE id = ?
    `).run(name, price, limit_users, limit_services, description, allowed_menus, features, support_level, req.params.id);

    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      actionType: 'UPDATE',
      entityType: 'Plan',
      entityId: req.params.id,
      details: { name, price, limit_users, limit_services }
    });

    const updated = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
    res.json(buildPlanObject(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/saas/plans/:id', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Plan no encontrado.' });
    const inUse = db.prepare('SELECT COUNT(*) as cnt FROM laundries WHERE plan_id = ?').get(req.params.id).cnt;
    if (inUse > 0) {
      return res.status(400).json({ error: `Este plan está asignado a ${inUse} lavandería(s). Reasígnalas antes de eliminarlo.` });
    }
    db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      actionType: 'DELETE',
      entityType: 'Plan',
      entityId: req.params.id,
      details: { name: existing.name }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/admins', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const admins = db.prepare(`
      SELECT id, username, full_name, email, active, created_at
      FROM users
      WHERE is_superadmin = 1
      ORDER BY id ASC
    `).all();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/admins', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const full_name = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Usuario inválido (3 a 40 caracteres).' });
    }
    if (!full_name) return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });

    const resIns = db.prepare(`
      INSERT INTO users (laundry_id, role_id, username, full_name, email, password_hash, is_superadmin, active)
      VALUES (NULL, NULL, ?, ?, ?, ?, 1, 1)
    `).run(username, full_name, email, hashPassword(password));

    logSaasAudit({
      userId: req.user.id,
      userName: req.user.full_name,
      actionType: 'CREATE',
      entityType: 'SuperAdmin',
      entityId: resIns.lastInsertRowid,
      details: { username, full_name }
    });

    const created = db.prepare('SELECT id, username, full_name, email, active, created_at FROM users WHERE id = ?').get(resIns.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ese usuario ya existe.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/saas/admins/:id', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND is_superadmin = 1').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Super Administrador no encontrado.' });

    const full_name = String(req.body?.full_name ?? existing.full_name).trim();
    const email = String(req.body?.email ?? existing.email ?? '').trim();
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
    const password = String(req.body?.password || '');

    if (Number(req.params.id) === req.user.id && !active) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    if (password && password.length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' });
    }

    db.prepare(`
      UPDATE users SET full_name = ?, email = ?, active = ?, password_hash = ?
      WHERE id = ? AND is_superadmin = 1
    `).run(full_name, email, active, password ? hashPassword(password) : existing.password_hash, req.params.id);

    const updated = db.prepare('SELECT id, username, full_name, email, active, created_at FROM users WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/audit-logs', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM saas_audit_logs ORDER BY id DESC LIMIT 200').all();
    res.json(rows.map(r => {
      let details = {};
      try { details = JSON.parse(r.details || '{}'); } catch (e) {}
      return { ...r, details };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/saas/agreements', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM legal_agreements ORDER BY id DESC').all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/saas/agreements', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const version = String(req.body?.version || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title || !version || !content) {
      return res.status(400).json({ error: 'Título, versión y contenido son obligatorios.' });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE legal_agreements SET active = 0').run();
      const ins = db.prepare(`
        INSERT INTO legal_agreements (title, version, content, active, published_by)
        VALUES (?, ?, ?, 1, ?)
      `).run(title, version, content, req.user.full_name);
      logSaasAudit({
        userId: req.user.id,
        userName: req.user.full_name,
        actionType: 'CREATE',
        entityType: 'Agreement',
        entityId: ins.lastInsertRowid,
        details: { title, version }
      });
      db.exec('COMMIT');
      res.status(201).json(db.prepare('SELECT * FROM legal_agreements WHERE id = ?').get(ins.lastInsertRowid));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SUPPORT TICKETS (SAAS & TENANT ADMINS) -----------------
app.get('/api/support/tickets', requireAuth, (req, res) => {
  try {
    if (!req.user.is_superadmin && !req.permissions.has('manage_users')) {
      return res.status(403).json({ error: 'El módulo de soporte está disponible para el administrador de tu lavandería.' });
    }
    const tickets = req.user.is_superadmin
      ? db.prepare('SELECT * FROM support_tickets ORDER BY updated_at DESC, id DESC LIMIT 100').all()
      : db.prepare('SELECT * FROM support_tickets WHERE laundry_id = ? ORDER BY updated_at DESC, id DESC LIMIT 100').all(req.laundryId);

    const summary = {
      total: tickets.length,
      pending: tickets.filter(t => t.status === 'PENDING').length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
      resolved: tickets.filter(t => t.status === 'RESOLVED').length,
      unread: req.user.is_superadmin
        ? tickets.filter(t => t.unread_by_superadmin).length
        : tickets.filter(t => t.unread_by_tenant).length
    };
    res.json({ tickets, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/support/tickets/:id', requireAuth, (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!req.user.is_superadmin && (Number(ticket.laundry_id) !== Number(req.laundryId) || !req.permissions.has('manage_users'))) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket.' });
    }

    if (req.user.is_superadmin && ticket.unread_by_superadmin) {
      db.prepare('UPDATE support_tickets SET unread_by_superadmin = 0 WHERE id = ?').run(ticket.id);
      ticket.unread_by_superadmin = 0;
    } else if (!req.user.is_superadmin && ticket.unread_by_tenant) {
      db.prepare('UPDATE support_tickets SET unread_by_tenant = 0 WHERE id = ?').run(ticket.id);
      ticket.unread_by_tenant = 0;
    }

    const messages = db.prepare('SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id ASC').all(ticket.id);
    res.json({ ticket, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/support/tickets', requireAuth, requireTenantOnly, requirePermission('manage_users'), (req, res) => {
  try {
    const subject = String(req.body?.subject || '').trim();
    const category = String(req.body?.category || 'ASSISTANCE');
    const priority = String(req.body?.priority || 'NORMAL');
    const message = String(req.body?.message || '').trim();
    if (!subject || !message) return res.status(400).json({ error: 'Asunto y mensaje son obligatorios.' });

    db.exec('BEGIN IMMEDIATE');
    try {
      const insT = db.prepare(`
        INSERT INTO support_tickets (laundry_id, laundry_name, created_by_user_id, created_by_name, subject, category, priority, status, unread_by_superadmin, unread_by_tenant)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 1, 0)
      `).run(req.laundryId, req.laundry.name, req.user.id, req.user.full_name, subject, category, priority);

      db.prepare(`
        INSERT INTO support_messages (ticket_id, sender_user_id, sender_name, sender_role, message)
        VALUES (?, ?, ?, 'TENANT', ?)
      `).run(insT.lastInsertRowid, req.user.id, req.user.full_name, message);

      db.exec('COMMIT');
      res.status(201).json(db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(insT.lastInsertRowid));
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/support/tickets/:id/messages', requireAuth, (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!req.user.is_superadmin && (Number(ticket.laundry_id) !== Number(req.laundryId) || !req.permissions.has('manage_users'))) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket.' });
    }

    const message = String(req.body?.message || '').trim();
    const nextStatus = req.user.is_superadmin && req.body?.status ? req.body.status : ticket.status;
    if (!message) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });

    const senderRole = req.user.is_superadmin ? 'SUPER_ADMIN' : 'TENANT';
    db.prepare(`
      INSERT INTO support_messages (ticket_id, sender_user_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(ticket.id, req.user.id, req.user.full_name, senderRole, message);

    db.prepare(`
      UPDATE support_tickets
      SET status = ?,
          unread_by_superadmin = ?,
          unread_by_tenant = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextStatus, req.user.is_superadmin ? 0 : 1, req.user.is_superadmin ? 1 : 0, ticket.id);

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/support/tickets/:id/status', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!['PENDING', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Estado de ticket inválido.' });
    }
    db.prepare('UPDATE support_tickets SET status = ?, unread_by_tenant = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CONFIG ENDPOINTS (TENANT ONLY) -----------------
app.get('/api/config', requireAuth, requireTenantOnly, (req, res) => {
  try {
    const config = getConfig(req.laundryId);
    const nextFolio = getNextFolio(req.laundryId);
    res.json({ ...config, nextFolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', requireAuth, requireTenantOnly, requirePermission('view_settings'), (req, res) => {
  try {
    const body = req.body || {};
    if (body.name !== undefined && !String(body.name).trim()) {
      return res.status(400).json({ error: 'El nombre de la lavandería es obligatorio.' });
    }
    if (body.logo_url !== undefined && body.logo_url !== '') {
      const logoStr = String(body.logo_url);
      const isValidDataImg = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(logoStr);
      const isValidAssetPath = logoStr.startsWith('/assets/');
      if (!isValidDataImg && !isValidAssetPath) {
        return res.status(400).json({ error: 'Formato de logo no válido. Sube una imagen PNG, JPG, WEBP o GIF.' });
      }
      if (logoStr.length > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'El logo excede el tamaño máximo permitido (2 MB).' });
      }
    }

    const cleanPayload = {
      ...body,
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      slogan: body.slogan !== undefined ? String(body.slogan).trim() : undefined,
      address: body.address !== undefined ? String(body.address).trim() : undefined,
      phone: body.phone !== undefined ? String(body.phone).trim() : undefined,
      instagram: body.instagram !== undefined ? String(body.instagram).trim() : undefined,
      email: body.email !== undefined ? String(body.email).trim() : undefined,
      rut: body.rut !== undefined ? normalizeRut(body.rut) : undefined,
      terms: body.terms !== undefined ? String(body.terms) : undefined,
      logo_url: body.logo_url !== undefined ? String(body.logo_url) : undefined
    };

    const updated = updateConfig(req.laundryId, cleanPayload);
    res.json({ ...updated, nextFolio: getNextFolio(req.laundryId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/network-info', requireAuth, (req, res) => {
  const ips = getLocalIpAddresses();
  res.json({
    port: PORT,
    ips,
    localUrl: `http://localhost:${PORT}`,
    mobileUrls: ips.map(i => `http://${i.ip}:${PORT}`)
  });
});

// ----------------- SERVICES ENDPOINTS (TENANT ONLY) -----------------
app.get('/api/services', requireAuth, requireTenantOnly, requirePermission('view_catalog', 'view_reception', 'create_orders'), (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services WHERE laundry_id = ? AND active = 1 ORDER BY display_order ASC, name ASC').all(req.laundryId);
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', requireAuth, requireTenantOnly, requirePermission('manage_catalog'), (req, res) => {
  try {
    const { name, category, default_price } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const limitServices = req.plan?.limit_services || 0;
    if (limitServices > 0) {
      const srvCount = db.prepare('SELECT COUNT(*) as cnt FROM services WHERE laundry_id = ? AND active = 1').get(req.laundryId).cnt;
      if (srvCount >= limitServices) {
        return res.status(400).json({
          error: `Tu plan "${req.plan.name}" permite máximo ${limitServices} prendas/servicios en el catálogo.`
        });
      }
    }

    const maxOrderRow = db.prepare('SELECT MAX(display_order) as m FROM services WHERE laundry_id = ?').get(req.laundryId);
    const nextOrder = (maxOrderRow?.m || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO services (laundry_id, name, category, default_price, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(req.laundryId, name.trim(), category ? category.trim() : 'Otros', parseFloat(default_price) || 0, nextOrder);
    const created = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe una prenda con ese nombre en el catálogo.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/services/:id', requireAuth, requirePermission('manage_catalog'), (req, res) => {
  try {
    const { name, category, default_price, active } = req.body;
    const existing = db.prepare('SELECT * FROM services WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Servicio no encontrado' });

    db.prepare(`
      UPDATE services
      SET name = COALESCE(?, name),
          category = COALESCE(?, category),
          default_price = COALESCE(?, default_price),
          active = COALESCE(?, active)
      WHERE id = ? AND laundry_id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      category !== undefined ? category.trim() : existing.category,
      default_price !== undefined ? parseFloat(default_price) : existing.default_price,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id,
      req.laundryId
    );

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe otra prenda con ese nombre en el catálogo.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/services/:id', requireAuth, requirePermission('manage_catalog'), (req, res) => {
  try {
    const service = db.prepare('SELECT id, name FROM services WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

    db.prepare('DELETE FROM services WHERE id = ? AND laundry_id = ?').run(req.params.id, req.laundryId);
    res.json({ success: true, message: `Prenda "${service.name}" eliminada del catálogo.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CLIENTS ENDPOINTS -----------------
app.get('/api/clients', requireAuth, requirePermission('view_clients', 'view_reception', 'create_orders'), (req, res) => {
  try {
    const rawQ = req.query.q ? req.query.q.trim() : '';
    const search = rawQ ? `%${rawQ}%` : null;
    const rutSearch = rawQ ? `%${normalizeRut(rawQ)}%` : null;
    let query = `
      SELECT c.*,
             (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id AND o.laundry_id = c.laundry_id) as orders_count
      FROM clients c
      WHERE c.laundry_id = ?
    `;
    const params = [req.laundryId];

    if (search) {
      query += " AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.address LIKE ? OR REPLACE(COALESCE(c.rut, ''), '.', '') LIKE ?)";
      params.push(search, search, search, search, rutSearch || search);
    }
    query += ' ORDER BY c.name ASC LIMIT 100';

    const clients = db.prepare(query).all(...params);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', requireAuth, requirePermission('manage_clients'), (req, res) => {
  try {
    const { name, phone, email, address, rut, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const cleanRut = normalizeRut(rut);
    const stmt = db.prepare(`
      INSERT INTO clients (laundry_id, name, phone, email, address, rut, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.laundryId,
      name.trim(),
      (phone || '').trim(),
      (email || '').trim(),
      (address || '').trim(),
      cleanRut,
      (notes || '').trim()
    );

    const newClient = db.prepare('SELECT c.*, 0 as orders_count FROM clients c WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', requireAuth, requirePermission('manage_clients'), (req, res) => {
  try {
    const { name, phone, email, address, rut, notes } = req.body;
    const clientId = req.params.id;

    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const existing = db.prepare('SELECT id FROM clients WHERE id = ? AND laundry_id = ?').get(clientId, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

    const cleanRut = normalizeRut(rut);
    db.prepare(`
      UPDATE clients
      SET name = ?, phone = ?, email = ?, address = ?, rut = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND laundry_id = ?
    `).run(
      name.trim(),
      (phone || '').trim(),
      (email || '').trim(),
      (address || '').trim(),
      cleanRut,
      (notes || '').trim(),
      clientId,
      req.laundryId
    );

    db.prepare(`
      UPDATE orders
      SET client_name = ?, client_phone = ?, client_address = ?, client_rut = ?
      WHERE client_id = ? AND laundry_id = ?
    `).run(name.trim(), (phone || '').trim(), (address || '').trim(), cleanRut, clientId, req.laundryId);

    const updated = db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as orders_count
      FROM clients c WHERE c.id = ?
    `).get(clientId);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clients/:id', requireAuth, requirePermission('manage_clients'), (req, res) => {
  try {
    const clientId = req.params.id;
    const client = db.prepare('SELECT id, name FROM clients WHERE id = ? AND laundry_id = ?').get(clientId, req.laundryId);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const orderCountRow = db.prepare('SELECT COUNT(*) as count FROM orders WHERE client_id = ? AND laundry_id = ?').get(clientId, req.laundryId);
    const orderCount = orderCountRow ? orderCountRow.count : 0;

    db.prepare('DELETE FROM clients WHERE id = ? AND laundry_id = ?').run(clientId, req.laundryId);

    res.json({
      success: true,
      message: `Cliente "${client.name}" eliminado correctamente.`,
      ordersUpdated: orderCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', requireAuth, requirePermission('view_clients'), (req, res) => {
  try {
    const client = db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as orders_count
      FROM clients c WHERE c.id = ? AND c.laundry_id = ?
    `).get(req.params.id, req.laundryId);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const orders = db.prepare('SELECT * FROM orders WHERE client_id = ? AND laundry_id = ? ORDER BY id DESC').all(req.params.id, req.laundryId);
    res.json({ ...client, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- ORDERS ENDPOINTS -----------------
app.get('/api/orders', requireAuth, requirePermission('view_orders', 'view_reports'), (req, res) => {
  try {
    const { status, search, from, to, paymentMethod, limit, page, paginated } = req.query;
    let whereSql = ' FROM orders WHERE laundry_id = ?';
    const params = [req.laundryId];

    if (status === 'PROXIMAS') {
      const twoDaysAhead = getLocalDateStr(new Date(Date.now() + 2 * 86400000));
      whereSql += " AND status NOT IN ('ENTREGADO', 'CANCELADO') AND delivery_date <= ?";
      params.push(twoDaysAhead);
    } else if (status && status !== 'TODOS') {
      whereSql += ' AND status = ?';
      params.push(status);
    }

    if (paymentMethod && paymentMethod !== 'TODOS') {
      whereSql += ' AND payment_method = ?';
      params.push(paymentMethod);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      const rutTerm = `%${normalizeRut(search)}%`;
      whereSql += " AND (folio LIKE ? OR client_name LIKE ? OR client_phone LIKE ? OR REPLACE(COALESCE(client_rut, ''), '.', '') LIKE ?)";
      params.push(term, term, term, rutTerm || term);
    }

    if (from) {
      whereSql += ' AND reception_date >= ?';
      params.push(from);
    }

    if (to) {
      whereSql += ' AND reception_date <= ?';
      params.push(to);
    }

    const totalRow = db.prepare(`SELECT COUNT(*) as total${whereSql}`).get(...params);
    const total = totalRow ? totalRow.total : 0;

    const orderClause = (status === 'PROXIMAS') ? ' ORDER BY delivery_date ASC, id ASC' : ' ORDER BY id DESC';

    let limitClause = '';
    const limitParams = [];
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    let resolvedLimit = null;

    if (limit === 'ALL' || limit === '0') {
      limitClause = '';
      resolvedLimit = total || 0;
    } else {
      const parsedLimit = parseInt(limit, 10);
      resolvedLimit = (parsedLimit > 0) ? Math.min(parsedLimit, 2000) : (paginated === '1' ? 15 : 100);
      const offset = (currentPage - 1) * resolvedLimit;
      limitClause = ' LIMIT ? OFFSET ?';
      limitParams.push(resolvedLimit, offset);
    }

    const orders = db.prepare(`SELECT *${whereSql}${orderClause}${limitClause}`).all(...params, ...limitParams);

    const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const enrichedOrders = orders.map(order => {
      const items = getItems.all(order.id);
      let specialServices = [];
      try {
        specialServices = JSON.parse(order.special_services || '[]');
      } catch (e) {
        specialServices = [];
      }
      return {
        ...order,
        items,
        special_services: specialServices
      };
    });

    if (paginated === '1') {
      const totalPages = (limit === 'ALL' || limit === '0' || !resolvedLimit) ? 1 : Math.max(1, Math.ceil(total / resolvedLimit));
      return res.json({
        orders: enrichedOrders,
        total,
        page: Math.min(currentPage, totalPages),
        limit: resolvedLimit,
        totalPages
      });
    }

    res.json(enrichedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', requireAuth, requirePermission('view_orders', 'create_orders', 'view_reports'), (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE (id = ? OR folio = ?) AND laundry_id = ?').get(req.params.id, req.params.id, req.laundryId);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    let specialServices = [];
    try {
      specialServices = JSON.parse(order.special_services || '[]');
    } catch (e) {
      specialServices = [];
    }

    res.json({
      ...order,
      items,
      special_services: specialServices,
      business_config: getConfig(req.laundryId)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', requireAuth, requirePermission('create_orders'), (req, res) => {
  try {
    const {
      client_name,
      client_rut,
      client_phone,
      client_address,
      reception_date,
      delivery_date,
      exit_date,
      document_type,
      payment_status,
      payment_method,
      paid_amount,
      special_services,
      observations,
      items,
      custom_folio
    } = req.body;

    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Debe agregar al menos un servicio o prenda al pedido' });
    }

    const cleanRut = normalizeRut(client_rut);

    // 1. Find or create client within same laundry
    let clientId = null;
    let client = null;
    if (cleanRut) {
      client = db.prepare("SELECT id FROM clients WHERE laundry_id = ? AND REPLACE(COALESCE(rut, ''), '.', '') = ?").get(req.laundryId, cleanRut);
    }
    if (!client && client_phone && client_phone.trim()) {
      client = db.prepare('SELECT id FROM clients WHERE laundry_id = ? AND phone = ?').get(req.laundryId, client_phone.trim());
    }
    if (!client && client_name) {
      client = db.prepare('SELECT id FROM clients WHERE laundry_id = ? AND LOWER(name) = LOWER(?)').get(req.laundryId, client_name.trim());
    }

    if (client) {
      clientId = client.id;
      db.prepare(`
        UPDATE clients
        SET address = COALESCE(NULLIF(?, ''), address),
            phone = COALESCE(NULLIF(?, ''), phone),
            rut = COALESCE(NULLIF(?, ''), rut),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND laundry_id = ?
      `).run((client_address || '').trim(), (client_phone || '').trim(), cleanRut, clientId, req.laundryId);
    } else {
      const insClient = db.prepare(`
        INSERT INTO clients (laundry_id, name, phone, address, rut)
        VALUES (?, ?, ?, ?, ?)
      `);
      const clientRes = insClient.run(req.laundryId, client_name.trim(), (client_phone || '').trim(), (client_address || '').trim(), cleanRut);
      clientId = clientRes.lastInsertRowid;
    }

    // 2. Generate Folio for active laundry
    let folio = custom_folio;
    if (!folio) {
      folio = getNextFolio(req.laundryId);
      incrementFolio(req.laundryId);
    }

    // 3. Calculate total
    let total = 0;
    for (const item of items) {
      const qty = parseInt(item.quantity, 10) || 1;
      const price = parseFloat(item.unit_price) || 0;
      total += qty * price;
    }

    const specialJson = JSON.stringify(Array.isArray(special_services) ? special_services : []);
    const resolvedPaymentStatus = payment_status || 'PENDIENTE';
    const resolvedPaidAmount = resolvedPaymentStatus === 'PAGADO'
      ? (Number(paid_amount) > 0 ? Number(paid_amount) : total)
      : (Number(paid_amount) || 0);

    // 4. Insert Order
    const insertOrderStmt = db.prepare(`
      INSERT INTO orders (
        laundry_id, folio, client_id, client_name, client_rut, client_phone, client_address,
        reception_date, delivery_date, exit_date, document_type, status,
        payment_status, payment_method, paid_amount,
        special_services, observations, total, created_by_user_id, created_by_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const orderResult = insertOrderStmt.run(
      req.laundryId,
      folio,
      clientId,
      client_name.trim(),
      cleanRut,
      (client_phone || '').trim(),
      (client_address || '').trim(),
      reception_date || getLocalDateStr(),
      delivery_date || '',
      exit_date || null,
      document_type || 'BOLETA',
      'RECIBIDO',
      resolvedPaymentStatus,
      payment_method || 'EFECTIVO',
      resolvedPaidAmount,
      specialJson,
      observations || '',
      total,
      req.user.id,
      req.user.full_name
    );

    const orderId = orderResult.lastInsertRowid;

    // 5. Insert Items
    const insertItemStmt = db.prepare(`
      INSERT INTO order_items (order_id, service_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const qty = parseInt(item.quantity, 10) || 1;
      const price = parseFloat(item.unit_price) || 0;
      insertItemStmt.run(orderId, item.service_name, qty, price, qty * price);
    }

    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const createdItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

    res.status(201).json({
      ...createdOrder,
      items: createdItems,
      special_services: Array.isArray(special_services) ? special_services : [],
      business_config: getConfig(req.laundryId)
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', requireAuth, requirePermission('manage_orders'), (req, res) => {
  try {
    const { status, exit_date } = req.body;
    const allowed = ['RECIBIDO', 'EN_LAVADO', 'LISTO', 'ENTREGADO', 'CANCELADO'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const existing = db.prepare('SELECT id, exit_date FROM orders WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });

    let nextExitDate = null;
    if (status === 'ENTREGADO') {
      nextExitDate = (exit_date && exit_date.trim())
        ? exit_date.trim()
        : (existing.exit_date || getLocalDateStr());
    }

    db.prepare(`
      UPDATE orders
      SET status = ?, exit_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND laundry_id = ?
    `).run(status, nextExitDate, req.params.id, req.laundryId);

    res.json({ success: true, status, exit_date: nextExitDate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/payment', requireAuth, requirePermission('manage_orders'), (req, res) => {
  try {
    const { payment_status, payment_method, paid_amount } = req.body;
    const existing = db.prepare('SELECT id, total, paid_amount FROM orders WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });

    let resolvedPaidAmount = paid_amount;
    if (resolvedPaidAmount === undefined || resolvedPaidAmount === null) {
      if (payment_status === 'PAGADO') resolvedPaidAmount = existing.total;
      else if (payment_status === 'PENDIENTE') resolvedPaidAmount = 0;
    }

    db.prepare(`
      UPDATE orders
      SET payment_status = COALESCE(?, payment_status),
          payment_method = COALESCE(?, payment_method),
          paid_amount = COALESCE(?, paid_amount),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND laundry_id = ?
    `).run(payment_status || null, payment_method || null, resolvedPaidAmount ?? null, req.params.id, req.laundryId);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id', requireAuth, requirePermission('manage_orders'), (req, res) => {
  try {
    const { status, exit_date, payment_status, payment_method, delivery_date } = req.body;
    const existing = db.prepare('SELECT * FROM orders WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });

    const nextStatus = status || existing.status;
    let nextExitDate = existing.exit_date;

    if (exit_date !== undefined) {
      nextExitDate = (exit_date && exit_date.trim()) ? exit_date.trim() : null;
    } else if (nextStatus === 'ENTREGADO' && !nextExitDate) {
      nextExitDate = getLocalDateStr();
    } else if (status && status !== 'ENTREGADO') {
      nextExitDate = null;
    }

    const nextPaymentStatus = payment_status || existing.payment_status;
    const nextPaymentMethod = payment_method || existing.payment_method;
    const nextPaidAmount = nextPaymentStatus === 'PAGADO' ? existing.total : 0;
    const nextDeliveryDate = (delivery_date && delivery_date.trim()) ? delivery_date.trim() : existing.delivery_date;

    db.prepare(`
      UPDATE orders
      SET status = ?,
          exit_date = ?,
          delivery_date = ?,
          payment_status = ?,
          payment_method = ?,
          paid_amount = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND laundry_id = ?
    `).run(nextStatus, nextExitDate, nextDeliveryDate, nextPaymentStatus, nextPaymentMethod, nextPaidAmount, req.params.id, req.laundryId);

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', requireAuth, requirePermission('manage_orders'), (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE id = ? AND laundry_id = ?').run(req.params.id, req.laundryId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- GASTOS & INSUMOS (EXPENSES) -----------------
app.get('/api/expenses', requireAuth, requirePermission('view_expenses'), (req, res) => {
  try {
    const { search, type, startDate, endDate } = req.query;
    let query = 'SELECT * FROM expenses WHERE laundry_id = ?';
    const params = [req.laundryId];

    if (search && search.trim()) {
      query += ' AND (product_name LIKE ? OR notes LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (type && type !== 'TODOS') {
      query += ' AND product_type = ?';
      params.push(type);
    }

    if (startDate) {
      query += ' AND purchase_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND purchase_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY purchase_date DESC, id DESC';
    const expenses = db.prepare(query).all(...params);

    const total = expenses.reduce((acc, it) => acc + (it.price || 0), 0);

    const typeSummary = {};
    for (const exp of expenses) {
      const t = exp.product_type || 'Otros';
      if (!typeSummary[t]) {
        typeSummary[t] = { type: t, total: 0, count: 0 };
      }
      typeSummary[t].total += exp.price || 0;
      typeSummary[t].count += 1;
    }

    res.json({
      expenses,
      summary: {
        count: expenses.length,
        totalExpenses: total,
        byType: Object.values(typeSummary).sort((a, b) => b.total - a.total)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/expenses/:id', requireAuth, requirePermission('view_expenses'), (req, res) => {
  try {
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', requireAuth, requirePermission('manage_expenses'), (req, res) => {
  try {
    const { product_name, product_type, price, purchase_date, notes } = req.body;

    if (!product_name || !product_name.trim()) {
      return res.status(400).json({ error: 'El nombre del producto o insumo es obligatorio' });
    }
    if (!product_type || !product_type.trim()) {
      return res.status(400).json({ error: 'El tipo de producto es obligatorio' });
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido mayor o igual a 0' });
    }

    const dateVal = purchase_date && purchase_date.trim() ? purchase_date.trim() : getLocalDateStr();

    const result = db.prepare(`
      INSERT INTO expenses (laundry_id, product_name, product_type, price, purchase_date, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.laundryId, product_name.trim(), product_type.trim(), numPrice, dateVal, (notes || '').trim(), req.user.id);

    const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', requireAuth, requirePermission('manage_expenses'), (req, res) => {
  try {
    const { product_name, product_type, price, purchase_date, notes } = req.body;

    if (!product_name || !product_name.trim()) {
      return res.status(400).json({ error: 'El nombre del producto es obligatorio' });
    }
    if (!product_type || !product_type.trim()) {
      return res.status(400).json({ error: 'El tipo de producto es obligatorio' });
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido mayor o igual a 0' });
    }

    const dateVal = purchase_date && purchase_date.trim() ? purchase_date.trim() : getLocalDateStr();

    db.prepare(`
      UPDATE expenses
      SET product_name = ?,
          product_type = ?,
          price = ?,
          purchase_date = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND laundry_id = ?
    `).run(product_name.trim(), product_type.trim(), numPrice, dateVal, (notes || '').trim(), req.params.id, req.laundryId);

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ? AND laundry_id = ?').get(req.params.id, req.laundryId);
    if (!updated) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', requireAuth, requirePermission('manage_expenses'), (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ? AND laundry_id = ?').run(req.params.id, req.laundryId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- DASHBOARD STATS (SCOPED PER LAUNDRY) -----------------
app.get('/api/stats', requireAuth, requireTenantOnly, (req, res) => {
  try {
    const today = getLocalDateStr();
    const tomorrow = getLocalDateStr(new Date(Date.now() + 1 * 86400000));
    const twoDaysAhead = getLocalDateStr(new Date(Date.now() + 2 * 86400000));

    const todayOrders = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE laundry_id = ? AND reception_date = ? AND status != 'CANCELADO'").get(req.laundryId, today);
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE laundry_id = ? AND status IN ('RECIBIDO', 'EN_LAVADO')").get(req.laundryId);
    const readyOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE laundry_id = ? AND status = 'LISTO'").get(req.laundryId);
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients WHERE laundry_id = ?').get(req.laundryId);

    const rawUpcoming = db.prepare(`
      SELECT id, folio, client_name, client_phone, client_rut, reception_date, delivery_date, status, payment_status, payment_method, total
      FROM orders
      WHERE laundry_id = ?
        AND status NOT IN ('ENTREGADO', 'CANCELADO')
        AND delivery_date != ''
        AND delivery_date <= ?
      ORDER BY delivery_date ASC, id ASC
    `).all(req.laundryId, twoDaysAhead);

    const upcomingDeliveries = rawUpcoming.map(o => {
      let urgency = 'UPCOMING';
      if (o.delivery_date < today) urgency = 'OVERDUE';
      else if (o.delivery_date === today) urgency = 'TODAY';
      else if (o.delivery_date === tomorrow) urgency = 'TOMORROW';
      return { ...o, urgency };
    });

    const monthlyStats = db.prepare(`
      SELECT substr(reception_date, 1, 7) as month, COUNT(*) as orders, COALESCE(SUM(total), 0) as total
      FROM orders
      WHERE laundry_id = ?
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).all(req.laundryId);

    res.json({
      todayOrders: todayOrders.count,
      todayRevenue: todayOrders.total,
      pendingCount: pendingOrders.count,
      readyCount: readyOrders.count,
      totalClients: totalClients.count,
      today,
      tomorrow,
      upcomingDeliveries,
      upcomingSummary: {
        total: upcomingDeliveries.length,
        overdueCount: upcomingDeliveries.filter(o => o.urgency === 'OVERDUE').length,
        todayCount: upcomingDeliveries.filter(o => o.urgency === 'TODAY').length,
        tomorrowCount: upcomingDeliveries.filter(o => o.urgency === 'TOMORROW').length,
        upcomingCount: upcomingDeliveries.filter(o => o.urgency === 'UPCOMING').length
      },
      monthlyStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SALES & BUSINESS REPORTS (SCOPED PER LAUNDRY) -----------------
app.get('/api/reports/sales', requireAuth, requirePermission('view_reports'), (req, res) => {
  try {
    const { startDate, endDate, paymentStatus, documentType, paymentMethod } = req.query;

    function buildFilter(prefix) {
      const p = prefix ? `${prefix}.` : '';
      const clauses = [`${p}laundry_id = ?`, `${p}status != 'CANCELADO'`];
      const params = [req.laundryId];

      if (startDate) {
        clauses.push(`${p}reception_date >= ?`);
        params.push(startDate);
      }
      if (endDate) {
        clauses.push(`${p}reception_date <= ?`);
        params.push(endDate);
      }
      if (paymentStatus && paymentStatus !== 'TODOS') {
        clauses.push(`${p}payment_status = ?`);
        params.push(paymentStatus);
      }
      if (documentType && documentType !== 'TODOS') {
        clauses.push(`${p}document_type = ?`);
        params.push(documentType);
      }
      if (paymentMethod && paymentMethod !== 'TODOS') {
        clauses.push(`${p}payment_method = ?`);
        params.push(paymentMethod);
      }

      return {
        where: 'WHERE ' + clauses.join(' AND '),
        params
      };
    }

    const mainFilter = buildFilter('');
    const joinFilter = buildFilter('o');

    const summary = db.prepare(`
      SELECT
        COUNT(*) as totalOrders,
        COALESCE(SUM(total), 0) as totalRevenue,
        COALESCE(SUM(CASE WHEN payment_status = 'PAGADO' THEN total ELSE 0 END), 0) as paidRevenue,
        COALESCE(SUM(CASE WHEN payment_status = 'PENDIENTE' THEN total ELSE 0 END), 0) as pendingRevenue
      FROM orders
      ${mainFilter.where}
    `).get(...mainFilter.params);

    const itemsSummary = db.prepare(`
      SELECT COALESCE(SUM(oi.quantity), 0) as totalItems
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      ${joinFilter.where}
    `).get(...joinFilter.params);

    summary.totalItems = itemsSummary.totalItems;
    summary.averageTicket = summary.totalOrders > 0 ? Math.round(summary.totalRevenue / summary.totalOrders) : 0;
    summary.averageItemPrice = summary.totalItems > 0 ? Math.round(summary.totalRevenue / summary.totalItems) : 0;

    const expClauses = ['laundry_id = ?'];
    const expParams = [req.laundryId];
    if (startDate) {
      expClauses.push('purchase_date >= ?');
      expParams.push(startDate);
    }
    if (endDate) {
      expClauses.push('purchase_date <= ?');
      expParams.push(endDate);
    }
    const expWhere = 'WHERE ' + expClauses.join(' AND ');

    const expensesSummary = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as totalExpenses, COUNT(*) as count
      FROM expenses
      ${expWhere}
    `).get(...expParams);

    summary.totalExpenses = expensesSummary.totalExpenses;
    summary.expensesCount = expensesSummary.count;
    summary.netProfit = summary.totalRevenue - summary.totalExpenses;
    summary.profitMargin = summary.totalRevenue > 0 ? Math.round((summary.netProfit / summary.totalRevenue) * 100) : 0;

    const expensesByType = db.prepare(`
      SELECT product_type, COUNT(*) as count, COALESCE(SUM(price), 0) as total
      FROM expenses
      ${expWhere}
      GROUP BY product_type
      ORDER BY total DESC
    `).all(...expParams);

    const dailyOrders = db.prepare(`
      SELECT
        reception_date as date,
        COUNT(*) as ordersCount,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY reception_date
    `).all(...mainFilter.params);

    const dailyExpenses = db.prepare(`
      SELECT
        purchase_date as date,
        COUNT(*) as expensesCount,
        COALESCE(SUM(price), 0) as expenses
      FROM expenses
      ${expWhere}
      GROUP BY purchase_date
    `).all(...expParams);

    const dateMap = new Map();
    for (const o of dailyOrders) {
      dateMap.set(o.date, { date: o.date, ordersCount: o.ordersCount, revenue: o.revenue, expensesCount: 0, expenses: 0 });
    }
    for (const e of dailyExpenses) {
      if (dateMap.has(e.date)) {
        const d = dateMap.get(e.date);
        d.expensesCount = e.expensesCount;
        d.expenses = e.expenses;
      } else {
        dateMap.set(e.date, { date: e.date, ordersCount: 0, revenue: 0, expensesCount: e.expensesCount, expenses: e.expenses });
      }
    }
    const dailyBreakdown = Array.from(dateMap.values())
      .map(d => ({ ...d, net: d.revenue - d.expenses }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topServices = db.prepare(`
      SELECT
        oi.service_name,
        SUM(oi.quantity) as totalQty,
        SUM(oi.subtotal) as totalSubtotal
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      ${joinFilter.where}
      GROUP BY oi.service_name
      ORDER BY totalQty DESC
      LIMIT 10
    `).all(...joinFilter.params);

    const categoriesBreakdown = db.prepare(`
      SELECT
        COALESCE(s.category, 'Prendas y Servicios') as category,
        SUM(oi.quantity) as totalQty,
        SUM(oi.subtotal) as totalRevenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN services s ON s.laundry_id = o.laundry_id AND LOWER(TRIM(s.name)) = LOWER(TRIM(oi.service_name))
      ${joinFilter.where}
      GROUP BY category
      ORDER BY totalRevenue DESC
    `).all(...joinFilter.params);

    const documentTypes = db.prepare(`
      SELECT
        COALESCE(document_type, 'BOLETA') as documentType,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY documentType
    `).all(...mainFilter.params);

    const paymentBreakdown = db.prepare(`
      SELECT
        COALESCE(payment_status, 'PENDIENTE') as paymentStatus,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY paymentStatus
    `).all(...mainFilter.params);

    const paymentMethodsBreakdown = db.prepare(`
      SELECT
        COALESCE(payment_method, 'EFECTIVO') as paymentMethod,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY paymentMethod
      ORDER BY revenue DESC
    `).all(...mainFilter.params);

    const topClients = db.prepare(`
      SELECT
        client_name, client_phone, COUNT(*) as ordersCount,
        COALESCE(SUM(total), 0) as totalSpent,
        COALESCE(SUM(CASE WHEN payment_status = 'PENDIENTE' THEN total ELSE 0 END), 0) as pendingDebt
      FROM orders
      ${mainFilter.where}
      GROUP BY client_name
      ORDER BY totalSpent DESC
      LIMIT 10
    `).all(...mainFilter.params);

    const debtors = db.prepare(`
      SELECT
        client_name, client_phone, COUNT(*) as pendingOrders,
        COALESCE(SUM(total), 0) as totalDebt,
        MIN(reception_date) as oldestOrderDate,
        GROUP_CONCAT(folio, ', ') as folios
      FROM orders
      WHERE laundry_id = ? AND status != 'CANCELADO' AND payment_status = 'PENDIENTE'
      GROUP BY client_name, client_phone
      ORDER BY totalDebt DESC
    `).all(req.laundryId);

    const workshopCounts = db.prepare(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM orders
      WHERE laundry_id = ? AND status != 'CANCELADO'
      GROUP BY status
    `).all(req.laundryId);

    const todayStr = getLocalDateStr();
    const twoDaysAheadStr = getLocalDateStr(new Date(Date.now() + 2 * 86400000));
    const overdueOrders = db.prepare(`
      SELECT id, folio, client_name, client_phone, delivery_date, status, total
      FROM orders
      WHERE laundry_id = ? AND status NOT IN ('ENTREGADO', 'CANCELADO') AND delivery_date != '' AND delivery_date < ?
      ORDER BY delivery_date ASC
    `).all(req.laundryId, todayStr);

    const upcomingDeliveries = db.prepare(`
      SELECT id, folio, client_name, client_phone, delivery_date, status, payment_status, total
      FROM orders
      WHERE laundry_id = ? AND status NOT IN ('ENTREGADO', 'CANCELADO') AND delivery_date != '' AND delivery_date >= ? AND delivery_date <= ?
      ORDER BY delivery_date ASC
    `).all(req.laundryId, todayStr, twoDaysAheadStr);

    const readyForPickupOrders = db.prepare(`
      SELECT id, folio, client_name, client_phone, delivery_date, status, total
      FROM orders
      WHERE laundry_id = ? AND status = 'LISTO'
      ORDER BY delivery_date ASC
    `).all(req.laundryId);

    const orders = db.prepare(`
      SELECT
        id, folio, client_name, client_rut, client_phone, reception_date, delivery_date, exit_date,
        document_type, status, payment_status, payment_method, total, created_at
      FROM orders
      ${mainFilter.where}
      ORDER BY reception_date DESC, id DESC
    `).all(...mainFilter.params);

    const getItemsStmt = db.prepare('SELECT service_name, quantity, subtotal FROM order_items WHERE order_id = ?');
    for (const ord of orders) {
      const ordItems = getItemsStmt.all(ord.id);
      ord.itemsCount = ordItems.reduce((acc, it) => acc + it.quantity, 0);
      ord.itemsSummary = ordItems.map(it => `${it.quantity}x ${it.service_name}`).join(', ');
    }

    res.json({
      summary,
      dailyBreakdown,
      topServices,
      categoriesBreakdown,
      documentTypes,
      paymentBreakdown,
      paymentMethodsBreakdown,
      expensesBreakdown: expensesByType,
      topClients,
      debtors,
      workshop: {
        counts: workshopCounts,
        overdue: overdueOrders,
        upcoming: upcomingDeliveries,
        readyForPickup: readyForPickupOrders
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CLOUD & BACKUP SYNC (SCOPED) -----------------
app.get('/api/sync/export', requireAuth, requirePermission('export_backups'), (req, res) => {
  try {
    const config = getConfig(req.laundryId);
    const services = db.prepare('SELECT * FROM services WHERE laundry_id = ?').all(req.laundryId);
    const clients = db.prepare('SELECT * FROM clients WHERE laundry_id = ?').all(req.laundryId);
    const orders = db.prepare('SELECT * FROM orders WHERE laundry_id = ?').all(req.laundryId);
    const order_items = db.prepare('SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.laundry_id = ?').all(req.laundryId);
    const expenses = db.prepare('SELECT * FROM expenses WHERE laundry_id = ?').all(req.laundryId);

    res.json({
      version: '2.0-saas',
      exported_at: new Date().toISOString(),
      business: config,
      data: {
        services,
        clients,
        orders,
        order_items,
        expenses
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/db', requireAuth, (req, res) => {
  return res.status(403).json({
    error: 'Privacidad SaaS: La descarga global del archivo SQLite está deshabilitada para proteger los datos privados de cada lavandería. Usa "Respaldo JSON" dentro de tu propia sede.'
  });
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`⚡ BATERY CLEAN SAAS - GESTIÓN DE LAVANDERÍAS ⚡`);
    console.log(`=======================================================`);
    console.log(`🚀 Servidor activo en: http://localhost:${PORT}`);
    const ips = getLocalIpAddresses();
    if (ips.length > 0) {
      console.log(`📱 Acceso desde red local Wi-Fi:`);
      ips.forEach(i => console.log(`   👉 http://${i.ip}:${PORT}  (${i.interface})`));
    }
    console.log(`📦 Base de Datos: ${path.basename(DB_PATH)}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;

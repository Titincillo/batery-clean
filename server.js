const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { db, getConfig, updateConfig, getNextFolio, incrementFolio } = require('./db');

const app = express();
const PORT = process.env.PORT || 3050;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  if (req.url !== '/' && !req.url.startsWith('/api') && !req.url.includes('.')) {
    req.url = '/api' + req.url;
  }
  next();
});

// Helper: Get local date string YYYY-MM-DD
function getLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ interface: name, ip: net.address });
      }
    }
  }
  return addresses;
}

// ----------------- CONFIG ENDPOINTS -----------------
app.get('/api/config', (req, res) => {
  try {
    const config = getConfig();
    const nextFolio = getNextFolio();
    res.json({ ...config, nextFolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const updated = updateConfig(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/network-info', (req, res) => {
  const ips = getLocalIpAddresses();
  res.json({
    port: PORT,
    ips,
    localUrl: `http://localhost:${PORT}`,
    mobileUrls: ips.map(i => `http://${i.ip}:${PORT}`)
  });
});

// ----------------- SERVICES ENDPOINTS -----------------
app.get('/api/services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY display_order ASC, name ASC').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/services', (req, res) => {
  try {
    const { name, category, default_price } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const maxOrderRow = db.prepare('SELECT MAX(display_order) as m FROM services').get();
    const nextOrder = (maxOrderRow?.m || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO services (name, category, default_price, display_order)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name.trim(), category ? category.trim() : 'Otros', parseFloat(default_price) || 0, nextOrder);
    const created = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe una prenda con ese nombre en el catálogo.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/services/:id', (req, res) => {
  try {
    const { name, category, default_price, active } = req.body;
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Servicio no encontrado' });

    db.prepare(`
      UPDATE services
      SET name = COALESCE(?, name),
          category = COALESCE(?, category),
          default_price = COALESCE(?, default_price),
          active = COALESCE(?, active)
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      category !== undefined ? category.trim() : existing.category,
      default_price !== undefined ? parseFloat(default_price) : existing.default_price,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id
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

app.delete('/api/services/:id', (req, res) => {
  try {
    const service = db.prepare('SELECT id, name FROM services WHERE id = ?').get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: `Prenda "${service.name}" eliminada del catálogo.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CLIENTS ENDPOINTS -----------------
app.get('/api/clients', (req, res) => {
  try {
    const search = req.query.q ? `%${req.query.q}%` : null;
    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as orders_count
      FROM clients c
    `;
    const params = [];

    if (search) {
      query += ' WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.address LIKE ? OR c.rut LIKE ?';
      params.push(search, search, search, search, search);
    }
    query += ' ORDER BY c.name ASC LIMIT 100';

    const clients = db.prepare(query).all(...params);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', (req, res) => {
  try {
    const { name, phone, email, address, rut, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const stmt = db.prepare(`
      INSERT INTO clients (name, phone, email, address, rut, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name.trim(),
      (phone || '').trim(),
      (email || '').trim(),
      (address || '').trim(),
      (rut || '').trim(),
      (notes || '').trim()
    );
    
    const newClient = db.prepare('SELECT c.*, 0 as orders_count FROM clients c WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clients/:id', (req, res) => {
  try {
    const { name, phone, email, address, rut, notes } = req.body;
    const clientId = req.params.id;

    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const existing = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });

    db.prepare(`
      UPDATE clients
      SET name = ?, phone = ?, email = ?, address = ?, rut = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(),
      (phone || '').trim(),
      (email || '').trim(),
      (address || '').trim(),
      (rut || '').trim(),
      (notes || '').trim(),
      clientId
    );

    // Keep denormalized orders updated
    db.prepare(`
      UPDATE orders
      SET client_name = ?, client_phone = ?, client_address = ?
      WHERE client_id = ?
    `).run(name.trim(), (phone || '').trim(), (address || '').trim(), clientId);

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

app.delete('/api/clients/:id', (req, res) => {
  try {
    const clientId = req.params.id;
    const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const orderCountRow = db.prepare('SELECT COUNT(*) as count FROM orders WHERE client_id = ?').get(clientId);
    const orderCount = orderCountRow ? orderCountRow.count : 0;

    // Delete client (Foreign key on orders has ON DELETE SET NULL, keeping historical orders)
    db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);

    res.json({
      success: true,
      message: `Cliente "${client.name}" eliminado correctamente.`,
      ordersUpdated: orderCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients/:id', (req, res) => {
  try {
    const client = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) as orders_count
      FROM clients c WHERE c.id = ?
    `).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

    const orders = db.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ ...client, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- ORDERS ENDPOINTS -----------------
app.get('/api/orders', (req, res) => {
  try {
    const { status, search, from, to } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'TODOS') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (folio LIKE ? OR client_name LIKE ? OR client_phone LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (from) {
      sql += ' AND reception_date >= ?';
      params.push(from);
    }

    if (to) {
      sql += ' AND reception_date <= ?';
      params.push(to);
    }

    sql += ' ORDER BY id DESC LIMIT 100';

    const orders = db.prepare(sql).all(...params);

    // Attach items to each order
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

    res.json(enrichedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? OR folio = ?').get(req.params.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    let specialServices = [];
    try {
      specialServices = JSON.parse(order.special_services || '[]');
    } catch (e) {
      specialServices = [];
    }

    const config = getConfig();

    res.json({
      ...order,
      items,
      special_services: specialServices,
      business_config: config
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const {
      client_name,
      client_phone,
      client_address,
      reception_date,
      delivery_date,
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

    // 1. Find or create client
    let clientId = null;
    let client = null;
    if (client_phone && client_phone.trim()) {
      client = db.prepare('SELECT id FROM clients WHERE phone = ?').get(client_phone.trim());
    }
    if (!client && client_name) {
      client = db.prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)').get(client_name.trim());
    }

    if (client) {
      clientId = client.id;
      // Update address or phone if provided
      db.prepare(`
        UPDATE clients
        SET address = COALESCE(NULLIF(?, ''), address),
            phone = COALESCE(NULLIF(?, ''), phone),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(client_address, client_phone, clientId);
    } else {
      const insClient = db.prepare(`
        INSERT INTO clients (name, phone, address)
        VALUES (?, ?, ?)
      `);
      const clientRes = insClient.run(client_name.trim(), client_phone || '', client_address || '');
      clientId = clientRes.lastInsertRowid;
    }

    // 2. Generate Folio
    let folio = custom_folio;
    if (!folio) {
      folio = getNextFolio();
      incrementFolio();
    }

    // 3. Calculate total
    let total = 0;
    for (const item of items) {
      const qty = parseInt(item.quantity, 10) || 1;
      const price = parseFloat(item.unit_price) || 0;
      total += qty * price;
    }

    // Special services JSON
    const specialJson = JSON.stringify(Array.isArray(special_services) ? special_services : []);

    // 4. Insert Order
    const insertOrderStmt = db.prepare(`
      INSERT INTO orders (
        folio, client_id, client_name, client_phone, client_address,
        reception_date, delivery_date, document_type, status,
        payment_status, payment_method, paid_amount,
        special_services, observations, total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const orderResult = insertOrderStmt.run(
      folio,
      clientId,
      client_name.trim(),
      client_phone || '',
      client_address || '',
      reception_date || getLocalDateStr(),
      delivery_date || '',
      document_type || 'BOLETA',
      'RECIBIDO',
      payment_status || 'PENDIENTE',
      payment_method || 'EFECTIVO',
      paid_amount || 0,
      specialJson,
      observations || '',
      total
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

    // Fetch created order
    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const createdItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

    res.status(201).json({
      ...createdOrder,
      items: createdItems,
      special_services: Array.isArray(special_services) ? special_services : [],
      business_config: getConfig()
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['RECIBIDO', 'EN_LAVADO', 'LISTO', 'ENTREGADO', 'CANCELADO'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    db.prepare(`
      UPDATE orders
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.params.id);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/payment', (req, res) => {
  try {
    const { payment_status, payment_method, paid_amount } = req.body;
    db.prepare(`
      UPDATE orders
      SET payment_status = COALESCE(?, payment_status),
          payment_method = COALESCE(?, payment_method),
          paid_amount = COALESCE(?, paid_amount),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payment_status, payment_method, paid_amount, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- GASTOS & INSUMOS (EXPENSES) -----------------
app.get('/api/expenses', (req, res) => {
  try {
    const { search, type, startDate, endDate } = req.query;
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

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

app.get('/api/expenses/:id', (req, res) => {
  try {
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!expense) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', (req, res) => {
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
      INSERT INTO expenses (product_name, product_type, price, purchase_date, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(product_name.trim(), product_type.trim(), numPrice, dateVal, (notes || '').trim());

    const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', (req, res) => {
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
      WHERE id = ?
    `).run(product_name.trim(), product_type.trim(), numPrice, dateVal, (notes || '').trim(), req.params.id);

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- DASHBOARD STATS -----------------
app.get('/api/stats', (req, res) => {
  try {
    const today = getLocalDateStr();

    const todayOrders = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM orders WHERE reception_date = ?').get(today);
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('RECIBIDO', 'EN_LAVADO')").get();
    const readyOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'LISTO'").get();
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get();

    const monthlyStats = db.prepare(`
      SELECT substr(reception_date, 1, 7) as month, COUNT(*) as orders, COALESCE(SUM(total), 0) as total
      FROM orders
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).all();

    res.json({
      todayOrders: todayOrders.count,
      todayRevenue: todayOrders.total,
      pendingCount: pendingOrders.count,
      readyCount: readyOrders.count,
      totalClients: totalClients.count,
      monthlyStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- SALES & BUSINESS REPORTS -----------------
app.get('/api/reports/sales', (req, res) => {
  try {
    const { startDate, endDate, paymentStatus, documentType } = req.query;

    function buildFilter(prefix) {
      const p = prefix ? `${prefix}.` : '';
      const clauses = [`${p}status != 'CANCELADO'`];
      const params = [];

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

      return {
        where: 'WHERE ' + clauses.join(' AND '),
        params
      };
    }

    const mainFilter = buildFilter('');
    const joinFilter = buildFilter('o');

    // 1. Overall Sales Summary
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

    // 2. Expenses in the date range
    const expClauses = [];
    const expParams = [];
    if (startDate) {
      expClauses.push('purchase_date >= ?');
      expParams.push(startDate);
    }
    if (endDate) {
      expClauses.push('purchase_date <= ?');
      expParams.push(endDate);
    }
    const expWhere = expClauses.length > 0 ? 'WHERE ' + expClauses.join(' AND ') : '';

    const expensesSummary = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as totalExpenses, COUNT(*) as count
      FROM expenses
      ${expWhere}
    `).get(...expParams);

    summary.totalExpenses = expensesSummary.totalExpenses;
    summary.expensesCount = expensesSummary.count;
    summary.netProfit = summary.totalRevenue - summary.totalExpenses;
    summary.profitMargin = summary.totalRevenue > 0 ? Math.round((summary.netProfit / summary.totalRevenue) * 100) : 0;

    // 3. Expenses breakdown by category
    const expensesByType = db.prepare(`
      SELECT product_type, COUNT(*) as count, COALESCE(SUM(price), 0) as total
      FROM expenses
      ${expWhere}
      GROUP BY product_type
      ORDER BY total DESC
    `).all(...expParams);

    // 4. Unified Daily Timeline (Revenue vs Expenses)
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

    // 5. Top Services / Prendas
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

    // 6. Categories Breakdown
    const categoriesBreakdown = db.prepare(`
      SELECT 
        COALESCE(s.category, 'Prendas y Servicios') as category,
        SUM(oi.quantity) as totalQty,
        SUM(oi.subtotal) as totalRevenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN services s ON LOWER(TRIM(s.name)) = LOWER(TRIM(oi.service_name))
      ${joinFilter.where}
      GROUP BY category
      ORDER BY totalRevenue DESC
    `).all(...joinFilter.params);

    // 7. Document Types breakdown
    const documentTypes = db.prepare(`
      SELECT 
        COALESCE(document_type, 'BOLETA') as documentType,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY documentType
    `).all(...mainFilter.params);

    // 8. Payment status breakdown
    const paymentBreakdown = db.prepare(`
      SELECT 
        COALESCE(payment_status, 'PENDIENTE') as paymentStatus,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      ${mainFilter.where}
      GROUP BY paymentStatus
    `).all(...mainFilter.params);

    // 9. Top Clients
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

    // 10. Debtors / Cuentas por Cobrar (Clientes con pedidos pendientes)
    const debtors = db.prepare(`
      SELECT 
        client_name, client_phone, COUNT(*) as pendingOrders,
        COALESCE(SUM(total), 0) as totalDebt,
        MIN(reception_date) as oldestOrderDate,
        GROUP_CONCAT(folio, ', ') as folios
      FROM orders
      WHERE status != 'CANCELADO' AND payment_status = 'PENDIENTE'
      GROUP BY client_name, client_phone
      ORDER BY totalDebt DESC
    `).all();

    // 11. Workshop Status
    const workshopCounts = db.prepare(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM orders
      WHERE status != 'CANCELADO'
      GROUP BY status
    `).all();

    const todayStr = new Date().toISOString().slice(0, 10);
    const overdueOrders = db.prepare(`
      SELECT id, folio, client_name, client_phone, delivery_date, status, total
      FROM orders
      WHERE status NOT IN ('ENTREGADO', 'CANCELADO') AND delivery_date < ?
      ORDER BY delivery_date ASC
    `).all(todayStr);

    const readyForPickupOrders = db.prepare(`
      SELECT id, folio, client_name, client_phone, delivery_date, status, total
      FROM orders
      WHERE status = 'LISTO'
      ORDER BY delivery_date ASC
    `).all();

    // 12. Detailed Orders List
    const orders = db.prepare(`
      SELECT 
        id, folio, client_name, client_phone, reception_date, delivery_date,
        document_type, status, payment_status, total, created_at
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
      expensesBreakdown: expensesByType,
      topClients,
      debtors,
      workshop: {
        counts: workshopCounts,
        overdue: overdueOrders,
        readyForPickup: readyForPickupOrders
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- CLOUD & BACKUP SYNC -----------------
// Ready for offline-first syncing to cloud database or mobile app
app.get('/api/sync/export', (req, res) => {
  try {
    const config = getConfig();
    const services = db.prepare('SELECT * FROM services').all();
    const clients = db.prepare('SELECT * FROM clients').all();
    const orders = db.prepare('SELECT * FROM orders').all();
    const order_items = db.prepare('SELECT * FROM order_items').all();
    const expenses = db.prepare('SELECT * FROM expenses').all();

    res.json({
      version: '1.0',
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

// Download native SQLite .db file directly
app.get('/api/backup/db', (req, res) => {
  try {
    const isServerless = Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
    const dbFile = (isServerless && fs.existsSync(path.join('/tmp', 'batery_clean.db')))
      ? path.join('/tmp', 'batery_clean.db')
      : path.join(__dirname, 'batery_clean.db');
    const today = getLocalDateStr();
    res.download(dbFile, `batery_clean_backup_${today}.db`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start local HTTP server when executed directly (node server.js)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`⚡ LAVANDERÍA BATERY CLEAN - SISTEMA DE PEDIDOS ⚡`);
    console.log(`=======================================================`);
    console.log(`🚀 Servidor Local activo en: http://localhost:${PORT}`);
    const ips = getLocalIpAddresses();
    if (ips.length > 0) {
      console.log(`📱 Acceso desde teléfono/tablet en la misma red Wi-Fi:`);
      ips.forEach(i => console.log(`   👉 http://${i.ip}:${PORT}  (${i.interface})`));
    }
    console.log(`📦 Base de Datos Local: batery_clean.db (100% Offline)`);
    console.log(`=======================================================`);
  });
}

// Export Express app for Netlify Functions (serverless-http)
module.exports = app;

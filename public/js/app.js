// Lavandería Batery Clean - Frontend Application
// 100% Offline Capable - Local Database Powered

const state = {
  services: [],
  selectedItems: {}, // service_id or name -> { name, unit_price, quantity }
  config: null,
  activeTab: 'nueva-guia',
  networkInfo: null,
  authUser: null,
  permissions: new Set(),
  laundry: null,
  plan: null,
  permissionsCatalog: [],
  users: [],
  roles: [],
  saasLaundries: [],
  saasPlans: [],
  saasSummary: null,
  saasAdmins: [],
  saasAuditLogs: [],
  saasAgreements: [],
  supportTickets: [],
  supportUnreadCount: 0,
  settingsDraftLogo: null,
  usersRolesSubTab: 'users',
  saasBusinessesSubTab: 'businesses',
  saasPlatformSubTab: 'plans'
};

function getActiveLogoUrl() {
  if (state.authUser?.is_superadmin) return '/assets/lavanderia_oficial.jpeg';
  const custom = state.laundry?.logo_url || state.config?.logo_url || '';
  return custom || '/assets/lavanderia_oficial.jpeg';
}

function hasPerm(permExpr) {
  if (!state.authUser) return false;
  const isSuper = Boolean(state.authUser.is_superadmin);
  if (!permExpr) return !isSuper;
  const tokens = String(permExpr).split('|').map(p => p.trim());
  if (isSuper) {
    // SuperAdmin SaaS ONLY accesses __superadmin__ tabs (strict privacy: zero tenant sales/ops)
    return tokens.includes('__superadmin__');
  }
  return tokens.some(p => p !== '__superadmin__' && state.permissions.has(p));
}

function syncHeaderAndDrawerFromAuth() {
  const user = state.authUser;
  const isSuper = Boolean(user?.is_superadmin);
  const laundry = state.laundry || {};
  const nameText = isSuper ? 'LAVANDERÍA SaaS' : (laundry.name || 'LAVANDERÍA');
  const sloganText = isSuper
    ? '⚡ Consola Global Super Usuario ⚡'
    : (laundry.slogan ? `⚡ ${laundry.slogan} ⚡` : '⚡ Gestión de Lavandería ⚡');

  const brandEl = document.getElementById('headerBrandName');
  if (brandEl) {
    const words = nameText.trim().split(/\s+/);
    if (words.length > 1) {
      const last = words.pop();
      brandEl.innerHTML = `${words.join(' ')} <span class="clean-accent">${last}</span>`;
    } else {
      brandEl.innerHTML = `${nameText}`;
    }
  }
  const sloganEl = document.getElementById('headerBrandSlogan');
  if (sloganEl) sloganEl.textContent = sloganText;

  const addrEl = document.getElementById('headerLaundryAddress');
  if (addrEl) {
    addrEl.textContent = isSuper
      ? '☁️ Plataforma Global SaaS'
      : `📍 ${laundry.address || 'Sin dirección configurada'}`;
  }

  const phoneEl = document.getElementById('headerLaundryPhone');
  if (phoneEl) {
    phoneEl.textContent = isSuper
      ? '🏢 Modo Multi-Lavandería'
      : `📞 ${laundry.phone || 'Sin teléfono'}`;
  }

  const planBadge = document.getElementById('headerPlanBadge');
  const planBadgeTxt = document.getElementById('headerPlanBadgeText');
  if (planBadge && planBadgeTxt) {
    if (!isSuper && state.plan) {
      const days = laundry.daysRemaining !== undefined ? `${laundry.daysRemaining}d` : '';
      planBadgeTxt.textContent = `💳 ${state.plan.name}${days ? ` (${days})` : ''}`;
      planBadge.style.display = 'inline-flex';
    } else {
      planBadge.style.display = 'none';
    }
  }

  const drawerBrand = document.getElementById('drawerBrandName');
  if (drawerBrand) drawerBrand.textContent = nameText;
  const drawerLaundryLbl = document.getElementById('drawerActiveLaundryLabel');
  if (drawerLaundryLbl) drawerLaundryLbl.textContent = isSuper ? 'Plataforma Global SaaS' : (laundry.address || 'Lavandería Activa');
  const usersSectionLbl = document.getElementById('usersSectionLaundryName');
  if (usersSectionLbl) usersSectionLbl.textContent = nameText;

  if (user) {
    const initials = (user.full_name || user.username || 'U').trim().charAt(0).toUpperCase();
    const avatarEl = document.getElementById('drawerUserAvatar');
    if (avatarEl) avatarEl.textContent = initials;
    const dName = document.getElementById('drawerUserFullName');
    if (dName) dName.textContent = user.full_name;
    const dUser = document.getElementById('drawerUserUsername');
    if (dUser) dUser.textContent = `@${user.username}`;
    const dRole = document.getElementById('drawerUserRoleBadge');
    if (dRole) dRole.textContent = user.role_name;

    const hName = document.getElementById('headerUserNameLabel');
    if (hName) hName.textContent = user.full_name;
    const hRole = document.getElementById('headerUserRoleLabel');
    if (hRole) hRole.textContent = user.role_name;
  }

  const unread = Number(state.supportUnreadCount || 0);
  ['supportNavBadge', 'drawerSupportBadge'].forEach(id => {
    const b = document.getElementById(id);
    if (b) {
      b.textContent = unread;
      b.style.display = unread > 0 ? 'inline-block' : 'none';
    }
  });

  // Sync active laundry custom logo across all app views
  const activeLogo = getActiveLogoUrl();
  document.querySelectorAll('.tenant-logo-img').forEach(img => {
    if (img.getAttribute('src') !== activeLogo) {
      img.setAttribute('src', activeLogo);
    }
  });
}

function applyPermissionVisibility() {
  document.querySelectorAll('[data-perm]').forEach(el => {
    const allowed = hasPerm(el.getAttribute('data-perm'));
    el.style.display = allowed ? '' : 'none';
  });

  // Check if active tab is still allowed; if not, navigate to first allowed tab
  const currentTabBtn = document.querySelector(`.nav-tab[data-target="${state.activeTab}"]`);
  const currentAllowed = currentTabBtn && hasPerm(currentTabBtn.getAttribute('data-perm'));
  if (!currentAllowed) {
    const firstAllowed = Array.from(document.querySelectorAll('.nav-tab')).find(btn => hasPerm(btn.getAttribute('data-perm')));
    if (firstAllowed) {
      navigateToTab(firstAllowed.dataset.target);
    }
  }
}

function handleUnauthorizedSession() {
  state.authUser = null;
  state.permissions = new Set();
  state.laundry = null;
  document.body.classList.remove('authenticated', 'auth-checking');
  closeDrawer();
}

function openDrawer() {
  document.getElementById('appDrawer')?.classList.add('open');
  document.getElementById('drawerBackdrop')?.classList.add('open');
}

function closeDrawer() {
  document.getElementById('appDrawer')?.classList.remove('open');
  document.getElementById('drawerBackdrop')?.classList.remove('open');
}

function toggleDrawer() {
  const drawer = document.getElementById('appDrawer');
  if (drawer && drawer.classList.contains('open')) closeDrawer();
  else openDrawer();
}

// Format currency in Chilean Pesos (CLP)
function formatMoney(amount) {
  return '$' + Math.round(amount || 0).toLocaleString('es-CL');
}

// Format date to DD/MM/YYYY
function formatDate(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

// Local ISO Date helper YYYY-MM-DD (avoids UTC timezone shift)
function getLocalTodayISO(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Sanitize Chilean RUT WITHOUT dots (e.g. 12345678-9)
function sanitizeRut(val) {
  return String(val || '')
    .replace(/\./g, '')
    .replace(/[^0-9kK-]/g, '')
    .toUpperCase();
}

// Wire RUT inputs so dots are stripped immediately upon typing or pasting
function setupRutInputs() {
  const rutIds = ['clientRut', 'modalClientRut', 'settingsRut', 'modalLaundryRut'];
  rutIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const cleaned = sanitizeRut(e.target.value);
      if (e.target.value !== cleaned) {
        e.target.value = cleaned;
      }
    });
    el.addEventListener('blur', (e) => {
      let cleaned = sanitizeRut(e.target.value);
      // If user typed 7-9 digits/K without a hyphen, add hyphen before check digit (still zero dots!)
      if (cleaned && !cleaned.includes('-') && cleaned.length >= 7) {
        cleaned = cleaned.slice(0, -1) + '-' + cleaned.slice(-1);
      }
      e.target.value = cleaned;
    });
  });
}

function formatPaymentMethod(method) {
  const map = {
    EFECTIVO: '💵 Efectivo',
    DEBITO: '💳 Débito',
    CREDITO: '💳 Crédito',
    TRANSFERENCIA: '🏦 Transf.'
  };
  return map[method] || (method || '💵 Efectivo');
}

function getDeliveryUrgencyBadgeHtml(order) {
  if (!order || !order.delivery_date) return '';
  if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') return '';

  const today = getLocalTodayISO(0);
  const tomorrow = getLocalTodayISO(1);
  const twoDays = getLocalTodayISO(2);

  if (order.delivery_date < today) {
    return `<span class="delivery-urgency-badge urgency-overdue">⚠️ Atrasado</span>`;
  }
  if (order.delivery_date === today) {
    return `<span class="delivery-urgency-badge urgency-today">🔥 Entrega HOY</span>`;
  }
  if (order.delivery_date === tomorrow) {
    return `<span class="delivery-urgency-badge urgency-tomorrow">⏰ Mañana</span>`;
  }
  if (order.delivery_date <= twoDays) {
    return `<span class="delivery-urgency-badge urgency-tomorrow">📅 En 2 días</span>`;
  }
  return '';
}

// Toast notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '⚡' : '⚠️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Tag tenant logos so per-laundry logos update dynamically across the whole app
  document.querySelectorAll('.app-header img, .app-drawer img, main img').forEach(img => {
    if (!img.classList.contains('auth-logo')) img.classList.add('tenant-logo-img');
  });

  // 1. Setup UI & Event Listeners first so buttons always work immediately
  setupNavigation();
  setupDates();
  setupRutInputs();
  setupClientAutocomplete();
  setupSpecialServicesHandlers();
  setupOrderForm();
  setupClientModals();
  setupServiceModals();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeDrawer();
  });

  // 2. Authenticate session before loading tenant-scoped data
  await checkAuthAndInit();
});

async function checkAuthAndInit() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      handleUnauthorizedSession();
      return;
    }
    const payload = await res.json();
    await applyAuthSession(payload);
  } catch (err) {
    console.warn('Error verificando sesión:', err);
    handleUnauthorizedSession();
  } finally {
    document.body.classList.remove('auth-checking');
  }
}

async function applyAuthSession(payload) {
  state.authUser = payload.user;
  state.permissions = new Set(payload.permissions || []);
  state.laundry = payload.laundry || null;
  state.plan = payload.plan || null;
  state.supportUnreadCount = payload.supportUnreadCount || 0;
  state.config = payload.laundry ? { ...payload.laundry } : null;

  document.body.classList.add('authenticated');
  document.body.classList.remove('auth-checking');

  syncHeaderAndDrawerFromAuth();
  applyPermissionVisibility();

  await loadInitialTenantData();
}

async function loadInitialTenantData() {
  if (state.authUser?.is_superadmin) {
    // SuperAdmin NEVER calls tenant /api/config, /api/services or /api/stats!
    if (state.activeTab === 'saas-dashboard') await loadSaasDashboard();
    else if (state.activeTab === 'saas-businesses') await loadSaasDashboard();
    else if (state.activeTab === 'saas-platform') await loadSaasPlatform();
    else if (state.activeTab === 'soporte') await loadSupportTickets();
    return;
  }

  try {
    await loadConfig();
  } catch (err) {
    console.warn('No se pudo cargar la configuración:', err);
  }

  if (hasPerm('view_catalog|view_reception|create_orders')) {
    try {
      await loadServices();
    } catch (err) {
      console.warn('No se pudieron cargar los servicios:', err);
    }
  }

  try {
    await loadStats();
  } catch (err) {
    console.warn('No se pudieron cargar las estadísticas:', err);
  }

  if (state.activeTab === 'pedidos-list' && hasPerm('view_orders')) await loadOrders();
  else if (state.activeTab === 'clientes-list' && hasPerm('view_clients')) await loadClients();
  else if (state.activeTab === 'precios-catalog' && hasPerm('view_catalog')) renderPricesCatalog();
  else if (state.activeTab === 'gastos-list' && hasPerm('view_expenses')) await loadExpenses();
  else if (state.activeTab === 'reportes-ventas' && hasPerm('view_reports')) await loadSalesReport();
  else if (state.activeTab === 'usuarios-roles' && hasPerm('manage_users|manage_roles')) await loadUsersAndRoles();
  else if (state.activeTab === 'soporte' && hasPerm('manage_users')) await loadSupportTickets();
}

// Explicit global scope bindings for inline HTML handlers
window.toggleDrawer = toggleDrawer;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.navigateToTab = navigateToTab;
window.fillDemoCredentials = fillDemoCredentials;
window.submitLoginForm = submitLoginForm;
window.logoutUser = logoutUser;
window.switchUsersRolesSubTab = switchUsersRolesSubTab;
window.openUserModal = openUserModal;
window.openUserModalById = openUserModalById;
window.closeUserModal = closeUserModal;
window.saveUserModalSubmit = saveUserModalSubmit;
window.deleteUserById = deleteUserById;
window.openRoleModal = openRoleModal;
window.openRoleModalById = openRoleModalById;
window.closeRoleModal = closeRoleModal;
window.toggleAllRolePermissions = toggleAllRolePermissions;
window.saveRoleModalSubmit = saveRoleModalSubmit;
window.deleteRoleById = deleteRoleById;
window.openLaundryModal = openLaundryModal;
window.openLaundryModalById = openLaundryModalById;
window.closeLaundryModal = closeLaundryModal;
window.saveLaundryModalSubmit = saveLaundryModalSubmit;
window.generateRandomAdminPass = generateRandomAdminPass;
window.switchSaasBusinessesSubTab = switchSaasBusinessesSubTab;
window.switchSaasPlatformSubTab = switchSaasPlatformSubTab;
window.renderSaasBusinessesTable = renderSaasBusinessesTable;
window.clearSaasBizFilters = clearSaasBizFilters;
window.toggleLaundryStatus = toggleLaundryStatus;
window.openGraceModalById = openGraceModalById;
window.closeGraceModal = closeGraceModal;
window.grantGraceDaysSubmit = grantGraceDaysSubmit;
window.openDeleteLaundryModalById = openDeleteLaundryModalById;
window.closeDeleteLaundryModal = closeDeleteLaundryModal;
window.confirmDeleteLaundrySubmit = confirmDeleteLaundrySubmit;
window.renderSaasAuditTable = renderSaasAuditTable;
window.openPlanModal = openPlanModal;
window.openPlanModalById = openPlanModalById;
window.closePlanModal = closePlanModal;
window.savePlanModalSubmit = savePlanModalSubmit;
window.deletePlanById = deletePlanById;
window.openSaasAdminModal = openSaasAdminModal;
window.openSaasAdminModalById = openSaasAdminModalById;
window.closeSaasAdminModal = closeSaasAdminModal;
window.saveSaasAdminSubmit = saveSaasAdminSubmit;
window.publishAgreementSubmit = publishAgreementSubmit;
window.openSupportCreateModal = openSupportCreateModal;
window.closeSupportCreateModal = closeSupportCreateModal;
window.submitNewSupportTicket = submitNewSupportTicket;
window.openSupportTicketById = openSupportTicketById;
window.closeSupportTicketModal = closeSupportTicketModal;
window.sendSupportReply = sendSupportReply;
window.updateSupportTicketStatus = updateSupportTicketStatus;
window.toggleClientColumn = toggleClientColumn;
window.toggleClientsGridVisibility = toggleClientsGridVisibility;
window.loadClients = loadClients;
window.loadOrders = loadOrders;
window.onOrdersFilterChange = onOrdersFilterChange;
window.onOrdersLimitSelectChange = onOrdersLimitSelectChange;
window.changeOrdersPage = changeOrdersPage;
window.openClientModal = openClientModal;
window.openManageOrderModalById = openManageOrderModalById;
window.closeManageOrderModal = closeManageOrderModal;
window.onManageOrderStatusChange = onManageOrderStatusChange;
window.setManageOrderExitToday = setManageOrderExitToday;
window.saveManageOrderSubmit = saveManageOrderSubmit;
window.goToUpcomingOrders = goToUpcomingOrders;
window.filterPricesCatalog = filterPricesCatalog;
window.openServiceModal = openServiceModal;
window.openServiceModalById = openServiceModalById;
window.closeServiceModal = closeServiceModal;
window.saveServiceModalSubmit = saveServiceModalSubmit;
window.saveRowInline = saveRowInline;
window.openDeleteServiceModal = openDeleteServiceModal;
window.openDeleteServiceModalById = openDeleteServiceModalById;
window.closeDeleteServiceModal = closeDeleteServiceModal;
window.executeDeleteService = executeDeleteService;
window.checkCustomCategory = checkCustomCategory;
window.loadExpenses = loadExpenses;
window.openExpenseModal = openExpenseModal;
window.openExpenseModalById = openExpenseModalById;
window.closeExpenseModal = closeExpenseModal;
window.saveExpenseModalSubmit = saveExpenseModalSubmit;
window.openDeleteExpenseModalById = openDeleteExpenseModalById;
window.closeDeleteExpenseModal = closeDeleteExpenseModal;
window.executeDeleteExpense = executeDeleteExpense;
window.setReportPreset = setReportPreset;
window.onCustomDateChange = onCustomDateChange;
window.loadSalesReport = loadSalesReport;
window.exportSalesReportCSV = exportSalesReportCSV;
window.printSalesReport = printSalesReport;
window.filterReportTable = filterReportTable;
window.switchReportSubView = switchReportSubView;
window.setDetailPaymentMethod = setDetailPaymentMethod;
window.syncDetailPaymentMethodFilter = syncDetailPaymentMethodFilter;
window.openWhatsAppDebt = openWhatsAppDebt;
window.openWhatsAppReady = openWhatsAppReady;
window.filterTableByOverdue = filterTableByOverdue;
window.handleSettingsLogoFileChange = handleSettingsLogoFileChange;
window.resetLaundryLogoToDefault = resetLaundryLogoToDefault;
window.saveLaundrySettingsSubmit = saveLaundrySettingsSubmit;

function navigateToTab(targetId) {
  const tabs = document.querySelectorAll('.nav-tab');
  const drawerLinks = document.querySelectorAll('.drawer-link');
  const targetTabEl = document.querySelector(`.nav-tab[data-target="${targetId}"]`);
  if (targetTabEl && !hasPerm(targetTabEl.getAttribute('data-perm'))) {
    showToast('No tienes permisos para acceder a esta sección.', 'error');
    return;
  }

  tabs.forEach(t => t.classList.toggle('active', t.dataset.target === targetId));
  drawerLinks.forEach(d => d.classList.toggle('active', d.dataset.target === targetId));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const targetPane = document.getElementById(targetId);
  if (targetPane) {
    targetPane.classList.add('active');
    state.activeTab = targetId;

    if (targetId === 'pedidos-list') {
      loadOrders();
    } else if (targetId === 'clientes-list') {
      loadClients();
    } else if (targetId === 'precios-catalog') {
      renderPricesCatalog();
    } else if (targetId === 'gastos-list') {
      loadExpenses();
    } else if (targetId === 'reportes-ventas') {
      loadSalesReport();
    } else if (targetId === 'usuarios-roles') {
      loadUsersAndRoles();
    } else if (targetId === 'saas-dashboard' || targetId === 'saas-businesses') {
      loadSaasDashboard();
    } else if (targetId === 'saas-platform') {
      loadSaasPlatform();
    } else if (targetId === 'soporte') {
      loadSupportTickets();
    } else if (targetId === 'ajustes') {
      populateLaundrySettingsForm();
    }
  }

  closeDrawer();
}

// Setup Navigation Tabs
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      navigateToTab(tab.dataset.target);
    });
  });
}

// Setup Dates: Default reception = today, delivery = today + 3 days
function setupDates() {
  function toLocalISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const today = new Date();
  const receptionInput = document.getElementById('orderReceptionDate');
  const deliveryInput = document.getElementById('orderDeliveryDate');

  if (receptionInput) receptionInput.value = toLocalISO(today);

  const deliveryDate = new Date();
  deliveryDate.setDate(today.getDate() + 3);
  if (deliveryInput) deliveryInput.value = toLocalISO(deliveryDate);

  // Initialize Sales Report Dates (First day of month to today)
  const reportStart = document.getElementById('reportStartDate');
  const reportEnd = document.getElementById('reportEndDate');
  if (reportStart && reportEnd) {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    reportStart.value = toLocalISO(firstDay);
    reportEnd.value = toLocalISO(today);
  }
}

// Load Business Config & Next Folio
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.config = data;
    const folioBadge = document.getElementById('folioDisplay');
    if (folioBadge) {
      folioBadge.textContent = 'FOLIO Nº ' + data.nextFolio;
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

// Load Services Catalog
async function loadServices() {
  try {
    const res = await fetch('/api/services');
    state.services = await res.json();
    renderServicesCatalog();
  } catch (err) {
    console.error('Error loading services:', err);
  }
}

// Render Services in Two Columns (matching physical reception slip)
function renderServicesCatalog(filterText = '') {
  const col1 = document.getElementById('servicesCol1');
  const col2 = document.getElementById('servicesCol2');
  if (!col1 || !col2) return;

  col1.innerHTML = '';
  col2.innerHTML = '';

  const filtered = state.services.filter(s =>
    s.name.toLowerCase().includes(filterText.toLowerCase()) ||
    s.category.toLowerCase().includes(filterText.toLowerCase())
  );

  const midpoint = Math.ceil(filtered.length / 2);

  filtered.forEach((service, index) => {
    const qty = state.selectedItems[service.name]?.quantity || 0;
    const row = createServiceRow(service, qty);
    if (index < midpoint) {
      col1.appendChild(row);
    } else {
      col2.appendChild(row);
    }
  });
}

// Create a service item row
function createServiceRow(service, qty = 0) {
  const div = document.createElement('div');
  div.className = 'service-item-row';
  div.dataset.serviceName = service.name;

  div.innerHTML = `
    <div class="service-item-info">
      <div class="service-item-title">${service.name}</div>
      <div class="service-item-price">${formatMoney(service.default_price)}</div>
    </div>
    <div class="qty-control">
      <button type="button" class="btn-qty minus" data-name="${service.name}">-</button>
      <input type="number" min="0" class="qty-input" data-name="${service.name}" data-price="${service.default_price}" value="${qty}">
      <button type="button" class="btn-qty plus" data-name="${service.name}">+</button>
    </div>
  `;

  // Plus button
  div.querySelector('.btn-qty.plus').addEventListener('click', () => {
    changeServiceQty(service.name, service.default_price, 1);
  });

  // Minus button
  div.querySelector('.btn-qty.minus').addEventListener('click', () => {
    changeServiceQty(service.name, service.default_price, -1);
  });

  // Direct input change
  const input = div.querySelector('.qty-input');
  input.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    setServiceQty(service.name, service.default_price, isNaN(val) ? 0 : Math.max(0, val));
  });

  return div;
}

// Quantity Adjustments
function changeServiceQty(name, price, delta) {
  const current = state.selectedItems[name]?.quantity || 0;
  const newQty = Math.max(0, current + delta);
  setServiceQty(name, price, newQty);
}

function setServiceQty(name, price, qty) {
  if (qty > 0) {
    state.selectedItems[name] = {
      name,
      unit_price: price,
      quantity: qty
    };
  } else {
    delete state.selectedItems[name];
  }

  // Update input fields on screen
  document.querySelectorAll(`.qty-input[data-name="${name}"]`).forEach(inp => {
    inp.value = qty;
  });

  updateOrderSummary();
}

// Update the Floating Sidebar Summary
function updateOrderSummary() {
  const listContainer = document.getElementById('summaryItemsList');
  const totalAmountEl = document.getElementById('summaryTotalAmount');
  const countBadge = document.getElementById('summaryItemsCount');

  if (!listContainer || !totalAmountEl) return;

  const items = Object.values(state.selectedItems);
  listContainer.innerHTML = '';

  let grandTotal = 0;
  let totalQty = 0;

  if (items.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 1.5rem 0; font-size: 0.9rem;">
        ⚡ Selecciona las prendas del afiche para armar la guía.
      </div>
    `;
  } else {
    items.forEach(item => {
      const subtotal = item.quantity * item.unit_price;
      grandTotal += subtotal;
      totalQty += item.quantity;

      const row = document.createElement('div');
      row.className = 'summary-item-line';
      row.innerHTML = `
        <span class="summary-item-desc"><strong>${item.quantity}x</strong> ${item.name}</span>
        <span class="summary-item-subtotal">${formatMoney(subtotal)}</span>
      `;
      listContainer.appendChild(row);
    });
  }

  // Special services surcharge if any
  const specialCheckboxes = document.querySelectorAll('.special-checkbox-item input:checked');
  if (specialCheckboxes.length > 0) {
    const specialsTag = document.createElement('div');
    specialsTag.className = 'summary-item-line';
    const names = Array.from(specialCheckboxes).map(c => c.value).join(', ');
    specialsTag.innerHTML = `
      <span class="summary-item-desc" style="color: #0284c7; font-size: 0.8rem;">⭐ Especial: ${names}</span>
      <span class="summary-item-subtotal" style="color: #0284c7; font-size: 0.8rem;">Incluido</span>
    `;
    listContainer.appendChild(specialsTag);
  }

  totalAmountEl.textContent = formatMoney(grandTotal);
  if (countBadge) countBadge.textContent = `${totalQty} prendas`;
}

// Special services handlers
function setupSpecialServicesHandlers() {
  document.querySelectorAll('.special-checkbox-item input').forEach(box => {
    box.addEventListener('change', () => {
      updateOrderSummary();
    });
  });

  // Services search filter
  const searchInput = document.getElementById('servicesSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderServicesCatalog(e.target.value);
    });
  }

  // Add custom unlisted service modal/action
  const btnAddCustom = document.getElementById('btnAddCustomService');
  if (btnAddCustom) {
    btnAddCustom.addEventListener('click', () => {
      const name = prompt('Nombre de la prenda o servicio personalizado:');
      if (!name || !name.trim()) return;
      const priceStr = prompt(`Precio para "${name}":`, '3000');
      const price = parseFloat(priceStr) || 0;

      // Add to selected items immediately
      setServiceQty(name.trim(), price, 1);
      showToast(`Agregado: ${name} (${formatMoney(price)})`);
    });
  }
}

// Setup Client Autocomplete
function setupClientAutocomplete() {
  const nameInput = document.getElementById('clientName');
  const rutInput = document.getElementById('clientRut');
  const phoneInput = document.getElementById('clientPhone');
  const addressInput = document.getElementById('clientAddress');
  const suggestionsBox = document.getElementById('clientSuggestions');

  let debounceTimer;

  function doSearch(query) {
    clearTimeout(debounceTimer);
    if (!query || query.trim().length < 2) {
      if (suggestionsBox) suggestionsBox.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(query.trim())}`);
        const clients = await res.json();

        if (clients.length > 0 && suggestionsBox) {
          suggestionsBox.innerHTML = '';
          suggestionsBox.style.display = 'block';

          clients.forEach(c => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.style.padding = '0.5rem 0.75rem';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid #f1f5f9';
            item.style.fontSize = '0.85rem';
            const cleanRut = sanitizeRut(c.rut || '');
            const rutDisplay = cleanRut ? ` | RUT: <strong>${cleanRut}</strong>` : '';
            item.innerHTML = `<strong>${c.name}</strong>${rutDisplay} - 📞 ${c.phone || 'S/N'} <br><small style="color:#64748b;">${c.address || ''}</small>`;

            item.addEventListener('click', () => {
              nameInput.value = c.name;
              if (rutInput) rutInput.value = cleanRut;
              phoneInput.value = c.phone || '';
              addressInput.value = c.address || '';
              suggestionsBox.style.display = 'none';
              showToast(`Cliente seleccionado: ${c.name}`);
            });

            suggestionsBox.appendChild(item);
          });
        } else if (suggestionsBox) {
          suggestionsBox.style.display = 'none';
        }
      } catch (err) {
        console.error(err);
      }
    }, 250);
  }

  if (nameInput) nameInput.addEventListener('input', (e) => doSearch(e.target.value));
  if (rutInput) rutInput.addEventListener('input', (e) => doSearch(e.target.value));
  if (phoneInput) phoneInput.addEventListener('input', (e) => doSearch(e.target.value));

  document.addEventListener('click', (e) => {
    if (suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== nameInput && e.target !== rutInput && e.target !== phoneInput) {
      suggestionsBox.style.display = 'none';
    }
  });
}

// Order Form Submit
function setupOrderForm() {
  const form = document.getElementById('orderForm');
  const btnSaveOnly = document.getElementById('btnSaveOrder');
  const btnSavePrint = document.getElementById('btnSaveAndPrintOrder');

  async function submitOrder(andPrint = false) {
    const clientName = document.getElementById('clientName').value.trim();
    if (!clientName) {
      alert('Por favor ingrese el nombre del Cliente.');
      document.getElementById('clientName').focus();
      return;
    }

    const items = Object.values(state.selectedItems).map(item => ({
      service_name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price
    }));

    if (items.length === 0) {
      alert('Debe agregar al menos una prenda o servicio a la orden.');
      return;
    }

    const specialServices = Array.from(document.querySelectorAll('.special-checkbox-item input:checked')).map(c => c.value);

    const docType = document.querySelector('input[name="docType"]:checked')?.value || 'BOLETA';
    const paymentStatus = document.querySelector('input[name="paymentStatus"]:checked')?.value || 'PENDIENTE';
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || document.getElementById('paymentMethod')?.value || 'EFECTIVO';
    const clientRut = sanitizeRut(document.getElementById('clientRut')?.value || '');

    const payload = {
      client_name: clientName,
      client_rut: clientRut,
      client_phone: document.getElementById('clientPhone').value.trim(),
      client_address: document.getElementById('clientAddress').value.trim(),
      reception_date: document.getElementById('orderReceptionDate').value,
      delivery_date: document.getElementById('orderDeliveryDate').value,
      document_type: docType,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      special_services: specialServices,
      observations: document.getElementById('orderObservations').value.trim(),
      items: items
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar');
      }

      const createdOrder = await res.json();
      showToast(`¡Pedido guardado! Folio: ${createdOrder.folio}`);

      // Open print preview if requested
      if (andPrint) {
        openPrintModal(createdOrder);
      }

      // Reset Form
      resetOrderForm();
      await loadConfig();
      await loadStats();

    } catch (err) {
      alert('Error al guardar el pedido: ' + err.message);
    }
  }

  if (btnSaveOnly) {
    btnSaveOnly.addEventListener('click', (e) => {
      e.preventDefault();
      submitOrder(false);
    });
  }

  if (btnSavePrint) {
    btnSavePrint.addEventListener('click', (e) => {
      e.preventDefault();
      submitOrder(true);
    });
  }

  const btnReset = document.getElementById('btnResetForm');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('¿Desea limpiar el formulario actual?')) {
        resetOrderForm();
      }
    });
  }
}

// Reset Order Form
function resetOrderForm() {
  document.getElementById('clientName').value = '';
  const rutEl = document.getElementById('clientRut');
  if (rutEl) rutEl.value = '';
  document.getElementById('clientPhone').value = '';
  document.getElementById('clientAddress').value = '';
  document.getElementById('orderObservations').value = '';
  document.querySelectorAll('.special-checkbox-item input').forEach(c => c.checked = false);

  state.selectedItems = {};
  document.querySelectorAll('.qty-input').forEach(inp => inp.value = 0);
  const pendingRadio = document.querySelector('input[name="paymentStatus"][value="PENDIENTE"]');
  if (pendingRadio) pendingRadio.checked = true;
  const boletaRadio = document.querySelector('input[name="docType"][value="BOLETA"]');
  if (boletaRadio) boletaRadio.checked = true;
  const efectivoRadio = document.querySelector('input[name="paymentMethod"][value="EFECTIVO"]');
  if (efectivoRadio) efectivoRadio.checked = true;
  setupDates();
  updateOrderSummary();
}

// ----------------- ORDERS MANAGEMENT (TAB 2) -----------------
state.ordersPage = 1;
state.ordersTotalPages = 1;

function getOrdersLimitParam() {
  const select = document.getElementById('orderLimitSelect');
  const val = select ? select.value : '15';
  if (val === 'CUSTOM') {
    const customInput = document.getElementById('orderCustomLimitInput');
    const num = parseInt(customInput?.value, 10);
    return (num > 0) ? String(num) : '15';
  }
  return val || '15';
}

function onOrdersLimitSelectChange(val) {
  const customInput = document.getElementById('orderCustomLimitInput');
  if (customInput) {
    if (val === 'CUSTOM') {
      customInput.style.display = 'inline-block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
    }
  }
  state.ordersPage = 1;
  loadOrders();
}

function onOrdersFilterChange() {
  state.ordersPage = 1;
  loadOrders();
}

function changeOrdersPage(delta) {
  const next = state.ordersPage + delta;
  if (next < 1 || next > state.ordersTotalPages) return;
  state.ordersPage = next;
  loadOrders();
}

async function loadOrders() {
  const container = document.getElementById('ordersTableBody');
  const infoEl = document.getElementById('ordersPaginationInfo');
  const footerEl = document.getElementById('ordersPaginationFooter');
  const pageLabelEl = document.getElementById('ordersPageLabel');
  const prevBtn = document.getElementById('btnOrdersPrevPage');
  const nextBtn = document.getElementById('btnOrdersNextPage');

  if (!container) return;

  container.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">Cargando pedidos...</td></tr>';

  const statusFilter = document.getElementById('orderStatusFilter')?.value || 'TODOS';
  const methodFilter = document.getElementById('orderPaymentMethodFilter')?.value || 'TODOS';
  const searchFilter = document.getElementById('orderSearchInput')?.value || '';
  const limitParam = getOrdersLimitParam();

  try {
    let url = `/api/orders?paginated=1&page=${state.ordersPage}&limit=${encodeURIComponent(limitParam)}&status=${encodeURIComponent(statusFilter)}`;
    if (methodFilter && methodFilter !== 'TODOS') url += `&paymentMethod=${encodeURIComponent(methodFilter)}`;
    if (searchFilter) url += `&search=${encodeURIComponent(searchFilter)}`;

    const res = await fetch(url);
    const data = await res.json();
    const orders = Array.isArray(data) ? data : (data.orders || []);
    const total = Array.isArray(data) ? orders.length : (data.total || 0);
    const page = Array.isArray(data) ? 1 : (data.page || 1);
    const totalPages = Array.isArray(data) ? 1 : (data.totalPages || 1);
    const limitUsed = Array.isArray(data) ? orders.length : (data.limit || 15);

    state.ordersPage = page;
    state.ordersTotalPages = totalPages;

    if (infoEl) {
      if (total === 0) {
        infoEl.textContent = 'Mostrando 0 de 0 pedidos';
      } else {
        const startIdx = (limitParam === 'ALL') ? 1 : ((page - 1) * limitUsed) + 1;
        const endIdx = Math.min(startIdx + orders.length - 1, total);
        infoEl.textContent = `Mostrando ${startIdx}–${endIdx} de ${total} pedidos`;
      }
    }

    if (footerEl) {
      footerEl.style.display = (totalPages > 1) ? 'flex' : 'none';
    }
    if (pageLabelEl) {
      pageLabelEl.textContent = `Página ${page} de ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    if (orders.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem; color: #64748b;">
            No se encontraron pedidos con los filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = '';
    orders.forEach(order => {
      const tr = document.createElement('tr');
      const totalPrendas = order.items.reduce((acc, it) => acc + it.quantity, 0);
      const urgencyBadge = getDeliveryUrgencyBadgeHtml(order);
      const exitBadge = order.exit_date
        ? `<br><span class="exit-date-badge">🚪 Salida: ${formatDate(order.exit_date)}</span>`
        : '';
      const pm = order.payment_method || 'EFECTIVO';
      const rutLine = order.client_rut ? `<br><small style="color:#475569; font-family:monospace; white-space:nowrap;">RUT: ${sanitizeRut(order.client_rut)}</small>` : '';

      const canManageOrders = hasPerm('manage_orders');
      tr.innerHTML = `
        <td><strong style="color: #d90429; font-size: 1rem;">${order.folio}</strong></td>
        <td>
          <strong>${order.client_name}</strong>${rutLine}<br>
          <small style="color: #64748b; white-space:nowrap;">📞 ${order.client_phone || 'Sin fono'}</small>
        </td>
        <td>
          <small style="color:#64748b; white-space:nowrap;">📥 Recep: ${formatDate(order.reception_date)}</small><br>
          <small style="color: #0284c7; font-weight:700; white-space:nowrap;">📅 Entrega: ${formatDate(order.delivery_date)}</small>${urgencyBadge}${exitBadge}
        </td>
        <td><span class="status-pill status-${order.status}">${formatStatus(order.status)}</span></td>
        <td>
          <span style="font-weight: 800; white-space:nowrap; color: ${order.payment_status === 'PAGADO' ? '#15803d' : '#b45309'};">
            ${order.payment_status === 'PAGADO' ? '✅ PAGADO' : '⏳ PENDIENTE'}
          </span><br>
          <span class="payment-method-badge pm-${pm}">${formatPaymentMethod(pm)}</span>
          <small style="display:block; color:#64748b; margin-top:2px;">${order.document_type || 'BOLETA'}</small>
        </td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.2rem 0.5rem; border-radius:4px; font-weight:700;">${totalPrendas} prendas</span></td>
        <td><strong style="color: #0f172a; font-size: 1.05rem;">${formatMoney(order.total)}</strong></td>
        <td>
          <div class="table-actions">
            ${canManageOrders ? `<button type="button" class="btn btn-sm btn-primary btn-manage-order" title="Registrar fecha de salida, pago o medio de pago">⚙️ Salida / Pago</button>` : ''}
            <button type="button" class="btn btn-sm btn-outline btn-print-order" title="Imprimir Guía / Comprobante">🖨️ Ver/Imprimir</button>
            <button type="button" class="btn btn-sm btn-whatsapp btn-wa-order" title="Avisar por WhatsApp">📲 WhatsApp</button>
            <select class="status-select" ${canManageOrders ? '' : 'disabled title="Sin permiso para cambiar estado"'}>
              <option value="RECIBIDO" ${order.status === 'RECIBIDO' ? 'selected' : ''}>📥 Recibido</option>
              <option value="EN_LAVADO" ${order.status === 'EN_LAVADO' ? 'selected' : ''}>🧼 En Lavado</option>
              <option value="LISTO" ${order.status === 'LISTO' ? 'selected' : ''}>✅ Listo p/Retiro</option>
              <option value="ENTREGADO" ${order.status === 'ENTREGADO' ? 'selected' : ''}>📦 Entregado</option>
              <option value="CANCELADO" ${order.status === 'CANCELADO' ? 'selected' : ''}>❌ Cancelado</option>
            </select>
          </div>
        </td>
      `;

      // Status change listener
      const statusSelect = tr.querySelector('.status-select');
      if (statusSelect && canManageOrders) {
        statusSelect.addEventListener('change', async (e) => {
          await updateOrderStatus(order.id, e.target.value);
          loadOrders();
          loadStats();
        });
      }

      // Manage Order button (Exit date & payment)
      const manageBtn = tr.querySelector('.btn-manage-order');
      if (manageBtn) {
        manageBtn.addEventListener('click', () => {
          openManageOrderModal(order);
        });
      }

      // Print button
      tr.querySelector('.btn-print-order').addEventListener('click', () => {
        openPrintModal(order);
      });

      // WhatsApp button
      tr.querySelector('.btn-wa-order').addEventListener('click', () => {
        sendOrderWhatsApp(order);
      });

      container.appendChild(tr);
    });

  } catch (err) {
    console.error('Error loading orders:', err);
    container.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error al cargar pedidos: ${err.message}</td></tr>`;
  }
}

function formatStatus(status) {
  const map = {
    RECIBIDO: '📥 Recibido',
    EN_LAVADO: '🧼 En Lavado',
    LISTO: '✅ Listo Entrega',
    ENTREGADO: '📦 Entregado',
    CANCELADO: '❌ Cancelado'
  };
  return map[status] || status;
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      const data = await res.json();
      if (newStatus === 'ENTREGADO' && data.exit_date) {
        showToast(`📦 Entregado. Salida del local registrada: ${formatDate(data.exit_date)}`);
      } else {
        showToast(`Estado actualizado a: ${formatStatus(newStatus)}`);
      }
    }
  } catch (err) {
    alert('Error al actualizar estado: ' + err.message);
  }
}

async function openManageOrderModalById(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) throw new Error('Orden no encontrada');
    const order = await res.json();
    openManageOrderModal(order);
  } catch (err) {
    showToast('No se pudo cargar la orden: ' + err.message, 'error');
  }
}

function openManageOrderModal(order) {
  const modal = document.getElementById('manageOrderModal');
  if (!modal || !order) return;

  document.getElementById('manageOrderId').value = order.id;
  document.getElementById('manageOrderModalTitle').textContent = `⚙️ Orden Folio Nº ${order.folio}`;
  document.getElementById('manageOrderClientLabel').textContent = `${order.client_name}${order.client_rut ? ` (${sanitizeRut(order.client_rut)})` : ''}`;
  document.getElementById('manageOrderTotalLabel').textContent = formatMoney(order.total);
  document.getElementById('manageOrderStatus').value = order.status || 'RECIBIDO';
  document.getElementById('manageOrderDeliveryDate').value = order.delivery_date || '';
  document.getElementById('manageOrderExitDate').value = order.exit_date || '';
  document.getElementById('manageOrderPaymentStatus').value = order.payment_status || 'PENDIENTE';
  document.getElementById('manageOrderPaymentMethod').value = order.payment_method || 'EFECTIVO';

  modal.classList.add('open');
}

function closeManageOrderModal() {
  document.getElementById('manageOrderModal')?.classList.remove('open');
}

function onManageOrderStatusChange(newStatus) {
  const exitInput = document.getElementById('manageOrderExitDate');
  if (!exitInput) return;
  if (newStatus === 'ENTREGADO' && !exitInput.value) {
    exitInput.value = getLocalTodayISO(0);
  } else if (newStatus !== 'ENTREGADO') {
    exitInput.value = '';
  }
}

function setManageOrderExitToday() {
  const exitInput = document.getElementById('manageOrderExitDate');
  const statusSelect = document.getElementById('manageOrderStatus');
  if (exitInput) exitInput.value = getLocalTodayISO(0);
  if (statusSelect && statusSelect.value !== 'ENTREGADO') {
    statusSelect.value = 'ENTREGADO';
  }
}

async function saveManageOrderSubmit() {
  const orderId = document.getElementById('manageOrderId').value;
  if (!orderId) return;

  const status = document.getElementById('manageOrderStatus').value;
  const delivery_date = document.getElementById('manageOrderDeliveryDate').value;
  const exit_date = document.getElementById('manageOrderExitDate').value;
  const payment_status = document.getElementById('manageOrderPaymentStatus').value;
  const payment_method = document.getElementById('manageOrderPaymentMethod').value;

  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, delivery_date, exit_date, payment_status, payment_method })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al actualizar orden');
    }

    showToast('✅ Orden actualizada (Salida / Pago guardados)');
    closeManageOrderModal();
    if (state.activeTab === 'pedidos-list') loadOrders();
    if (state.activeTab === 'reportes-ventas') loadSalesReport();
    loadStats();
  } catch (err) {
    alert('Error al guardar cambios: ' + err.message);
  }
}

// WhatsApp Integration
function sendOrderWhatsApp(order) {
  if (!order.client_phone) {
    alert('Este pedido no tiene número de teléfono registrado.');
    return;
  }

  // Clean phone number (Chile prefix +569)
  let cleanPhone = order.client_phone.replace(/\D/g, '');
  if (cleanPhone.length === 9) {
    cleanPhone = '56' + cleanPhone;
  } else if (cleanPhone.length === 8) {
    cleanPhone = '569' + cleanPhone;
  }

  const message = `¡Hola ${order.client_name}! 🧼⚡ Le saludamos de *Lavandería Batery Clean*.\n\nLe informamos que su pedido *Folio #${order.folio}* ya se encuentra listo para retiro.\n\n👕 *Prendas:* ${order.items.map(i => `${i.quantity}x ${i.service_name}`).join(', ')}\n💰 *Total:* ${formatMoney(order.total)} (${order.payment_status})\n📍 *Dirección:* Calle Villa Alegre 603, Nacimiento\n\n¡Muchas gracias por su preferencia! ✨`;

  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

// ----------------- CLIENTS MANAGEMENT (TAB 3) -----------------
let clientPendingDelete = null;

// Grid & Columns Visibility Preferences
const clientGridPrefs = {
  gridVisible: true,
  columns: {
    'col-email': true,
    'col-rut': true,
    'col-orders': true,
    'col-address': false, // Dirección oculta por defecto
    'col-date': false     // Fecha de integración oculta por defecto
  }
};

function loadClientGridPrefs() {
  try {
    const saved = localStorage.getItem('batery_client_grid_prefs');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.columns) Object.assign(clientGridPrefs.columns, parsed.columns);
      if (typeof parsed.gridVisible === 'boolean') clientGridPrefs.gridVisible = parsed.gridVisible;
    }
  } catch (e) {}

  const emailCheck = document.getElementById('colToggleEmail');
  if (emailCheck) emailCheck.checked = clientGridPrefs.columns['col-email'];

  const rutCheck = document.getElementById('colToggleRut');
  if (rutCheck) rutCheck.checked = clientGridPrefs.columns['col-rut'];

  const ordersCheck = document.getElementById('colToggleOrders');
  if (ordersCheck) ordersCheck.checked = clientGridPrefs.columns['col-orders'];

  const addrCheck = document.getElementById('colToggleAddress');
  if (addrCheck) addrCheck.checked = clientGridPrefs.columns['col-address'];

  const dateCheck = document.getElementById('colToggleDate');
  if (dateCheck) dateCheck.checked = clientGridPrefs.columns['col-date'];

  for (const [colClass, isVisible] of Object.entries(clientGridPrefs.columns)) {
    applyColumnVisibility(colClass, isVisible);
  }

  applyGridVisibility(clientGridPrefs.gridVisible);
}

function saveClientGridPrefs() {
  try {
    localStorage.setItem('batery_client_grid_prefs', JSON.stringify(clientGridPrefs));
  } catch (e) {}
}

function isColHidden(colClass) {
  return clientGridPrefs.columns[colClass] ? '' : 'col-hidden';
}

function toggleClientColumn(colClass, isVisible) {
  clientGridPrefs.columns[colClass] = isVisible;
  applyColumnVisibility(colClass, isVisible);
  saveClientGridPrefs();
}

function applyColumnVisibility(colClass, isVisible) {
  document.querySelectorAll(`.${colClass}`).forEach(el => {
    if (isVisible) {
      el.classList.remove('col-hidden');
    } else {
      el.classList.add('col-hidden');
    }
  });
}

function toggleClientsGridVisibility(forceState = null) {
  const newState = forceState !== null ? forceState : !clientGridPrefs.gridVisible;
  clientGridPrefs.gridVisible = newState;
  applyGridVisibility(newState);
  saveClientGridPrefs();
}

function applyGridVisibility(isVisible) {
  const container = document.getElementById('clientsGridContainer');
  const toolbar = document.getElementById('gridColumnsToolbar');
  const notice = document.getElementById('clientsGridHiddenNotice');
  const btnText = document.getElementById('toggleGridBtnText');

  if (container) container.style.display = isVisible ? 'block' : 'none';
  if (toolbar) toolbar.style.display = isVisible ? 'flex' : 'none';
  if (notice) notice.style.display = isVisible ? 'none' : 'block';
  if (btnText) btnText.textContent = isVisible ? 'Ocultar Grilla' : 'Mostrar Grilla';
}

async function loadClients() {
  const container = document.getElementById('clientsTableBody');
  if (!container) return;

  const searchInput = document.getElementById('clientSearchInput');
  const query = searchInput ? searchInput.value.trim() : '';

  container.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">Cargando clientes...</td></tr>';

  try {
    let url = '/api/clients';
    if (query) {
      url += `?q=${encodeURIComponent(query)}`;
    }
    const res = await fetch(url);
    const clients = await res.json();

    if (clients.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 2.5rem; color: #64748b;">
            ${query ? `No se encontraron clientes para la búsqueda "${query}".` : 'No hay clientes registrados aún.'}
            <br>
            <button type="button" class="btn btn-sm btn-success" style="margin-top: 0.75rem;" onclick="openClientModal()">
              ➕ Registrar Primer Cliente
            </button>
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = '';
    clients.forEach(c => {
      const tr = document.createElement('tr');
      const orderCount = c.orders_count || 0;

      // Phone link (WhatsApp formatted)
      let phoneHtml = '<span style="color:#94a3b8;">Sin número</span>';
      if (c.phone) {
        let clean = c.phone.replace(/\D/g, '');
        if (clean.length === 9) clean = '56' + clean;
        else if (clean.length === 8) clean = '569' + clean;
        phoneHtml = `<a href="https://wa.me/${clean}" target="_blank" style="color:#0284c7; text-decoration:none; font-weight:600;" title="Abrir chat de WhatsApp">📞 ${c.phone} ↗</a>`;
      }

      // Email link
      let emailHtml = '<span style="color:#94a3b8;">-</span>';
      if (c.email) {
        emailHtml = `<a href="mailto:${c.email}" style="color:#0077e6; text-decoration:none; font-weight:600;" title="Enviar correo">✉️ ${c.email}</a>`;
      }

      tr.innerHTML = `
        <td class="col-name">
          <strong style="color:#071933; font-size:0.95rem;">${c.name}</strong>
          ${c.notes ? `<br><small style="color:#64748b; font-style:italic;">📝 ${c.notes}</small>` : ''}
        </td>
        <td class="col-phone">${phoneHtml}</td>
        <td class="col-email ${isColHidden('col-email')}">${emailHtml}</td>
        <td class="col-rut ${isColHidden('col-rut')}">${c.rut ? `<span style="font-family:monospace; font-weight:700;">${sanitizeRut(c.rut)}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
        <td class="col-orders ${isColHidden('col-orders')}">
          <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.25rem 0.6rem; border-radius:12px; font-weight:700; font-size:0.8rem;">
            ${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}
          </span>
        </td>
        <td class="col-address ${isColHidden('col-address')}">${c.address ? `<span>📍 ${c.address}</span>` : '<span style="color:#94a3b8;">Sin dirección</span>'}</td>
        <td class="col-date ${isColHidden('col-date')}"><small style="color:#64748b;">${c.created_at ? formatDate(c.created_at.split(' ')[0]) : '-'}</small></td>
        <td style="text-align: center;">
          <div class="table-actions">
            ${hasPerm('create_orders') ? `<button type="button" class="btn btn-sm btn-primary btn-new-order-client" title="Crear nueva Guía para este cliente">📝 Pedido</button>` : ''}
            ${hasPerm('manage_clients') ? `<button type="button" class="btn btn-sm btn-outline btn-edit-client" title="Editar datos del cliente">✏️ Editar</button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-client" title="Eliminar cliente del sistema">🗑️</button>` : ''}
          </div>
        </td>
      `;

      // 1. Create order for this client
      tr.querySelector('.btn-new-order-client')?.addEventListener('click', () => {
        navigateToTab('nueva-guia');
        document.getElementById('clientName').value = c.name;
        const rutEl = document.getElementById('clientRut');
        if (rutEl) rutEl.value = sanitizeRut(c.rut || '');
        document.getElementById('clientPhone').value = c.phone || '';
        document.getElementById('clientAddress').value = c.address || '';
        showToast(`Cliente "${c.name}" cargado en la Guía de Recepción`);
      });

      // 2. Edit Client
      tr.querySelector('.btn-edit-client')?.addEventListener('click', () => {
        openClientModal(c);
      });

      // 3. Delete Client
      tr.querySelector('.btn-delete-client')?.addEventListener('click', () => {
        openDeleteConfirmModal(c);
      });

      container.appendChild(tr);
    });

  } catch (err) {
    container.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
  }
}

// Client Modal (Create / Edit)
function openClientModal(client = null) {
  const modal = document.getElementById('clientFormModal');
  const titleEl = document.getElementById('clientModalTitle');
  const idInput = document.getElementById('modalClientId');
  const nameInput = document.getElementById('modalClientName');
  const phoneInput = document.getElementById('modalClientPhone');
  const emailInput = document.getElementById('modalClientEmail');
  const addressInput = document.getElementById('modalClientAddress');
  const rutInput = document.getElementById('modalClientRut');
  const notesInput = document.getElementById('modalClientNotes');

  if (!modal) return;

  if (client) {
    // Edit mode
    titleEl.textContent = `✏️ Editar Cliente: ${client.name}`;
    idInput.value = client.id;
    nameInput.value = client.name || '';
    phoneInput.value = client.phone || '';
    if (emailInput) emailInput.value = client.email || '';
    addressInput.value = client.address || '';
    rutInput.value = sanitizeRut(client.rut || '');
    notesInput.value = client.notes || '';
  } else {
    // Create mode
    titleEl.textContent = '➕ Nuevo Cliente';
    idInput.value = '';
    nameInput.value = '';
    phoneInput.value = '';
    if (emailInput) emailInput.value = '';
    addressInput.value = '';
    rutInput.value = '';
    notesInput.value = '';
  }

  modal.classList.add('open');
  setTimeout(() => nameInput.focus(), 100);
}

function closeClientModal() {
  const modal = document.getElementById('clientFormModal');
  if (modal) modal.classList.remove('open');
}

async function saveClientModal() {
  const id = document.getElementById('modalClientId').value;
  const name = document.getElementById('modalClientName').value.trim();
  const phone = document.getElementById('modalClientPhone').value.trim();
  const email = document.getElementById('modalClientEmail')?.value.trim() || '';
  const address = document.getElementById('modalClientAddress').value.trim();
  const rut = sanitizeRut(document.getElementById('modalClientRut').value);
  const notes = document.getElementById('modalClientNotes').value.trim();

  if (!name) {
    alert('Por favor ingrese el nombre del cliente.');
    document.getElementById('modalClientName').focus();
    return;
  }

  const payload = { name, phone, email, address, rut, notes };

  try {
    let res;
    if (id) {
      // Update existing
      res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      // Create new
      res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar cliente');
    }

    const saved = await res.json();
    showToast(id ? `Cliente "${name}" actualizado con éxito` : `Cliente "${name}" registrado con éxito`);
    closeClientModal();
    loadClients();
    loadStats();

  } catch (err) {
    alert('Error al guardar cliente: ' + err.message);
  }
}

// Delete Confirmation Modal
function openDeleteConfirmModal(client) {
  const modal = document.getElementById('deleteConfirmModal');
  const titleEl = document.getElementById('deleteConfirmTitle');
  const messageEl = document.getElementById('deleteConfirmMessage');
  const warningBox = document.getElementById('deleteWarningOrdersBox');
  const ordersCountEl = document.getElementById('deleteClientOrdersCount');

  if (!modal) return;

  clientPendingDelete = client;
  titleEl.textContent = `¿Eliminar a "${client.name}"?`;
  messageEl.innerHTML = `¿Estás seguro de que deseas eliminar permanentemente a <strong>${client.name}</strong> del directorio de clientes?`;

  const orderCount = client.orders_count || 0;
  if (orderCount > 0) {
    warningBox.style.display = 'block';
    ordersCountEl.textContent = orderCount;
  } else {
    warningBox.style.display = 'none';
  }

  modal.classList.add('open');
}

function closeDeleteConfirmModal() {
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.classList.remove('open');
  clientPendingDelete = null;
}

async function executeDeleteClient() {
  if (!clientPendingDelete) return;

  const clientId = clientPendingDelete.id;
  const clientName = clientPendingDelete.name;

  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al eliminar cliente');
    }

    const result = await res.json();
    showToast(`Cliente "${clientName}" eliminado.`);
    closeDeleteConfirmModal();
    loadClients();
    loadStats();

  } catch (err) {
    alert('Error al eliminar cliente: ' + err.message);
  }
}

// Setup Event Listeners for Client Modals
function setupClientModals() {
  // Initialize Column & Grid visibility preferences
  loadClientGridPrefs();

  // Toggle grid button
  document.getElementById('btnToggleClientsGrid')?.addEventListener('click', () => {
    toggleClientsGridVisibility();
  });

  // Open new client modal button
  document.getElementById('btnOpenNewClientModal')?.addEventListener('click', () => {
    openClientModal();
  });

  // Close client modal buttons
  document.getElementById('btnCloseClientModal')?.addEventListener('click', closeClientModal);
  document.getElementById('btnCancelClientModal')?.addEventListener('click', closeClientModal);

  // Save client modal button
  document.getElementById('btnSaveClientModal')?.addEventListener('click', saveClientModal);

  // Close delete modal buttons
  document.getElementById('btnCloseDeleteModal')?.addEventListener('click', closeDeleteConfirmModal);
  document.getElementById('btnCancelDeleteModal')?.addEventListener('click', closeDeleteConfirmModal);

  // Confirm delete action
  document.getElementById('btnConfirmDeleteAction')?.addEventListener('click', executeDeleteClient);

  // Submit on enter in client modal form
  document.getElementById('clientForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveClientModal();
  });
}

// ----------------- PRICES & CATALOG (TAB 4) -----------------
const STANDARD_CATEGORIES = [
  'Lavado General',
  'Prendas Básicas',
  'Hogar y Cama',
  'Abrigos y Casacas',
  'Trajes y Formal',
  'Vestuario',
  'Trabajo e Institucional',
  'Especiales',
  'Otros'
];

let servicePendingDelete = null;

function updateCategoryFilterOptions() {
  const catSelect = document.getElementById('catalogCategoryFilter');
  if (!catSelect) return;

  const currentVal = catSelect.value || 'TODAS';
  const customCats = state.services.map(s => s.category).filter(Boolean);
  const allCategories = Array.from(new Set([...STANDARD_CATEGORIES, ...customCats]));

  catSelect.innerHTML = '<option value="TODAS">📁 Todas las categorías</option>';
  allCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === currentVal) opt.selected = true;
    catSelect.appendChild(opt);
  });
}

function filterPricesCatalog() {
  renderPricesCatalog();
}

function renderPricesCatalog() {
  const container = document.getElementById('pricesTableBody');
  if (!container) return;

  updateCategoryFilterOptions();

  const searchInput = document.getElementById('catalogSearchInput');
  const catFilter = document.getElementById('catalogCategoryFilter');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const selectedCat = catFilter ? catFilter.value : 'TODAS';

  const filtered = state.services.filter(s => {
    const matchesQuery = !query || s.name.toLowerCase().includes(query) || (s.category && s.category.toLowerCase().includes(query));
    const matchesCat = selectedCat === 'TODAS' || s.category === selectedCat;
    return matchesQuery && matchesCat;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 2.5rem; color: #64748b;">
          No se encontraron prendas o servicios con el filtro aplicado.
          <br>
          <button type="button" class="btn btn-sm btn-success" style="margin-top: 0.75rem;" onclick="openServiceModal()">
            ➕ Agregar Nueva Prenda
          </button>
        </td>
      </tr>
    `;
    return;
  }

  const customCats = state.services.map(s => s.category).filter(Boolean);
  const allCategories = Array.from(new Set([...STANDARD_CATEGORIES, ...customCats]));

  container.innerHTML = '';
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.dataset.serviceId = s.id;

    // Build visible select options for categories
    const catOptionsHtml = allCategories.map(cat => 
      `<option value="${cat}" ${s.category === cat ? 'selected' : ''}>${cat}</option>`
    ).join('');

    const canManageCatalog = hasPerm('manage_catalog');
    const disAttr = canManageCatalog ? '' : 'disabled';

    tr.innerHTML = `
      <td>
        <input type="text" class="table-input service-name-input" value="${s.name}" style="font-weight: 700;" ${disAttr}>
      </td>
      <td>
        <select class="table-select service-category-select" style="font-weight: 600;" ${disAttr}>
          ${catOptionsHtml}
        </select>
      </td>
      <td>
        <div class="table-price-wrapper">
          <span class="table-currency-symbol">$</span>
          <input type="number" step="100" min="0" class="table-input service-price-input" value="${s.default_price}" ${disAttr}>
        </div>
      </td>
      <td style="text-align: center;">
        <div class="table-actions">
          ${canManageCatalog ? `
            <button type="button" class="btn btn-sm btn-primary" onclick="openServiceModalById(${s.id})" title="Editar prenda en ventana completa">
              ✏️ Editar
            </button>
            <button type="button" class="btn btn-sm btn-success" onclick="saveRowInline(${s.id})" title="Guardar cambios directos de esta fila">
              💾 Guardar
            </button>
            <button type="button" class="btn btn-sm btn-danger" onclick="openDeleteServiceModalById(${s.id})" title="Eliminar prenda del catálogo">
              🗑️
            </button>
          ` : '<span style="color:#64748b; font-size:0.8rem; font-weight:600;">🔒 Solo lectura</span>'}
        </div>
      </td>
    `;

    container.appendChild(tr);
  });
}

function openServiceModalById(id) {
  const service = state.services.find(s => s.id === Number(id));
  if (service) {
    openServiceModal(service);
  } else {
    alert('Prenda no encontrada.');
  }
}

async function saveRowInline(id) {
  const tr = document.querySelector(`tr[data-service-id="${id}"]`);
  if (!tr) return;

  const nameInput = tr.querySelector('.service-name-input');
  const catSelect = tr.querySelector('.service-category-select');
  const priceInput = tr.querySelector('.service-price-input');

  const name = nameInput ? nameInput.value.trim() : '';
  const category = catSelect ? catSelect.value : 'Otros';
  const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;

  if (!name) {
    alert('Por favor ingrese el nombre de la prenda.');
    if (nameInput) nameInput.focus();
    return;
  }

  await saveService(id, { name, category, default_price: price });
}

function openDeleteServiceModalById(id) {
  const service = state.services.find(s => s.id === Number(id));
  if (service) {
    openDeleteServiceModal(service);
  }
}

// Service Modal (Create / Edit)
function openServiceModal(service = null) {
  const modal = document.getElementById('serviceFormModal');
  const titleEl = document.getElementById('serviceModalTitle');
  const idInput = document.getElementById('modalServiceId');
  const nameInput = document.getElementById('modalServiceName');
  const catSelect = document.getElementById('modalServiceCategory');
  const customCatInput = document.getElementById('modalCustomCategoryInput');
  const priceInput = document.getElementById('modalServicePrice');

  if (!modal) return;

  if (customCatInput) {
    customCatInput.style.display = 'none';
    customCatInput.value = '';
  }

  // Populate categories in the modal select
  if (catSelect) {
    const customCats = state.services.map(s => s.category).filter(Boolean);
    const allCategories = Array.from(new Set([...STANDARD_CATEGORIES, ...customCats]));
    catSelect.innerHTML = allCategories.map(c => `<option value="${c}">${c}</option>`).join('') +
      '<option value="__custom__">➕ Escribir otra categoría personalizada...</option>';
  }

  if (service) {
    titleEl.textContent = `✏️ Editar Prenda: ${service.name}`;
    idInput.value = service.id;
    nameInput.value = service.name || '';
    if (catSelect) catSelect.value = service.category || 'Lavado General';
    priceInput.value = service.default_price || 0;
  } else {
    titleEl.textContent = '➕ Nueva Prenda o Servicio';
    idInput.value = '';
    nameInput.value = '';
    if (catSelect) catSelect.value = 'Lavado General';
    priceInput.value = 3000;
  }

  modal.classList.add('open');
  setTimeout(() => nameInput.focus(), 100);
}

function closeServiceModal() {
  const modal = document.getElementById('serviceFormModal');
  if (modal) modal.classList.remove('open');
}

function checkCustomCategory(val) {
  const customInput = document.getElementById('modalCustomCategoryInput');
  if (!customInput) return;
  if (val === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

async function saveServiceModalSubmit() {
  const id = document.getElementById('modalServiceId').value;
  const name = document.getElementById('modalServiceName').value.trim();
  const catSelect = document.getElementById('modalServiceCategory');
  const customCatInput = document.getElementById('modalCustomCategoryInput');
  const price = parseFloat(document.getElementById('modalServicePrice').value) || 0;

  if (!name) {
    alert('Por favor ingrese el nombre de la prenda o servicio.');
    document.getElementById('modalServiceName').focus();
    return;
  }

  let category = catSelect ? catSelect.value : 'Otros';
  if (category === '__custom__') {
    category = customCatInput && customCatInput.value.trim() ? customCatInput.value.trim() : 'Otros';
  }

  await saveService(id ? Number(id) : null, { name, category, default_price: price });
}

async function saveService(serviceId, payload) {
  if (!payload.name) {
    alert('Por favor ingrese el nombre de la prenda o servicio.');
    return;
  }

  try {
    let res;
    if (serviceId) {
      res = await fetch(`/api/services/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar el servicio');
    }

    showToast(serviceId ? `Prenda "${payload.name}" actualizada con éxito` : `Prenda "${payload.name}" agregada al catálogo`);
    await loadServices();
    renderPricesCatalog();
    renderServicesCatalog(); // Synchronizes the order reception flyer view!
    closeServiceModal();

  } catch (err) {
    alert('Error al guardar: ' + err.message);
  }
}

// Delete Service Modal
function openDeleteServiceModal(service) {
  const modal = document.getElementById('deleteServiceModal');
  const titleEl = document.getElementById('deleteServiceConfirmTitle');
  const messageEl = document.getElementById('deleteServiceConfirmMessage');

  if (!modal) return;

  servicePendingDelete = service;
  titleEl.textContent = `¿Eliminar "${service.name}"?`;
  messageEl.innerHTML = `¿Estás seguro de que deseas eliminar permanentemente <strong>${service.name}</strong> del catálogo?<br><small style="color:#64748b;">Los pedidos anteriores que contengan esta prenda conservarán su detalle.</small>`;

  modal.classList.add('open');
}

function closeDeleteServiceModal() {
  const modal = document.getElementById('deleteServiceModal');
  if (modal) modal.classList.remove('open');
  servicePendingDelete = null;
}

async function executeDeleteService() {
  if (!servicePendingDelete) return;

  const serviceId = servicePendingDelete.id;
  const serviceName = servicePendingDelete.name;

  try {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al eliminar el servicio');
    }

    showToast(`Prenda "${serviceName}" eliminada del catálogo.`);
    closeDeleteServiceModal();
    await loadServices();
    renderPricesCatalog();
    renderServicesCatalog();

  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// Setup Event Listeners for Service Modals
function setupServiceModals() {
  document.getElementById('btnOpenNewServiceModal')?.addEventListener('click', () => {
    openServiceModal();
  });

  document.getElementById('btnCloseServiceModal')?.addEventListener('click', closeServiceModal);
  document.getElementById('btnCancelServiceModal')?.addEventListener('click', closeServiceModal);
  document.getElementById('btnSaveServiceModal')?.addEventListener('click', saveServiceModalSubmit);

  document.getElementById('serviceForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveServiceModalSubmit();
  });

  document.getElementById('btnCloseDeleteServiceModal')?.addEventListener('click', closeDeleteServiceModal);
  document.getElementById('btnCancelDeleteServiceModal')?.addEventListener('click', closeDeleteServiceModal);
  document.getElementById('btnConfirmDeleteServiceAction')?.addEventListener('click', executeDeleteService);
}

// ----------------- MOBILE & NETWORK INFO (TAB 5) -----------------
async function loadMobileNetworkInfo() {
  const infoContainer = document.getElementById('mobileUrlsContainer');
  if (!infoContainer) return;

  try {
    const res = await fetch('/api/network-info');
    state.networkInfo = await res.json();

    infoContainer.innerHTML = '';
    if (state.networkInfo.ips.length === 0) {
      infoContainer.innerHTML = `
        <div style="background:#fee2e2; padding:1rem; border-radius:8px; color:#991b1b;">
          ⚠️ No se detectó ninguna conexión Wi-Fi o de red activa en este computador.
        </div>
      `;
    } else {
      state.networkInfo.ips.forEach(item => {
        const url = `http://${item.ip}:${state.networkInfo.port}`;
        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.border = '2px solid #00d2ff';
        card.style.borderRadius = '12px';
        card.style.padding = '1.25rem';
        card.style.marginBottom = '1rem';
        card.style.boxShadow = '0 4px 15px rgba(0, 210, 255, 0.15)';

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <span style="font-size:0.8rem; font-weight:700; color:#0284c7; text-transform:uppercase;">Interfaz: ${item.interface}</span>
              <h3 style="font-size:1.3rem; color:#071933; margin:0.3rem 0;">${url}</h3>
              <p style="font-size:0.85rem; color:#64748b;">
                Abre esta dirección en el navegador Chrome o Safari de tu celular conectado a la misma red Wi-Fi de la lavandería.
              </p>
            </div>
            <div>
              <a href="${url}" target="_blank" class="btn btn-primary" style="font-size:0.9rem;">Abrir en Celular</a>
            </div>
          </div>
        `;
        infoContainer.appendChild(card);
      });
    }

  } catch (err) {
    console.error('Error loading network info:', err);
  }
}

// ----------------- DASHBOARD STATS -----------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    const todayOrdersEl = document.getElementById('statTodayOrders');
    const todayRevenueEl = document.getElementById('statTodayRevenue');
    const pendingOrdersEl = document.getElementById('statPendingOrders');
    const totalClientsEl = document.getElementById('statTotalClients');

    if (todayOrdersEl) todayOrdersEl.textContent = stats.todayOrders;
    if (todayRevenueEl) todayRevenueEl.textContent = formatMoney(stats.todayRevenue);
    if (pendingOrdersEl) pendingOrdersEl.textContent = stats.pendingCount;
    if (totalClientsEl) totalClientsEl.textContent = stats.totalClients;

    // Update pending badge in header/nav & hamburger drawer
    const badge = document.getElementById('pendingNavBadge');
    if (badge) {
      badge.textContent = stats.pendingCount;
      badge.style.display = stats.pendingCount > 0 ? 'inline-block' : 'none';
    }
    const drawerBadge = document.getElementById('drawerPendingBadge');
    if (drawerBadge) {
      drawerBadge.textContent = stats.pendingCount;
      drawerBadge.style.display = stats.pendingCount > 0 ? 'inline-block' : 'none';
    }

    // Render Upcoming / Overdue Deliveries Alert Banner
    renderUpcomingAlertsBanner(stats);

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function renderUpcomingAlertsBanner(stats) {
  const banner = document.getElementById('upcomingDeliveriesBanner');
  if (!banner) return;

  const list = stats.upcomingDeliveries || [];
  const summary = stats.upcomingSummary || {};

  if (list.length === 0) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const hasOverdue = (summary.overdueCount || 0) > 0;
  banner.classList.toggle('has-overdue', hasOverdue);
  banner.style.display = 'flex';

  const parts = [];
  if (summary.overdueCount > 0) parts.push(`<strong>${summary.overdueCount} atrasada(s)</strong>`);
  if (summary.todayCount > 0) parts.push(`<strong>${summary.todayCount} para HOY</strong>`);
  if (summary.tomorrowCount > 0) parts.push(`<strong>${summary.tomorrowCount} para mañana</strong>`);
  if (summary.upcomingCount > 0) parts.push(`<strong>${summary.upcomingCount} en 2 días</strong>`);

  const chipsHtml = list.slice(0, 8).map(o => {
    let chipCls = 'chip-tomorrow';
    let tag = '📅 Próx.';
    if (o.urgency === 'OVERDUE') { chipCls = 'chip-overdue'; tag = '⚠️ Atrasado'; }
    else if (o.urgency === 'TODAY') { chipCls = 'chip-today'; tag = '🔥 HOY'; }
    else if (o.urgency === 'TOMORROW') { chipCls = 'chip-tomorrow'; tag = '⏰ Mañana'; }

    return `
      <button type="button" class="upcoming-chip ${chipCls}" onclick="openManageOrderModalById(${o.id})" title="Clic para gestionar salida o pago de Folio ${o.folio}">
        <span>${tag}</span>
        <strong>#${o.folio}</strong>
        <span>${o.client_name}</span>
        <small style="opacity:0.8;">(${formatDate(o.delivery_date)})</small>
      </button>
    `;
  }).join('');

  const extraCount = list.length > 8 ? `<span style="font-size:0.8rem; font-weight:700; color:#92400e;">+${list.length - 8} más...</span>` : '';

  banner.innerHTML = `
    <div class="upcoming-alerts-top">
      <div class="upcoming-alerts-title">
        <span style="font-size: 1.25rem;">${hasOverdue ? '🚨' : '⏰'}</span>
        <span>Entregas Más Próximas (${list.length}): ${parts.join(' • ')}</span>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button type="button" class="btn btn-sm ${hasOverdue ? 'btn-danger' : 'btn-primary'}" onclick="goToUpcomingOrders()">
          🔍 Filtrar solo Próximas / Atrasadas
        </button>
      </div>
    </div>
    <div class="upcoming-alerts-chips">
      ${chipsHtml}
      ${extraCount}
    </div>
  `;
}

function goToUpcomingOrders() {
  const pedidosTab = document.querySelector('.nav-tab[data-target="pedidos-list"]');
  const statusSelect = document.getElementById('orderStatusFilter');
  if (statusSelect) statusSelect.value = 'PROXIMAS';
  state.ordersPage = 1;
  if (state.activeTab === 'pedidos-list') {
    loadOrders();
  } else if (pedidosTab) {
    pedidosTab.click();
  }
}

// ----------------- PRINT RECEIPT MODAL (FLYER REPLICA) -----------------
function openPrintModal(order) {
  const modal = document.getElementById('printReceiptModal');
  const content = document.getElementById('receiptPrintContent');
  if (!modal || !content) return;

  const config = state.config || {};
  const specialList = order.special_services && order.special_services.length > 0
    ? order.special_services.join(', ')
    : 'Ninguno';

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="width: 50px; text-align: center; font-weight: 800;">${item.quantity}</td>
      <td style="font-weight: 600;">${item.service_name}</td>
      <td style="width: 100px; text-align: right; font-weight: 800;">${formatMoney(item.subtotal)}</td>
    </tr>
  `).join('');

  const cleanRut = sanitizeRut(order.client_rut || '');
  const exitDateRow = order.exit_date
    ? `<div class="receipt-client-row" style="grid-column: span 2; background: #f0fdf4; padding: 2px 6px; border-radius: 4px;">
         <strong>🚪 Fecha Salida del Local:</strong>
         <span style="font-weight: 800; color: #15803d;">${formatDate(order.exit_date)}</span>
       </div>`
    : '';

  const biz = order.business_config || state.laundry || state.config || {};
  const bizName = biz.name || 'LAVANDERÍA BATERY CLEAN';
  const bizSlogan = biz.slogan || 'Lavado de Alta Energía';
  const bizAddress = biz.address || '';
  const bizPhone = biz.phone || '';
  const bizInsta = biz.instagram ? ` | 📸 @${biz.instagram.replace(/^@/, '')}` : '';
  const bizLogo = biz.logo_url || getActiveLogoUrl();
  const termsLines = (biz.terms || '').trim()
    ? biz.terms.split('\n').map(line => line.trim()).filter(Boolean)
    : [
      '1. La ropa se recibe en buen estado, y se entrega en el mismo estado, salvo desgaste normal por el proceso de lavado y secado.',
      '2. No nos hacemos responsables por prendas de valor, dinero u objetos olvidados en las prendas.',
      '3. En caso de pérdida o daño, se hará el reembolso del valor de la prenda, según su depreciación.',
      '4. El cliente deberá revisar su ropa al momento de la entrega.',
      '5. Este comprobante es su respaldo de recepción.'
    ];
  const termsHtml = termsLines.map(line => `<div>${line}</div>`).join('');

  content.innerHTML = `
    <div class="receipt-paper">
      <!-- Flyer Header -->
      <div class="receipt-header">
        <div class="receipt-brand">
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:4px;">
            <img src="${bizLogo}" alt="${bizName}" style="height:58px; width:auto; max-width:82px; object-fit:contain; border-radius:6px;">
            <div>
              <h2 style="margin:0; line-height:1.1; font-size:1.25rem; color:#004b93; font-weight:900;">${bizName}</h2>
              <p style="margin:2px 0 0; font-weight:bold; color:#0056b3; font-size:0.75rem;">⚡ ${bizSlogan} ⚡</p>
            </div>
          </div>
          ${bizAddress ? `<p style="font-size:0.75rem; margin:2px 0;">📍 ${bizAddress}</p>` : ''}
          <p style="font-size:0.75rem; margin:2px 0;">📞 ${bizPhone || 'Sin teléfono'}${bizInsta}</p>
        </div>

        <div style="text-align:right;">
          <h3 style="font-size:1.1rem; color:#004b93; margin:0 0 4px 0; font-weight:900;">GUÍA DE RECEPCIÓN</h3>
          <p style="font-size:0.75rem; color:#666; margin:0 0 6px 0;">(No es Boleta)</p>
          <div class="receipt-folio-box">
            <span>FOLIO Nº:</span>
            <strong>${order.folio}</strong>
          </div>
        </div>
      </div>

      <!-- Customer & Date Meta Grid -->
      <div class="receipt-client-grid">
        <div class="receipt-client-row">
          <strong>Fecha Recepción:</strong>
          <span>${formatDate(order.reception_date)}</span>
        </div>
        <div class="receipt-client-row">
          <strong>Fecha Entrega Est.:</strong>
          <span>${formatDate(order.delivery_date)}</span>
        </div>
        ${exitDateRow}
        <div class="receipt-client-row">
          <strong>Cliente:</strong>
          <span style="font-weight:700; text-transform:uppercase;">${order.client_name}</span>
        </div>
        <div class="receipt-client-row">
          <strong>RUT:</strong>
          <span style="font-family:monospace; font-weight:700;">${cleanRut || 'No registrado'}</span>
        </div>
        <div class="receipt-client-row">
          <strong>Dirección:</strong>
          <span>${order.client_address || 'No registrada'}</span>
        </div>
        <div class="receipt-client-row">
          <strong>Fono:</strong>
          <span>${order.client_phone || 'No registrado'}</span>
        </div>
        <div class="receipt-client-row" style="grid-column: span 2;">
          <strong>Documento:</strong>
          <span style="background:#e0f2fe; padding:1px 6px; border-radius:4px; font-weight:700; font-size:0.75rem;">
            ${order.document_type || 'BOLETA'}
          </span>
          <span style="margin-left: 0.75rem; font-weight:700;">Pago:</span>
          <span style="color:${order.payment_status === 'PAGADO' ? '#15803d' : '#b45309'}; font-weight:bold;">
            ${order.payment_status}
          </span>
          <span style="margin-left: 0.5rem; font-size:0.75rem; color:#334155;">(${formatPaymentMethod(order.payment_method)})</span>
        </div>
      </div>

      <!-- Itemized Services Table -->
      <table class="receipt-table">
        <thead>
          <tr>
            <th style="width: 50px; text-align: center;">Nº</th>
            <th>SERVICIOS</th>
            <th style="width: 100px; text-align: right;">$</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Special Services -->
      <div class="receipt-specials">
        <strong>★ SERVICIO ESPECIAL:</strong> ${specialList}
      </div>

      <!-- Observations -->
      <div class="receipt-obs">
        <strong style="color:#004b93;">OBSERVACIONES:</strong>
        <p style="margin: 3px 0 0 0; color:#333;">${order.observations || 'Sin observaciones particulares.'}</p>
      </div>

      <!-- Total -->
      <div class="receipt-total-bar">
        <span>TOTAL $</span>
        <span>${formatMoney(order.total)}</span>
      </div>

      <!-- Terms & Conditions -->
      <div class="receipt-terms">
        <strong style="display:block; text-align:center; font-size:0.75rem; margin-bottom:3px; color:#004b93;">TÉRMINOS Y CONDICIONES</strong>
        ${termsHtml}
      </div>

      <div class="receipt-footer-slogan">
        ¡Gracias por su preferencia! ⚡🧼
      </div>
    </div>
  `;

  modal.classList.add('open');
}

// Modal controls
document.getElementById('btnClosePrintModal')?.addEventListener('click', () => {
  document.getElementById('printReceiptModal')?.classList.remove('open');
});

document.getElementById('btnPrintReceiptAction')?.addEventListener('click', () => {
  window.print();
});

// ==========================================================================
// SALES REPORTS & ANALYTICS
// ==========================================================================

state.lastReportData = null;

function setReportPreset(preset) {
  function toLocalISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const today = new Date();
  let startStr = '';
  let endStr = '';

  document.querySelectorAll('.preset-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === preset);
  });

  if (preset === 'today') {
    startStr = toLocalISO(today);
    endStr = toLocalISO(today);
  } else if (preset === 'this-week') {
    const currentDay = today.getDay();
    const distanceToMonday = (currentDay + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday);
    startStr = toLocalISO(monday);
    endStr = toLocalISO(today);
  } else if (preset === 'this-month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startStr = toLocalISO(firstDay);
    endStr = toLocalISO(today);
  } else if (preset === 'last-month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    startStr = toLocalISO(firstDay);
    endStr = toLocalISO(lastDay);
  } else if (preset === 'this-year') {
    startStr = `${today.getFullYear()}-01-01`;
    endStr = toLocalISO(today);
  } else if (preset === 'all') {
    startStr = '';
    endStr = '';
  }

  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  if (startInput) startInput.value = startStr;
  if (endInput) endInput.value = endStr;

  loadSalesReport();
}

function onCustomDateChange() {
  document.querySelectorAll('.preset-pill').forEach(btn => btn.classList.remove('active'));
  loadSalesReport();
}

function switchReportSubView(viewKey) {
  document.querySelectorAll('.report-subnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.reportView === viewKey);
  });
  document.querySelectorAll('.report-view-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `reportSubView-${viewKey}`);
  });
}

function openWhatsAppDebt(phone, clientName, folios, amount) {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    showToast('El cliente no tiene teléfono registrado.', 'error');
    return;
  }
  if (!cleanPhone.startsWith('56')) {
    cleanPhone = '56' + cleanPhone;
  }
  const msg = `Hola ${clientName}, te saludamos de Lavandería Batery Clean 🧺. Te recordamos cordialmente que tienes un saldo pendiente de ${formatMoney(amount)} correspondiente a la(s) orden(es) ${folios}. ¿Nos confirmas si deseas pagar por transferencia o en el local? ¡Muchas gracias!`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function openWhatsAppReady(phone, clientName, folio) {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone) {
    showToast('El cliente no tiene teléfono registrado.', 'error');
    return;
  }
  if (!cleanPhone.startsWith('56')) {
    cleanPhone = '56' + cleanPhone;
  }
  const msg = `¡Hola ${clientName}! 👋 Te avisamos con alegría que tus prendas del pedido Folio Nº ${folio} ya están lavadas y listas para entrega en Lavandería Batery Clean 🧺✨. Puedes pasar a retirarlas en Calle Villa Alegre 603, Nacimiento. ¡Te esperamos!`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function filterTableByOverdue() {
  goToUpcomingOrders();
}

function setDetailPaymentMethod(method) {
  const select = document.getElementById('reportPaymentMethod');
  if (select) select.value = method;
  document.querySelectorAll('#detailPaymentMethodPills .method-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  loadSalesReport();
}

function syncDetailPaymentMethodFilter(method) {
  document.querySelectorAll('#detailPaymentMethodPills .method-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });
  loadSalesReport();
}

async function loadSalesReport() {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const paymentSelect = document.getElementById('reportPaymentStatus');
  const methodSelect = document.getElementById('reportPaymentMethod');
  const docSelect = document.getElementById('reportDocType');

  const startDate = startInput ? startInput.value : '';
  const endDate = endInput ? endInput.value : '';
  const paymentStatus = paymentSelect ? paymentSelect.value : 'TODOS';
  const paymentMethod = methodSelect ? methodSelect.value : 'TODOS';
  const documentType = docSelect ? docSelect.value : 'TODOS';

  // Keep detail pills synced with top dropdown
  document.querySelectorAll('#detailPaymentMethodPills .method-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === paymentMethod);
  });

  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (paymentStatus && paymentStatus !== 'TODOS') params.append('paymentStatus', paymentStatus);
  if (paymentMethod && paymentMethod !== 'TODOS') params.append('paymentMethod', paymentMethod);
  if (documentType && documentType !== 'TODOS') params.append('documentType', documentType);

  try {
    const res = await fetch(`/api/reports/sales?${params.toString()}`);
    const data = await res.json();
    state.lastReportData = data;

    const s = data.summary || {};
    const totalRev = s.totalRevenue || 0;
    const paidRev = s.paidRevenue || 0;
    const pendingRev = s.pendingRevenue || 0;
    const totalExp = s.totalExpenses || 0;
    const netProf = s.netProfit || 0;

    // 1. Update Financial KPIs (View 1)
    const elTotalRev = document.getElementById('kpiTotalRevenue');
    const elTotalOrders = document.getElementById('kpiTotalOrders');
    const elTotalExpenses = document.getElementById('kpiTotalExpenses');
    const elExpensesCount = document.getElementById('kpiExpensesCount');
    const elNetProfit = document.getElementById('kpiNetProfit');
    const elProfitMargin = document.getElementById('kpiProfitMargin');
    const elPaidRev = document.getElementById('kpiPaidRevenue');
    const elPaidPct = document.getElementById('kpiPaidPercent');
    const elPendingRev = document.getElementById('kpiPendingRevenue');
    const elPendingPct = document.getElementById('kpiPendingPercent');

    if (elTotalRev) elTotalRev.textContent = formatMoney(totalRev);
    if (elTotalOrders) elTotalOrders.textContent = `${s.totalOrders || 0} ped. • Prom: ${formatMoney(s.averageTicket || 0)}`;
    if (elTotalExpenses) elTotalExpenses.textContent = formatMoney(totalExp);
    if (elExpensesCount) elExpensesCount.textContent = `${s.expensesCount || 0} compras registradas`;
    if (elNetProfit) elNetProfit.textContent = formatMoney(netProf);

    if (elProfitMargin) {
      elProfitMargin.textContent = `${s.profitMargin >= 0 ? '+' : ''}${s.profitMargin || 0}% margen`;
      elProfitMargin.className = `profit-badge ${netProf >= 0 ? 'positive' : 'negative'}`;
    }

    if (elPaidRev) elPaidRev.textContent = formatMoney(paidRev);
    const paidPct = totalRev > 0 ? Math.round((paidRev / totalRev) * 100) : 0;
    if (elPaidPct) elPaidPct.textContent = `${paidPct}% del total`;

    if (elPendingRev) elPendingRev.textContent = formatMoney(pendingRev);
    const pendingPct = totalRev > 0 ? Math.round((pendingRev / totalRev) * 100) : 0;
    if (elPendingPct) elPendingPct.textContent = `${pendingPct}% pendiente`;

    // 2. Update Garments KPIs (View 2)
    const elPrendasTotal = document.getElementById('kpiPrendasTotal');
    const elPrendasAvgTicket = document.getElementById('kpiPrendasAvgTicket');
    const elPrendasAvgItem = document.getElementById('kpiPrendasAvgItem');

    if (elPrendasTotal) elPrendasTotal.textContent = `${s.totalItems || 0} prendas`;
    if (elPrendasAvgTicket) elPrendasAvgTicket.textContent = formatMoney(s.averageTicket || 0);
    if (elPrendasAvgItem) elPrendasAvgItem.textContent = formatMoney(s.averageItemPrice || 0);

    // 3. Render Financial Timeline & Breakdowns
    renderDailySalesChart(data.dailyBreakdown || []);
    renderPaymentMethodsBreakdown(data.paymentMethodsBreakdown || [], totalRev);
    renderDocTypesBreakdown(data.documentTypes || [], totalRev);
    renderExpensesBreakdown(data.expensesBreakdown || [], totalExp);

    // 4. Render Garments & Categories
    renderTopServicesRanking(data.topServices || []);
    renderCategoriesBreakdown(data.categoriesBreakdown || [], totalRev);

    // 5. Render Debtors & Top Clients
    renderDebtorsTable(data.debtors || []);
    renderTopClientsTable(data.topClients || []);

    // 6. Render Workshop Operations
    renderWorkshopPipeline(data.workshop || {});

    // 7. Render Detailed Orders Table (respecting live search text if any)
    filterReportTable();

  } catch (err) {
    console.error('Error al cargar reporte de ventas:', err);
    showToast('Error al calcular el reporte: ' + err.message, 'error');
  }
}

function renderPaymentMethodsBreakdown(methods, totalRev) {
  const container = document.getElementById('paymentMethodsBreakdownContainer');
  if (!container) return;

  if (!methods || methods.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.88rem; text-align:center; padding:1.5rem 0;">Sin ventas en el período.</p>';
    return;
  }

  const colorMap = {
    EFECTIVO: '#10b981',
    DEBITO: '#2563eb',
    CREDITO: '#7c3aed',
    TRANSFERENCIA: '#0891b2'
  };

  let html = '';
  methods.forEach(m => {
    const pct = totalRev > 0 ? Math.round((m.revenue / totalRev) * 100) : 0;
    const color = colorMap[m.paymentMethod] || '#0077e6';
    html += `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <span>${formatPaymentMethod(m.paymentMethod)} (${m.count} ped)</span>
          <span>${formatMoney(m.revenue)} <small style="color:#64748b; font-weight:600;">(${pct}%)</small></span>
        </div>
        <div class="breakdown-progress-bg">
          <div class="breakdown-progress-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderDailySalesChart(dailyData) {
  const container = document.getElementById('salesTimelineContainer');
  const badge = document.getElementById('chartPeriodBadge');
  if (!container) return;

  if (!dailyData || dailyData.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 2.5rem 0;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📉</div>
        <p style="font-size: 0.95rem; font-weight: 600;">No hay movimientos de ventas ni gastos en el período seleccionado.</p>
      </div>
    `;
    if (badge) badge.textContent = 'Sin movimientos';
    return;
  }

  const maxVal = Math.max(
    ...dailyData.map(d => Math.max(d.revenue || 0, d.expenses || 0)),
    1000
  );
  if (badge) badge.textContent = `${dailyData.length} ${dailyData.length === 1 ? 'día activo' : 'días activos'}`;

  let html = '<div class="sales-bars-wrapper">';
  dailyData.forEach(day => {
    const revPct = Math.max(Math.round(((day.revenue || 0) / maxVal) * 100), (day.revenue > 0 ? 5 : 0));
    const expPct = Math.max(Math.round(((day.expenses || 0) / maxVal) * 100), (day.expenses > 0 ? 5 : 0));

    const dateParts = day.date.split('-');
    const labelDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : day.date;
    const netProf = (day.revenue || 0) - (day.expenses || 0);

    html += `
      <div class="sales-bar-column">
        <div class="sales-bar-tooltip">
          <strong>${formatDate(day.date)}</strong><br>
          💰 Ventas: ${formatMoney(day.revenue || 0)} (${day.ordersCount || 0} ped)<br>
          💸 Gastos: ${formatMoney(day.expenses || 0)}<br>
          📈 Neto: <span style="color: ${netProf >= 0 ? '#4ade80' : '#f87171'};">${formatMoney(netProf)}</span>
        </div>
        <div class="sales-bar-duo-track">
          <div class="bar-revenue" style="height: ${revPct}%;"></div>
          <div class="bar-expense" style="height: ${expPct}%;"></div>
        </div>
        <span class="sales-bar-label">${labelDate}</span>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

function renderDocTypesBreakdown(docTypes, totalRev) {
  const container = document.getElementById('docTypesBreakdownContainer');
  if (!container) return;

  if (!docTypes || docTypes.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.88rem; text-align:center; padding:1.5rem 0;">Sin documentos emitidos en el período.</p>';
    return;
  }

  let html = '';
  docTypes.forEach(d => {
    const pct = totalRev > 0 ? Math.round((d.revenue / totalRev) * 100) : 0;
    const label = d.documentType === 'BOLETA' ? '📄 Boletas' : (d.documentType === 'FACTURA' ? '📑 Facturas' : '📝 Sin Documento');
    html += `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <span>${label} (${d.count} ped)</span>
          <span>${formatMoney(d.revenue)} <small style="color:#64748b; font-weight:600;">(${pct}%)</small></span>
        </div>
        <div class="breakdown-progress-bg">
          <div class="breakdown-progress-fill" style="width: ${pct}%; background: #0077e6;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderExpensesBreakdown(expensesList, totalExp) {
  const container = document.getElementById('expensesBreakdownContainer');
  if (!container) return;

  if (!expensesList || expensesList.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.88rem; text-align:center; padding:1.5rem 0;">No hay gastos registrados en este período.</p>';
    return;
  }

  let html = '';
  expensesList.forEach(e => {
    const pct = totalExp > 0 ? Math.round((e.total / totalExp) * 100) : 0;
    html += `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <span>🛒 ${e.product_type} (${e.count})</span>
          <span style="color:#dc2626;">${formatMoney(e.total)} <small style="color:#64748b; font-weight:600;">(${pct}%)</small></span>
        </div>
        <div class="breakdown-progress-bg">
          <div class="breakdown-progress-fill" style="width: ${pct}%; background: #dc2626;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderCategoriesBreakdown(categories, totalRev) {
  const container = document.getElementById('categoriesBreakdownContainer');
  if (!container) return;

  if (!categories || categories.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8; font-size:0.88rem; text-align:center; padding:1.5rem 0;">Sin prendas registradas en este período.</p>';
    return;
  }

  let html = '';
  categories.forEach(c => {
    const pct = totalRev > 0 ? Math.round((c.totalRevenue / totalRev) * 100) : 0;
    html += `
      <div class="breakdown-item">
        <div class="breakdown-row">
          <span>🏷️ ${c.category} (${c.totalQty} un.)</span>
          <span style="color:var(--primary-navy);">${formatMoney(c.totalRevenue)} <small style="color:#64748b; font-weight:600;">(${pct}%)</small></span>
        </div>
        <div class="breakdown-progress-bg">
          <div class="breakdown-progress-fill" style="width: ${pct}%; background: linear-gradient(90deg, #0077e6, #00d2ff);"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderDebtorsTable(debtors) {
  const tbody = document.getElementById('debtorsTableBody');
  const badge = document.getElementById('debtorsTotalBadge');
  if (!tbody) return;

  if (!debtors || debtors.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: #15803d; font-weight: 700;">
          🎉 ¡Excelente! No hay clientes con cuentas pendientes de pago.
        </td>
      </tr>
    `;
    if (badge) {
      badge.textContent = '$0 al día';
      badge.className = 'profit-badge positive';
    }
    return;
  }

  let totalDebtSum = 0;
  let rowsHtml = '';

  debtors.forEach(d => {
    totalDebtSum += (d.totalDebt || 0);
    const clientPhone = d.client_phone ? d.client_phone : 'Sin teléfono';
    const escapedName = (d.client_name || '').replace(/'/g, "\\'");
    const escapedFolios = (d.folios || '').replace(/'/g, "\\'");

    rowsHtml += `
      <tr>
        <td><strong style="color: #071933; font-size: 0.95rem;">${d.client_name}</strong></td>
        <td>📞 ${clientPhone}</td>
        <td><span class="badge" style="background:#fee2e2; color:#dc2626; font-weight:800;">Folio(s): ${d.folios}</span></td>
        <td>${formatDate(d.oldestOrderDate)}</td>
        <td style="text-align: right;"><strong style="color: #dc2626; font-size: 1.05rem;">${formatMoney(d.totalDebt)}</strong></td>
        <td style="text-align: center;">
          <button type="button" class="btn-whatsapp-sm" onclick="openWhatsAppDebt('${clientPhone}', '${escapedName}', '${escapedFolios}', ${d.totalDebt})">
            📲 Cobrar
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  if (badge) {
    badge.textContent = `${formatMoney(totalDebtSum)} por cobrar (${debtors.length} ${debtors.length === 1 ? 'cliente' : 'clientes'})`;
    badge.className = 'profit-badge negative';
  }
}

function renderTopClientsTable(topClients) {
  const tbody = document.getElementById('topClientsTableBody');
  if (!tbody) return;

  if (!topClients || topClients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No hay compras registradas de clientes en este período.
        </td>
      </tr>
    `;
    return;
  }

  let rowsHtml = '';
  topClients.forEach((c, idx) => {
    const rank = idx + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const debtBadge = c.pendingDebt > 0 
      ? `<span style="color:#b45309; font-weight:800; font-size:0.8rem;">⏳ Debe ${formatMoney(c.pendingDebt)}</span>`
      : `<span style="color:#15803d; font-weight:800; font-size:0.8rem;">✅ Al día</span>`;

    rowsHtml += `
      <tr>
        <td><span class="top-rank-badge ${rankClass}">${rank}</span></td>
        <td><strong style="color: #071933;">${c.client_name}</strong></td>
        <td style="color: #64748b;">${c.client_phone || 'Sin teléfono'}</td>
        <td style="text-align: center;"><span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:800;">${c.ordersCount} pedidos</span></td>
        <td style="text-align: right;"><strong style="color: #0077e6; font-size: 1rem;">${formatMoney(c.totalSpent)}</strong></td>
        <td style="text-align: center;">${debtBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

function renderWorkshopPipeline(workshop) {
  const counts = (workshop && workshop.counts) || [];
  const countMap = {};
  const totalMap = {};
  counts.forEach(c => {
    countMap[c.status] = c.count;
    totalMap[c.status] = c.total;
  });

  const elRecCount = document.getElementById('pipeRecibidoCount');
  const elRecAmt = document.getElementById('pipeRecibidoAmount');
  const elProcCount = document.getElementById('pipeEnProcesoCount');
  const elProcAmt = document.getElementById('pipeEnProcesoAmount');
  const elListoCount = document.getElementById('pipeListoCount');
  const elListoAmt = document.getElementById('pipeListoAmount');
  const elEntCount = document.getElementById('pipeEntregadoCount');
  const elEntAmt = document.getElementById('pipeEntregadoAmount');

  if (elRecCount) elRecCount.textContent = countMap['RECIBIDO'] || 0;
  if (elRecAmt) elRecAmt.textContent = `${formatMoney(totalMap['RECIBIDO'] || 0)} en taller`;

  const procCount = (countMap['EN_LAVADO'] || 0) + (countMap['EN_PROCESO'] || 0);
  const procTotal = (totalMap['EN_LAVADO'] || 0) + (totalMap['EN_PROCESO'] || 0);
  if (elProcCount) elProcCount.textContent = procCount;
  if (elProcAmt) elProcAmt.textContent = `${formatMoney(procTotal)} en lavado/secado`;

  if (elListoCount) elListoCount.textContent = countMap['LISTO'] || 0;
  if (elListoAmt) elListoAmt.textContent = `${formatMoney(totalMap['LISTO'] || 0)} listos`;

  if (elEntCount) elEntCount.textContent = countMap['ENTREGADO'] || 0;
  if (elEntAmt) elEntAmt.textContent = `${formatMoney(totalMap['ENTREGADO'] || 0)} entregados`;

  // Overdue banner
  const overdueBanner = document.getElementById('workshopOverdueBanner');
  const overdueTitle = document.getElementById('workshopOverdueTitle');
  const overdueSubtitle = document.getElementById('workshopOverdueSubtitle');
  const overdueList = (workshop && workshop.overdue) || [];

  if (overdueBanner) {
    if (overdueList.length > 0) {
      overdueBanner.style.display = 'flex';
      if (overdueTitle) overdueTitle.textContent = `⚠️ ¡Atención! ${overdueList.length} ${overdueList.length === 1 ? 'Pedido Atrasado' : 'Pedidos Atrasados'}`;
      if (overdueSubtitle) overdueSubtitle.textContent = `Folios: ${overdueList.map(o => o.folio).join(', ')}. Superaron su fecha estimada de entrega.`;
    } else {
      overdueBanner.style.display = 'none';
    }
  }

  // Upcoming deliveries table (Hoy y próximos 2 días)
  renderUpcomingWorkshopTable((workshop && workshop.upcoming) || []);

  // Ready for pickup list
  renderReadyPickupTable((workshop && workshop.readyForPickup) || []);
}

function renderUpcomingWorkshopTable(upcomingOrders) {
  const tbody = document.getElementById('upcomingWorkshopTableBody');
  const badge = document.getElementById('upcomingWorkshopBadge');
  if (!tbody) return;

  if (!upcomingOrders || upcomingOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 1.75rem; color: #94a3b8;">
          No hay entregas programadas para hoy ni los próximos 2 días.
        </td>
      </tr>
    `;
    if (badge) badge.textContent = '0 próximas';
    return;
  }

  if (badge) badge.textContent = `${upcomingOrders.length} próxima(s)`;

  let rowsHtml = '';
  upcomingOrders.forEach(u => {
    const urgencyHtml = getDeliveryUrgencyBadgeHtml(u);
    rowsHtml += `
      <tr>
        <td><strong style="color: #d90429; font-size: 0.95rem;">${u.folio}</strong></td>
        <td><strong style="color: #071933;">${u.client_name}</strong></td>
        <td>📞 ${u.client_phone || 'Sin teléfono'}</td>
        <td><strong>📅 ${formatDate(u.delivery_date)}</strong>${urgencyHtml}</td>
        <td><span class="status-pill status-${u.status}">${formatStatus(u.status)}</span></td>
        <td style="text-align: right;"><strong style="color: #071933;">${formatMoney(u.total)}</strong></td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

function renderReadyPickupTable(readyOrders) {
  const tbody = document.getElementById('readyPickupTableBody');
  const badge = document.getElementById('readyForPickupBadge');
  if (!tbody) return;

  if (!readyOrders || readyOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;">
          No hay pedidos en estantería esperando retiro actualmente.
        </td>
      </tr>
    `;
    if (badge) badge.textContent = '0 listos';
    return;
  }

  if (badge) badge.textContent = `${readyOrders.length} listos para entrega`;

  let rowsHtml = '';
  readyOrders.forEach(r => {
    const clientPhone = r.client_phone || 'Sin teléfono';
    const escapedName = (r.client_name || '').replace(/'/g, "\\'");
    rowsHtml += `
      <tr>
        <td><strong style="color: #d90429; font-size: 0.95rem;">${r.folio}</strong></td>
        <td><strong style="color: #071933;">${r.client_name}</strong></td>
        <td>📞 ${clientPhone}</td>
        <td>📅 ${formatDate(r.delivery_date)}</td>
        <td style="text-align: right;"><strong style="color: #15803d;">${formatMoney(r.total)}</strong></td>
        <td style="text-align: center;">
          <button type="button" class="btn-whatsapp-sm" onclick="openWhatsAppReady('${clientPhone}', '${escapedName}', '${r.folio}')">
            📲 Avisar Retiro
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}

function renderTopServicesRanking(services) {
  const container = document.getElementById('topServicesContainer');
  if (!container) return;

  if (!services || services.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 2.5rem 0;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🧺</div>
        <p style="font-size: 0.95rem; font-weight: 600;">No hay prendas registradas en este período.</p>
      </div>
    `;
    return;
  }

  const maxQty = Math.max(...services.map(s => s.totalQty), 1);
  let html = '';

  services.forEach((s, idx) => {
    const rank = idx + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const pct = Math.round((s.totalQty / maxQty) * 100);

    html += `
      <div class="top-service-item">
        <div class="top-service-row">
          <div class="top-service-info">
            <span class="top-rank-badge ${rankClass}">${rank}</span>
            <span>${s.service_name}</span>
          </div>
          <div class="top-service-stats">
            <span>${s.totalQty} un.</span>
            <span style="color: #64748b; font-weight: 600;">(${formatMoney(s.totalSubtotal)})</span>
          </div>
        </div>
        <div class="top-service-progress-bg">
          <div class="top-service-progress-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderReportOrdersTable(orders) {
  const tbody = document.getElementById('reportTableBody');
  const countBadge = document.getElementById('detailOrdersCount');
  const footerItems = document.getElementById('reportFooterItems');
  const footerTotal = document.getElementById('reportFooterTotal');

  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: #94a3b8;">
          No se encontraron pedidos en el período seleccionado.
        </td>
      </tr>
    `;
    if (countBadge) countBadge.textContent = '0';
    if (footerItems) footerItems.textContent = '0 prendas';
    if (footerTotal) footerTotal.textContent = '$0';
    return;
  }

  if (countBadge) countBadge.textContent = orders.length;

  let totalItemsCount = 0;
  let totalRevenueSum = 0;
  let rowsHtml = '';

  orders.forEach(o => {
    totalItemsCount += (o.itemsCount || 0);
    totalRevenueSum += (o.total || 0);

    const clientPhone = o.client_phone ? `<br><small style="color:#64748b;">📞 ${o.client_phone}</small>` : '';
    const clientRutHtml = o.client_rut ? `<br><small style="color:#475569; font-family:monospace;">RUT: ${sanitizeRut(o.client_rut)}</small>` : '';
    const itemsTooltip = (o.itemsSummary || '').replace(/"/g, '&quot;');
    const urgencyHtml = getDeliveryUrgencyBadgeHtml(o);
    const exitHtml = o.exit_date
      ? `<br><span class="exit-date-badge">🚪 Salida: ${formatDate(o.exit_date)}</span>`
      : '';
    const pm = o.payment_method || 'EFECTIVO';

    rowsHtml += `
      <tr>
        <td><strong style="color: #d90429; font-size: 0.95rem;">${o.folio}</strong></td>
        <td>
          <small style="color:#64748b;">📥 Recep: ${formatDate(o.reception_date)}</small><br>
          <small style="color:#0284c7; font-weight:700;">📅 Est: ${formatDate(o.delivery_date)}</small>${urgencyHtml}${exitHtml}
        </td>
        <td>
          <strong style="color: #071933;">${o.client_name}</strong>
          ${clientRutHtml}
          ${clientPhone}
        </td>
        <td>
          <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.25rem 0.55rem; border-radius:4px; font-weight:700; cursor:default;" title="${itemsTooltip}">
            ${o.itemsCount || 0} prendas
          </span>
          <br>
          <small style="color: #64748b; font-size: 0.78rem;">${(o.itemsSummary || '').slice(0, 35)}${(o.itemsSummary || '').length > 35 ? '...' : ''}</small>
        </td>
        <td>
          <span style="font-weight: 700; font-size: 0.8rem; color: #334155;">
            ${o.document_type || 'BOLETA'}
          </span>
        </td>
        <td>
          <span class="status-pill status-${o.status}">${formatStatus(o.status)}</span>
        </td>
        <td>
          <span style="font-weight: 800; font-size: 0.8rem; color: ${o.payment_status === 'PAGADO' ? '#15803d' : '#b45309'};">
            ${o.payment_status === 'PAGADO' ? '✅ PAGADO' : '⏳ PENDIENTE'}
          </span><br>
          <span class="payment-method-badge pm-${pm}">${formatPaymentMethod(pm)}</span>
        </td>
        <td style="text-align: right;">
          <strong style="color: #071933; font-size: 1rem;">${formatMoney(o.total)}</strong>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  if (footerItems) footerItems.textContent = `${totalItemsCount} prendas`;
  if (footerTotal) footerTotal.textContent = formatMoney(totalRevenueSum);
}

function filterReportTable() {
  if (!state.lastReportData || !state.lastReportData.orders) return;
  const input = document.getElementById('reportTableSearch');
  const query = input ? input.value.toLowerCase().trim() : '';
  const rutQuery = query.replace(/\./g, '');

  if (!query) {
    renderReportOrdersTable(state.lastReportData.orders);
    return;
  }

  const filtered = state.lastReportData.orders.filter(o => 
    o.folio.toLowerCase().includes(query) ||
    o.client_name.toLowerCase().includes(query) ||
    (o.client_rut && sanitizeRut(o.client_rut).toLowerCase().includes(rutQuery)) ||
    (o.client_phone && o.client_phone.includes(query)) ||
    (o.itemsSummary && o.itemsSummary.toLowerCase().includes(query))
  );

  renderReportOrdersTable(filtered);
}

function exportSalesReportCSV() {
  if (!state.lastReportData || !state.lastReportData.orders || state.lastReportData.orders.length === 0) {
    showToast('No hay datos de ventas para exportar en este período.', 'error');
    return;
  }

  const orders = state.lastReportData.orders;
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const rangeStr = (startInput && startInput.value) ? `${startInput.value}_al_${endInput?.value || ''}` : 'completo';

  const headers = [
    'Folio',
    'Fecha Recepcion',
    'Fecha Entrega Estimada',
    'Fecha Salida Local',
    'Cliente',
    'RUT',
    'Telefono',
    'Prendas Detalle',
    'Cantidad Prendas',
    'Tipo Documento',
    'Estado Pedido',
    'Estado Pago',
    'Medio Pago',
    'Total (CLP)'
  ];

  const rows = orders.map(o => [
    `"${o.folio}"`,
    `"${o.reception_date || ''}"`,
    `"${o.delivery_date || ''}"`,
    `"${o.exit_date || ''}"`,
    `"${(o.client_name || '').replace(/"/g, '""')}"`,
    `"${sanitizeRut(o.client_rut || '')}"`,
    `"${(o.client_phone || '').replace(/"/g, '""')}"`,
    `"${(o.itemsSummary || '').replace(/"/g, '""')}"`,
    o.itemsCount || 0,
    `"${o.document_type || 'BOLETA'}"`,
    `"${o.status || ''}"`,
    `"${o.payment_status || ''}"`,
    `"${o.payment_method || 'EFECTIVO'}"`,
    Math.round(o.total || 0)
  ]);

  // UTF-8 BOM so Excel opens accents and symbols cleanly
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `reporte_ventas_batery_clean_${rangeStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('✅ Reporte de ventas exportado exitosamente a CSV / Excel.', 'success');
}

function printSalesReport() {
  document.body.classList.add('printing-report');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-report');
  }, 1000);
}

// ==========================================================================
// GASTOS & INSUMOS (EXPENSES CONTROLLER)
// ==========================================================================

state.expenses = [];
state.expenseToDeleteId = null;

async function loadExpenses() {
  const container = document.getElementById('expensesTableBody');
  if (!container) return;

  const searchInput = document.getElementById('expenseSearchInput');
  const typeFilter = document.getElementById('expenseTypeFilter');
  const search = searchInput ? searchInput.value.trim() : '';
  const type = typeFilter ? typeFilter.value : 'TODOS';

  container.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">Cargando gastos...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (type && type !== 'TODOS') params.append('type', type);

    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();
    state.expenses = data.expenses || [];

    const summary = data.summary || { count: 0, totalExpenses: 0, byType: [] };

    // 1. Update KPI Cards
    const elTotalAmount = document.getElementById('expenseTotalAmount');
    const elTotalCount = document.getElementById('expenseTotalCount');
    const elAvgAmount = document.getElementById('expenseAvgAmount');
    const elTopCat = document.getElementById('expenseTopCategory');
    const elTopAmt = document.getElementById('expenseTopAmount');
    const elFooterTotal = document.getElementById('expensesTableFooterTotal');

    if (elTotalAmount) elTotalAmount.textContent = formatMoney(summary.totalExpenses);
    if (elTotalCount) elTotalCount.textContent = `${summary.count} compras`;

    const avg = summary.count > 0 ? Math.round(summary.totalExpenses / summary.count) : 0;
    if (elAvgAmount) elAvgAmount.textContent = formatMoney(avg);

    if (summary.byType && summary.byType.length > 0) {
      const top = summary.byType[0];
      if (elTopCat) elTopCat.textContent = top.type;
      if (elTopAmt) elTopAmt.textContent = `${formatMoney(top.total)} (${top.count} compras)`;
    } else {
      if (elTopCat) elTopCat.textContent = '-';
      if (elTopAmt) elTopAmt.textContent = '$0';
    }

    if (elFooterTotal) elFooterTotal.textContent = formatMoney(summary.totalExpenses);

    // 2. Render Table Rows
    if (state.expenses.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 2.5rem; color: #64748b;">
            ${search || type !== 'TODOS' ? 'No se encontraron gastos con los filtros aplicados.' : 'No hay gastos registrados aún.'}
            <br>
            <button type="button" class="btn btn-sm btn-success" style="margin-top: 0.75rem;" onclick="openExpenseModal()">
              ➕ Registrar Primer Gasto
            </button>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    state.expenses.forEach(e => {
      const notesHtml = e.notes ? `<br><small style="color:#64748b; font-style:italic;">📝 ${e.notes}</small>` : '';

      // Type Badge Color Helper
      let badgeStyle = 'background:#e0f2fe; color:#0369a1;';
      if (e.product_type.includes('Detergente')) badgeStyle = 'background:#dbeafe; color:#1e40af;';
      else if (e.product_type.includes('Suavizante')) badgeStyle = 'background:#fce7f3; color:#9d174d;';
      else if (e.product_type.includes('Bolsas')) badgeStyle = 'background:#fef3c7; color:#92400e;';
      else if (e.product_type.includes('Mantenimiento')) badgeStyle = 'background:#ffedd5; color:#9a3412;';
      else if (e.product_type.includes('Básicos')) badgeStyle = 'background:#fef9c3; color:#854d0e;';

      rowsHtml += `
        <tr>
          <td>
            <strong>📅 ${formatDate(e.purchase_date)}</strong>
          </td>
          <td>
            <strong style="color: #071933; font-size: 0.95rem;">${e.product_name}</strong>
            ${notesHtml}
          </td>
          <td>
            <span class="badge" style="${badgeStyle} padding: 0.3rem 0.65rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem;">
              ${e.product_type}
            </span>
          </td>
          <td style="text-align: right;">
            <strong style="color: #dc2626; font-size: 1.05rem;">${formatMoney(e.price)}</strong>
          </td>
          <td style="text-align: center;">
            <div class="table-actions">
              ${hasPerm('manage_expenses') ? `
                <button type="button" class="btn btn-sm btn-primary" onclick="openExpenseModalById(${e.id})" title="Editar datos del gasto">
                  ✏️ Editar
                </button>
                <button type="button" class="btn btn-sm btn-danger" onclick="openDeleteExpenseModalById(${e.id})" title="Eliminar gasto">
                  🗑️
                </button>
              ` : '<span style="color:#64748b; font-size:0.8rem; font-weight:600;">🔒 Solo lectura</span>'}
            </div>
          </td>
        </tr>
      `;
    });

    container.innerHTML = rowsHtml;
  } catch (err) {
    console.error('Error al cargar gastos:', err);
    container.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error al cargar gastos: ${err.message}</td></tr>`;
  }
}

function openExpenseModal(expense = null) {
  function toLocalISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const modal = document.getElementById('expenseFormModal');
  const title = document.getElementById('expenseModalTitle');
  const idInput = document.getElementById('modalExpenseId');
  const nameInput = document.getElementById('modalExpenseProductName');
  const typeSelect = document.getElementById('modalExpenseType');
  const priceInput = document.getElementById('modalExpensePrice');
  const dateInput = document.getElementById('modalExpenseDate');
  const notesInput = document.getElementById('modalExpenseNotes');

  if (!modal) return;

  if (expense) {
    title.textContent = '✏️ Editar Gasto / Insumo';
    idInput.value = expense.id;
    nameInput.value = expense.product_name;
    typeSelect.value = expense.product_type;
    priceInput.value = expense.price;
    dateInput.value = expense.purchase_date;
    notesInput.value = expense.notes || '';
  } else {
    title.textContent = '➕ Registrar Nuevo Gasto';
    idInput.value = '';
    nameInput.value = '';
    typeSelect.value = 'Detergentes y Químicos';
    priceInput.value = '';
    dateInput.value = toLocalISO(new Date());
    notesInput.value = '';
  }

  modal.classList.add('open');
  nameInput?.focus();
}

function openExpenseModalById(id) {
  const expense = state.expenses.find(e => e.id === Number(id));
  if (expense) {
    openExpenseModal(expense);
  } else {
    showToast('Gasto no encontrado', 'error');
  }
}

function closeExpenseModal() {
  const modal = document.getElementById('expenseFormModal');
  if (modal) modal.classList.remove('open');
}

async function saveExpenseModalSubmit() {
  const id = document.getElementById('modalExpenseId')?.value;
  const productName = document.getElementById('modalExpenseProductName')?.value.trim();
  const productType = document.getElementById('modalExpenseType')?.value.trim();
  const price = Number(document.getElementById('modalExpensePrice')?.value);
  const purchaseDate = document.getElementById('modalExpenseDate')?.value.trim();
  const notes = document.getElementById('modalExpenseNotes')?.value.trim();

  if (!productName) {
    alert('Por favor, ingresa el nombre del producto o insumo.');
    return;
  }

  if (!productType) {
    alert('Por favor, selecciona el tipo de producto.');
    return;
  }

  if (isNaN(price) || price < 0) {
    alert('Por favor, ingresa un precio o monto válido.');
    return;
  }

  if (!purchaseDate) {
    alert('Por favor, indica la fecha de compra.');
    return;
  }

  const payload = {
    product_name: productName,
    product_type: productType,
    price,
    purchase_date: purchaseDate,
    notes
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al guardar el gasto');
    }

    showToast(id ? '✅ Gasto actualizado correctamente' : '✅ Gasto registrado con éxito', 'success');
    closeExpenseModal();
    loadExpenses();
  } catch (err) {
    console.error('Error al guardar gasto:', err);
    alert('Error: ' + err.message);
  }
}

function openDeleteExpenseModalById(id) {
  state.expenseToDeleteId = Number(id);
  const expense = state.expenses.find(e => e.id === Number(id));
  const title = document.getElementById('deleteExpenseConfirmTitle');
  const msg = document.getElementById('deleteExpenseConfirmMessage');

  if (expense) {
    if (title) title.textContent = `¿Eliminar "${expense.product_name}"?`;
    if (msg) msg.textContent = `Monto de ${formatMoney(expense.price)} del día ${formatDate(expense.purchase_date)}. Esta acción no se puede deshacer.`;
  }

  const modal = document.getElementById('deleteExpenseModal');
  if (modal) modal.classList.add('open');
}

function closeDeleteExpenseModal() {
  state.expenseToDeleteId = null;
  const modal = document.getElementById('deleteExpenseModal');
  if (modal) modal.classList.remove('open');
}

async function executeDeleteExpense() {
  if (!state.expenseToDeleteId) return;

  try {
    const res = await fetch(`/api/expenses/${state.expenseToDeleteId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'No se pudo eliminar el gasto');
    }

    showToast('🗑️ Gasto eliminado correctamente', 'success');
    closeDeleteExpenseModal();
    loadExpenses();
  } catch (err) {
    console.error('Error al eliminar gasto:', err);
    alert('Error al eliminar: ' + err.message);
  }
}


// ==================== SAAS AUTH, ROLES, USERS & MULTI-TENANT PANEL ====================

function fillDemoCredentials(username, password) {
  const uEl = document.getElementById('loginUsername');
  const pEl = document.getElementById('loginPassword');
  if (uEl) uEl.value = username;
  if (pEl) pEl.value = password;
  const errEl = document.getElementById('authErrorBox');
  if (errEl) errEl.style.display = 'none';
}

async function submitLoginForm() {
  const username = (document.getElementById('loginUsername')?.value || '').trim();
  const password = document.getElementById('loginPassword')?.value || '';
  const errEl = document.getElementById('authErrorBox');
  const btn = document.getElementById('btnLoginSubmit');

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Verificando...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo iniciar sesión.');
    }

    await applyAuthSession(data);
    showToast(`Bienvenido/a, ${data.user.full_name}`, 'success');
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🚀 Ingresar al Sistema';
    }
  }
}

async function logoutUser() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  handleUnauthorizedSession();
  const pEl = document.getElementById('loginPassword');
  if (pEl) pEl.value = '';
  showToast('Sesión cerrada correctamente', 'success');
}

async function ensurePermissionsCatalog() {
  if (state.permissionsCatalog && state.permissionsCatalog.length > 0) return state.permissionsCatalog;
  const res = await fetch('/api/permissions-catalog');
  if (res.ok) {
    state.permissionsCatalog = await res.json();
  }
  return state.permissionsCatalog || [];
}

function switchUsersRolesSubTab(subTab) {
  state.usersRolesSubTab = subTab;
  const usersPane = document.getElementById('usersSubPane');
  const rolesPane = document.getElementById('rolesSubPane');
  const btnUsers = document.getElementById('btnSubTabUsers');
  const btnRoles = document.getElementById('btnSubTabRoles');

  if (usersPane) usersPane.style.display = subTab === 'users' ? 'block' : 'none';
  if (rolesPane) rolesPane.style.display = subTab === 'roles' ? 'block' : 'none';
  if (btnUsers) btnUsers.className = subTab === 'users' ? 'btn btn-primary' : 'btn btn-outline';
  if (btnRoles) btnRoles.className = subTab === 'roles' ? 'btn btn-primary' : 'btn btn-outline';
}

async function loadUsersAndRoles() {
  await ensurePermissionsCatalog();

  if (hasPerm('manage_roles') || hasPerm('manage_users')) {
    try {
      const resRoles = await fetch('/api/roles');
      if (resRoles.ok) state.roles = await resRoles.json();
    } catch (e) {
      console.error('Error loading roles:', e);
    }
  }

  if (hasPerm('manage_users')) {
    try {
      const resUsers = await fetch('/api/users');
      if (resUsers.ok) state.users = await resUsers.json();
    } catch (e) {
      console.error('Error loading users:', e);
    }
  }

  // Auto-select sub-tab if user only has manage_roles
  if (!hasPerm('manage_users') && hasPerm('manage_roles')) {
    switchUsersRolesSubTab('roles');
  } else if (hasPerm('manage_users') && !hasPerm('manage_roles')) {
    switchUsersRolesSubTab('users');
  }

  renderUsersTable();
  renderRolesGrid();
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!hasPerm('manage_users')) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b;">No tienes permiso para administrar usuarios.</td></tr>';
    return;
  }

  if (!state.users || state.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b;">No hay usuarios registrados en esta lavandería.</td></tr>';
    return;
  }

  tbody.innerHTML = state.users.map(u => {
    const isSelf = state.authUser && Number(u.id) === Number(state.authUser.id);
    return `
      <tr>
        <td><strong style="font-family:monospace; color:#093c7d;">@${u.username}</strong></td>
        <td><strong>${u.full_name}</strong></td>
        <td>${u.email || '<span style="color:#94a3b8;">-</span>'}</td>
        <td><span class="perm-chip">${u.role_name || 'Sin rol'}</span></td>
        <td>
          <span class="status-pill ${u.active ? 'status-ENTREGADO' : 'status-CANCELADO'}">
            ${u.active ? '✅ Activo' : '⛔ Inactivo'}
          </span>
        </td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button type="button" class="btn btn-sm btn-primary" onclick="openUserModalById(${u.id})">✏️ Editar</button>
            ${isSelf ? '' : `<button type="button" class="btn btn-sm btn-danger" onclick="deleteUserById(${u.id})" title="Eliminar usuario">🗑️</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRolesGrid() {
  const grid = document.getElementById('rolesListGrid');
  if (!grid) return;

  if (!state.roles || state.roles.length === 0) {
    grid.innerHTML = '<p style="color:#64748b;">No hay roles configurados.</p>';
    return;
  }

  const labelMap = {};
  (state.permissionsCatalog || []).forEach(p => { labelMap[p.key] = p.label; });
  const canEditRoles = hasPerm('manage_roles');

  grid.innerHTML = state.roles.map(r => {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    const chips = perms.map(p => `<span class="perm-chip">${labelMap[p] || p}</span>`).join('');
    return `
      <div class="role-card">
        <div>
          <div class="role-card-header">
            <div>
              <div class="role-card-title">🛡️ ${r.name}</div>
              <small style="color:#64748b;">${r.description || 'Sin descripción'}</small>
            </div>
            <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.2rem 0.6rem; border-radius:12px; font-size:0.75rem; font-weight:700;">
              ${r.users_count || 0} usuario(s)
            </span>
          </div>
          <div class="role-perm-chips" style="margin-top:0.75rem;">
            ${chips || '<small style="color:#94a3b8;">Sin permisos asignados</small>'}
          </div>
        </div>
        ${canEditRoles ? `
          <div style="display:flex; gap:0.5rem; justify-content:flex-end; border-top:1px solid #f1f5f9; padding-top:0.75rem;">
            <button type="button" class="btn btn-sm btn-primary" onclick="openRoleModalById(${r.id})">✏️ Editar Permisos</button>
            ${r.is_system ? '' : `<button type="button" class="btn btn-sm btn-danger" onclick="deleteRoleById(${r.id})">🗑️</button>`}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function openUserModal(user = null) {
  const modal = document.getElementById('userFormModal');
  if (!modal) return;

  const roleSelect = document.getElementById('modalUserRole');
  if (roleSelect) {
    roleSelect.innerHTML = (state.roles || []).map(r =>
      `<option value="${r.id}">${r.name}</option>`
    ).join('');
  }

  document.getElementById('userModalTitle').textContent = user ? `✏️ Editar Usuario: @${user.username}` : '➕ Nuevo Usuario de Lavandería';
  document.getElementById('modalUserId').value = user ? user.id : '';

  const uInput = document.getElementById('modalUserUsername');
  uInput.value = user ? user.username : '';
  uInput.readOnly = Boolean(user);

  document.getElementById('modalUserFullName').value = user ? user.full_name : '';
  document.getElementById('modalUserEmail').value = user ? (user.email || '') : '';
  if (roleSelect && user && user.role_id) roleSelect.value = user.role_id;

  const pInput = document.getElementById('modalUserPassword');
  const pLabel = document.getElementById('modalUserPasswordLabel');
  if (pInput) {
    pInput.value = '';
    pInput.placeholder = user ? 'Dejar vacío para mantener clave actual' : 'Mínimo 4 caracteres';
  }
  if (pLabel) pLabel.textContent = user ? 'Nueva Contraseña (Opcional)' : 'Contraseña *';
  document.getElementById('modalUserActive').checked = user ? Boolean(user.active) : true;

  modal.classList.add('open');
}

function openUserModalById(id) {
  const user = (state.users || []).find(u => Number(u.id) === Number(id));
  if (user) openUserModal(user);
}

function closeUserModal() {
  document.getElementById('userFormModal')?.classList.remove('open');
}

async function saveUserModalSubmit() {
  const id = document.getElementById('modalUserId').value;
  const payload = {
    username: document.getElementById('modalUserUsername').value.trim(),
    full_name: document.getElementById('modalUserFullName').value.trim(),
    email: document.getElementById('modalUserEmail').value.trim(),
    role_id: document.getElementById('modalUserRole').value,
    password: document.getElementById('modalUserPassword').value,
    active: document.getElementById('modalUserActive').checked
  };

  try {
    const res = await fetch(id ? `/api/users/${id}` : '/api/users', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el usuario');

    closeUserModal();
    await loadUsersAndRoles();
    showToast(id ? '✅ Usuario actualizado' : '✅ Usuario creado correctamente', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUserById(id) {
  const user = (state.users || []).find(u => Number(u.id) === Number(id));
  if (!confirm(`¿Eliminar al usuario "@${user?.username || id}"?`)) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
    await loadUsersAndRoles();
    showToast('🗑️ Usuario eliminado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openRoleModal(role = null) {
  await ensurePermissionsCatalog();
  const modal = document.getElementById('roleFormModal');
  if (!modal) return;

  document.getElementById('roleModalTitle').textContent = role ? `🛡️ Editar Rol: ${role.name}` : '➕ Crear Nuevo Rol';
  document.getElementById('modalRoleId').value = role ? role.id : '';
  document.getElementById('modalRoleName').value = role ? role.name : '';
  document.getElementById('modalRoleDescription').value = role ? (role.description || '') : '';

  const selectedPerms = new Set(role && Array.isArray(role.permissions) ? role.permissions : []);
  const groups = {};
  (state.permissionsCatalog || []).forEach(p => {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  const grid = document.getElementById('rolePermissionsGrid');
  if (grid) {
    grid.innerHTML = Object.entries(groups).map(([groupName, items]) => `
      <div class="perm-group-box">
        <div class="perm-group-title">${groupName}</div>
        ${items.map(p => `
          <label class="perm-check-label">
            <input type="checkbox" class="role-perm-checkbox" value="${p.key}" ${selectedPerms.has(p.key) ? 'checked' : ''}>
            <span>${p.label}</span>
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  modal.classList.add('open');
}

function openRoleModalById(id) {
  const role = (state.roles || []).find(r => Number(r.id) === Number(id));
  if (role) openRoleModal(role);
}

function closeRoleModal() {
  document.getElementById('roleFormModal')?.classList.remove('open');
}

function toggleAllRolePermissions(checked) {
  document.querySelectorAll('.role-perm-checkbox').forEach(cb => { cb.checked = checked; });
}

async function saveRoleModalSubmit() {
  const id = document.getElementById('modalRoleId').value;
  const permissions = Array.from(document.querySelectorAll('.role-perm-checkbox:checked')).map(cb => cb.value);
  const payload = {
    name: document.getElementById('modalRoleName').value.trim(),
    description: document.getElementById('modalRoleDescription').value.trim(),
    permissions
  };

  try {
    const res = await fetch(id ? `/api/roles/${id}` : '/api/roles', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar el rol');

    closeRoleModal();
    await loadUsersAndRoles();
    await checkAuthAndInit();
    showToast(id ? '✅ Permisos del rol actualizados' : '✅ Nuevo rol creado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteRoleById(id) {
  const role = (state.roles || []).find(r => Number(r.id) === Number(id));
  if (!confirm(`¿Eliminar el rol "${role?.name || id}"?`)) return;

  try {
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el rol');
    await loadUsersAndRoles();
    showToast('🗑️ Rol eliminado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==================== KAJERO-PARITY SAAS SUPERADMIN & SUPPORT (PRIVACY-FIRST) ====================

const SAAS_TENANT_MENUS = [
  { id: 'nueva-guia', label: '📝 Recepción (Inicio)' },
  { id: 'pedidos-list', label: '🧺 Control de Pedidos' },
  { id: 'clientes-list', label: '👥 Clientes' },
  { id: 'precios-catalog', label: '🏷️ Catálogo & Precios' },
  { id: 'gastos-list', label: '💸 Gastos & Insumos' },
  { id: 'reportes-ventas', label: '📊 Reportes Financieros' },
  { id: 'usuarios-roles', label: '🔐 Usuarios & Roles' },
  { id: 'soporte', label: '🎧 Soporte SaaS' },
  { id: 'ajustes', label: '⚙️ Ajustes y Respaldo' }
];

async function loadSaasDashboard() {
  if (!hasPerm('__superadmin__')) return;
  try {
    const res = await fetch('/api/saas/dashboard');
    if (!res.ok) throw new Error('Error al cargar estadísticas SaaS');
    const data = await res.json();

    state.saasLaundries = data.laundries || [];
    state.saasPlans = data.plans || [];
    state.saasSummary = data.summary || {};

    const s = state.saasSummary;
    const elTotal = document.getElementById('saasKpiTotalBiz');
    const elBreakdown = document.getElementById('saasKpiBizBreakdown');
    const elMrr = document.getElementById('saasKpiMrr');
    const elArr = document.getElementById('saasKpiArr');
    const elArpu = document.getElementById('saasKpiArpu');
    const elStaff = document.getElementById('saasKpiStaff');
    const elCatalogMeta = document.getElementById('saasKpiCatalogMeta');
    const elHealthPct = document.getElementById('saasHealthActivePct');
    const elHealthSub = document.getElementById('saasHealthActiveSub');
    const elHealthAvg = document.getElementById('saasHealthAvgStaff');

    if (elTotal) elTotal.textContent = s.totalLaundries || 0;
    if (elBreakdown) elBreakdown.textContent = `${s.activeLaundries || 0} activas / ${s.inactiveLaundries || 0} inactivas`;
    if (elMrr) elMrr.textContent = formatMoney(s.mrr || 0);
    if (elArr) elArr.textContent = `ARR Proyectado: ${formatMoney(s.arr || 0)} / año`;
    if (elArpu) elArpu.textContent = formatMoney(s.arpu || 0);
    if (elStaff) elStaff.textContent = s.totalStaffAccounts || 0;
    if (elCatalogMeta) elCatalogMeta.textContent = `${s.totalCatalogItems || 0} prendas en catálogos`;

    const activePct = s.totalLaundries > 0 ? Math.round((s.activeLaundries / s.totalLaundries) * 100) : 0;
    if (elHealthPct) elHealthPct.textContent = `${activePct}%`;
    if (elHealthSub) elHealthSub.textContent = `${s.activeLaundries || 0} de ${s.totalLaundries || 0} activas`;
    if (elHealthAvg) elHealthAvg.textContent = s.avgStaffPerLaundry || 0;

    // Deactivated count & plan filter dropdown
    const deactivatedEl = document.getElementById('saasDeactivatedCount');
    if (deactivatedEl) deactivatedEl.textContent = s.deactivatedCount || 0;

    const filterPlanSel = document.getElementById('saasBizFilterPlan');
    if (filterPlanSel) {
      const currentVal = filterPlanSel.value;
      filterPlanSel.innerHTML = `<option value="">Todos los Planes</option>` +
        state.saasPlans.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      filterPlanSel.value = currentVal;
    }

    // Expiring soon banner
    const expBanner = document.getElementById('saasExpiringBanner');
    const expChips = document.getElementById('saasExpiringChips');
    const expiring = data.expiringSoon || [];
    if (expBanner && expChips) {
      if (expiring.length === 0) {
        expBanner.style.display = 'none';
      } else {
        expBanner.style.display = 'block';
        expChips.innerHTML = expiring.map(b => `
          <div style="background:#ffffff; border:1px solid #fca5a5; border-radius:8px; padding:0.4rem 0.75rem; font-size:0.82rem; display:inline-flex; align-items:center; gap:0.5rem;">
            <strong>${b.name}</strong>
            <span style="color:#64748b; font-family:monospace;">(${sanitizeRut(b.rut) || 'Sin RUT'})</span>
            <span class="perm-chip" style="background:#fee2e2; color:#991b1b; border-color:#fca5a5;">
              ${b.daysRemaining === 0 ? 'Expirado' : `${b.daysRemaining} día(s) restante(s)`}
            </span>
          </div>
        `).join('');
      }
    }

    // Ecosystem of plans
    const ecoList = document.getElementById('saasPlansEcosystemList');
    if (ecoList) {
      ecoList.innerHTML = state.saasPlans.map(p => {
        const count = state.saasLaundries.filter(l => Number(l.plan_id) === Number(p.id) && l.status === 'Activo').length;
        const mrrPlan = count * p.price;
        const pct = Math.min(100, Math.round((count / Math.max(1, state.saasLaundries.length)) * 100));
        return `
          <div class="saas-plan-progress-card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
              <div>
                <strong style="color:var(--primary-navy); font-size:1rem;">${p.name}</strong>
                <div style="font-size:0.8rem; color:#64748b;">
                  Límites: ${p.limit_users || '∞'} usuarios / ${p.limit_services || '∞'} prendas
                </div>
              </div>
              <div style="text-align:right;">
                <strong style="color:#16a34a; font-size:1rem;">${formatMoney(p.price)} CLP</strong>
                <div style="font-size:0.74rem; color:#64748b;">mensual</div>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.84rem;">
              <span>Suscripciones activas: <strong>${count}</strong></span>
              <span>Aporte MRR: <strong style="color:#16a34a;">${formatMoney(mrrPlan)}</strong></span>
            </div>
            <div class="saas-progress-track"><div class="saas-progress-fill" style="width:${pct}%;"></div></div>
          </div>
        `;
      }).join('');
    }

    // Upgrade candidates
    const upgList = document.getElementById('saasUpgradeCandidatesList');
    if (upgList) {
      const candidates = data.upgradeCandidates || [];
      if (candidates.length === 0) {
        upgList.innerHTML = `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:0.75rem; color:#15803d; font-size:0.84rem;">✅ Todas las lavanderías operan dentro de márgenes holgados de su plan.</div>`;
      } else {
        upgList.innerHTML = candidates.map(b => `
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:0.65rem 0.85rem; display:flex; justify-content:space-between; align-items:center; font-size:0.84rem;">
            <div>
              <strong>${b.name}</strong>
              <div style="font-size:0.76rem; color:#92400e;">Plan ${b.plan_name || '-'}: ${b.users_count}/${b.plan_limit_users || '∞'} usr · ${b.services_count}/${b.plan_limit_services || '∞'} prendas</div>
            </div>
            <span class="perm-chip" style="background:#fef3c7; color:#92400e; border-color:#f59e0b;">Cerca del Límite</span>
          </div>
        `).join('');
      }
    }

    renderSaasBusinessesTable();
  } catch (err) {
    console.error('Error SaaS dashboard:', err);
  }
}

function switchSaasBusinessesSubTab(subTab) {
  state.saasBusinessesSubTab = subTab;
  document.getElementById('saasBizSubPane').style.display = subTab === 'businesses' ? 'block' : 'none';
  document.getElementById('saasAuditSubPane').style.display = subTab === 'audit' ? 'block' : 'none';
  document.getElementById('btnSubTabSaasBiz').className = subTab === 'businesses' ? 'btn btn-primary' : 'btn btn-outline';
  document.getElementById('btnSubTabSaasAudit').className = subTab === 'audit' ? 'btn btn-primary' : 'btn btn-outline';
  if (subTab === 'audit') loadSaasAuditLogs();
}

function clearSaasBizFilters() {
  const s = document.getElementById('saasBizSearch');
  const p = document.getElementById('saasBizFilterPlan');
  const st = document.getElementById('saasBizFilterStatus');
  const deact = document.getElementById('saasShowDeactivated');
  if (s) s.value = '';
  if (p) p.value = '';
  if (st) st.value = '';
  if (deact) deact.checked = false;
  renderSaasBusinessesTable();
}

function renderSaasBusinessesTable() {
  const tbody = document.getElementById('saasLaundriesTableBody');
  if (!tbody) return;

  const q = (document.getElementById('saasBizSearch')?.value || '').trim().toLowerCase();
  const fPlan = document.getElementById('saasBizFilterPlan')?.value || '';
  const fStatus = document.getElementById('saasBizFilterStatus')?.value || '';
  const showDeact = Boolean(document.getElementById('saasShowDeactivated')?.checked);

  const filtered = (state.saasLaundries || []).filter(l => {
    if (!showDeact && l.status === 'Dado de Baja' && fStatus !== 'Dado de Baja') return false;
    if (fPlan && String(l.plan_id) !== String(fPlan)) return false;
    if (fStatus === 'TRIAL') {
      if (!l.isTrialActive) return false;
    } else if (fStatus && l.status !== fStatus) {
      return false;
    }
    if (q) {
      const hay = `${l.name} ${l.rut || ''} ${l.address || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:#64748b;">No hay lavanderías que coincidan con los filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const statusPillCls = l.status === 'Activo' ? 'status-ENTREGADO' : (l.status === 'Suspendido' ? 'status-RECIBIDO' : 'status-CANCELADO');
    const validityColor = l.daysRemaining <= 5 ? '#dc2626' : '#15803d';
    const userLimitTxt = l.plan_limit_users > 0 ? `${l.users_count} / ${l.plan_limit_users}` : `${l.users_count} / ∞`;
    const srvLimitTxt = l.plan_limit_services > 0 ? `${l.services_count} / ${l.plan_limit_services}` : `${l.services_count} / ∞`;

    const actionButtons = [];
    actionButtons.push(`<button type="button" class="btn btn-sm btn-outline" style="min-width:32px; font-weight:900; color:#0284c7;" onclick="openGraceModalById(${l.id})" title="Otorgar días de gracia" aria-label="Otorgar días de gracia">+</button>`);
    actionButtons.push(`<button type="button" class="btn btn-sm btn-primary" style="min-width:32px;" onclick="openLaundryModalById(${l.id})" title="Editar sede y plan" aria-label="Editar sede y plan">✏️</button>`);
    if (l.status === 'Activo') {
      actionButtons.push(`<button type="button" class="btn btn-sm btn-outline" style="min-width:32px; color:#d97706; border-color:#f59e0b;" onclick="toggleLaundryStatus(${l.id}, 'Suspendido')" title="Suspender" aria-label="Suspender">⏸️</button>`);
      actionButtons.push(`<button type="button" class="btn btn-sm btn-outline" style="min-width:32px; color:#dc2626; border-color:#fca5a5; font-weight:900;" onclick="toggleLaundryStatus(${l.id}, 'Dado de Baja')" title="Dar de baja" aria-label="Dar de baja">−</button>`);
    } else if (l.status === 'Suspendido') {
      actionButtons.push(`<button type="button" class="btn btn-sm btn-success" style="min-width:32px;" onclick="toggleLaundryStatus(${l.id}, 'Activo')" title="Activar" aria-label="Activar">▶️</button>`);
      actionButtons.push(`<button type="button" class="btn btn-sm btn-outline" style="min-width:32px; color:#dc2626; border-color:#fca5a5; font-weight:900;" onclick="toggleLaundryStatus(${l.id}, 'Dado de Baja')" title="Dar de baja" aria-label="Dar de baja">−</button>`);
    } else {
      actionButtons.push(`<button type="button" class="btn btn-sm btn-success" style="min-width:32px;" onclick="toggleLaundryStatus(${l.id}, 'Activo')" title="Reactivar" aria-label="Reactivar">♻️</button>`);
    }
    actionButtons.push(`<button type="button" class="btn btn-sm btn-danger" style="min-width:32px;" onclick="openDeleteLaundryModalById(${l.id})" title="Eliminar permanentemente" aria-label="Eliminar permanentemente">🗑️</button>`);

    return `
      <tr>
        <td>
          <strong style="color:#071933;">${l.name}</strong>
          <br><small style="color:#64748b;">${l.address || l.slogan || ''}</small>
          ${l.admin_email ? `<br><small style="color:#0284c7;">✉️ ${l.admin_email}</small>` : ''}
        </td>
        <td><span style="font-family:monospace; font-weight:700;">${sanitizeRut(l.rut) || '-'}</span></td>
        <td><span class="perm-chip">${l.plan_name || 'Sin Plan'}</span></td>
        <td style="text-align:center;"><strong>${userLimitTxt}</strong></td>
        <td style="text-align:center;"><strong>${srvLimitTxt}</strong></td>
        <td>
          <small>Reg: ${l.created_at ? formatDate(String(l.created_at).slice(0, 10)) : '-'}</small><br>
          <small style="color:#0284c7;">Pago: ${l.last_payment_date ? formatDate(l.last_payment_date) : 'Sin reg.'}</small>
        </td>
        <td>
          <strong style="color:${validityColor};">${l.isTrialActive ? `Prueba · ${l.daysRemaining}d` : `${l.daysRemaining} días`}</strong>
          ${l.grace_days_total > 0 ? `<br><small style="color:#16a34a;">+${l.grace_days_total}d gracia</small>` : ''}
        </td>
        <td><span class="status-pill ${statusPillCls}">${l.status}</span></td>
        <td style="text-align:center;"><div class="table-actions" style="flex-wrap:nowrap; justify-content:center;">${actionButtons.join('')}</div></td>
      </tr>
    `;
  }).join('');
}

async function toggleLaundryStatus(id, nextStatus) {
  const l = (state.saasLaundries || []).find(item => Number(item.id) === Number(id));
  if (!confirm(`¿Cambiar el estado de "${l?.name || id}" a "${nextStatus}"?`)) return;
  try {
    const res = await fetch(`/api/saas/laundries/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar estado');
    await loadSaasDashboard();
    showToast(`✅ Estado actualizado a ${nextStatus}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function generateRandomAdminPass() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pass = '';
  for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  const inp = document.getElementById('modalLaundryAdminPassword');
  if (inp) inp.value = pass;
}

function openLaundryModal(laundry = null) {
  const modal = document.getElementById('laundryFormModal');
  if (!modal) return;

  const planSel = document.getElementById('modalLaundryPlan');
  if (planSel) {
    planSel.innerHTML = (state.saasPlans || []).map(p =>
      `<option value="${p.id}">${p.name} (${formatMoney(p.price)}/mes)</option>`
    ).join('');
  }

  document.getElementById('laundryModalTitle').textContent = laundry ? `✏️ Editar Lavandería: ${laundry.name}` : '🏢 Nueva Lavandería (SaaS)';
  document.getElementById('modalLaundryId').value = laundry ? laundry.id : '';
  document.getElementById('modalLaundryName').value = laundry ? laundry.name : '';
  document.getElementById('modalLaundryRut').value = laundry ? sanitizeRut(laundry.rut || '') : '';
  if (planSel && laundry && laundry.plan_id) planSel.value = laundry.plan_id;
  document.getElementById('modalLaundryPayDate').value = laundry?.last_payment_date ? String(laundry.last_payment_date).slice(0, 10) : getLocalTodayISO();
  document.getElementById('modalLaundryPhone').value = laundry ? (laundry.phone || '') : '';
  document.getElementById('modalLaundryAddress').value = laundry ? (laundry.address || '') : '';
  document.getElementById('modalLaundrySlogan').value = laundry ? (laundry.slogan || '') : 'Lavado de Alta Energía';
  document.getElementById('modalLaundryTrial').checked = laundry ? Boolean(laundry.trial_enabled) : false;

  const userWrap = document.getElementById('modalLaundryAdminUsernameWrap');
  const passLbl = document.getElementById('modalLaundryAdminPasswordLabel');
  if (userWrap) userWrap.style.display = laundry ? 'none' : 'block';
  if (passLbl) passLbl.textContent = laundry ? 'Nueva Contraseña Admin (Opcional)' : 'Contraseña Admin *';

  document.getElementById('modalLaundryAdminName').value = laundry ? (laundry.admin_full_name || '') : '';
  document.getElementById('modalLaundryAdminEmail').value = laundry ? (laundry.admin_email || '') : '';
  document.getElementById('modalLaundryAdminUsername').value = laundry ? (laundry.admin_username || '') : '';
  document.getElementById('modalLaundryAdminPassword').value = '';

  modal.classList.add('open');
}

function openLaundryModalById(id) {
  const l = (state.saasLaundries || []).find(item => Number(item.id) === Number(id));
  if (l) openLaundryModal(l);
}

function closeLaundryModal() {
  document.getElementById('laundryFormModal')?.classList.remove('open');
}

async function saveLaundryModalSubmit() {
  const id = document.getElementById('modalLaundryId').value;
  const payload = {
    name: document.getElementById('modalLaundryName').value.trim(),
    rut: sanitizeRut(document.getElementById('modalLaundryRut').value),
    plan_id: document.getElementById('modalLaundryPlan').value,
    last_payment_date: document.getElementById('modalLaundryPayDate').value,
    phone: document.getElementById('modalLaundryPhone').value.trim(),
    address: document.getElementById('modalLaundryAddress').value.trim(),
    slogan: document.getElementById('modalLaundrySlogan').value.trim(),
    trial_enabled: document.getElementById('modalLaundryTrial').checked,
    admin_full_name: document.getElementById('modalLaundryAdminName').value.trim(),
    admin_email: document.getElementById('modalLaundryAdminEmail').value.trim(),
    admin_password: document.getElementById('modalLaundryAdminPassword').value
  };
  if (!id) {
    payload.admin_username = document.getElementById('modalLaundryAdminUsername').value.trim();
  }

  try {
    const res = await fetch(id ? `/api/saas/laundries/${id}` : '/api/saas/laundries', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la lavandería');

    closeLaundryModal();
    await loadSaasDashboard();
    showToast(id ? '✅ Lavandería actualizada' : '✅ Lavandería creada con plan, servicios y roles iniciales', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openGraceModalById(id) {
  const l = (state.saasLaundries || []).find(item => Number(item.id) === Number(id));
  if (!l) return;

  document.getElementById('graceLaundryId').value = l.id;
  document.getElementById('graceBizTitle').textContent = `🏢 ${l.name} (${sanitizeRut(l.rut) || 'Sin RUT'})`;
  document.getElementById('graceCurrentUntil').textContent = l.validUntil ? formatDate(l.validUntil.slice(0, 10)) : 'Sin vigencia';
  document.getElementById('graceDaysLeft').textContent = `${l.daysRemaining || 0} días`;
  document.getElementById('graceTotalGranted').textContent = `${l.grace_days_total || 0} días`;
  document.getElementById('graceDaysInput').value = 3;

  const histWrap = document.getElementById('graceHistoryWrap');
  if (histWrap) histWrap.innerHTML = '<small style="color:#64748b;">Cargando historial...</small>';

  document.getElementById('graceDaysModal').classList.add('open');
  try {
    const res = await fetch(`/api/saas/laundries/${id}/grace-history`);
    const rows = res.ok ? await res.json() : [];
    if (histWrap) {
      histWrap.innerHTML = rows.length === 0
        ? '<small style="color:#64748b;">Sin compensaciones previas.</small>'
        : `<strong style="font-size:0.82rem; display:block; margin-bottom:0.4rem;">Últimas compensaciones:</strong>` +
          rows.slice(0, 5).map(g => `
            <div style="display:flex; justify-content:space-between; gap:0.5rem; font-size:0.78rem; padding:0.4rem 0.6rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:0.35rem;">
              <strong style="color:#16a34a;">+${g.days}d</strong>
              <span style="flex:1;">${g.reason}</span>
              <small style="color:#64748b;">${g.granted_by_name}</small>
            </div>
          `).join('');
    }
  } catch (e) {}
}

function closeGraceModal() {
  document.getElementById('graceDaysModal')?.classList.remove('open');
}

async function grantGraceDaysSubmit() {
  const id = document.getElementById('graceLaundryId').value;
  const days = parseInt(document.getElementById('graceDaysInput').value, 10);
  const reason = document.getElementById('graceReasonInput').value.trim();

  try {
    const res = await fetch(`/api/saas/laundries/${id}/grace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error otorgando días de gracia');
    closeGraceModal();
    await loadSaasDashboard();
    showToast(`✅ Se otorgaron +${days} días de gracia`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openDeleteLaundryModalById(id) {
  const l = (state.saasLaundries || []).find(item => Number(item.id) === Number(id));
  if (!l) return;
  document.getElementById('deleteLaundryId').value = l.id;
  document.getElementById('deleteLaundryMsg').textContent = `¿Eliminar permanentemente "${l.name}" y todos sus registros asociados?`;
  document.getElementById('deleteLaundryPassword').value = '';
  document.getElementById('deleteLaundryModal').classList.add('open');
}

function closeDeleteLaundryModal() {
  document.getElementById('deleteLaundryModal')?.classList.remove('open');
}

async function confirmDeleteLaundrySubmit() {
  const id = document.getElementById('deleteLaundryId').value;
  const password = document.getElementById('deleteLaundryPassword').value;
  try {
    const res = await fetch(`/api/saas/laundries/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al eliminar lavandería');
    closeDeleteLaundryModal();
    await loadSaasDashboard();
    showToast('🗑️ Lavandería eliminada permanentemente', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadSaasAuditLogs() {
  try {
    const res = await fetch('/api/saas/audit-logs');
    if (res.ok) {
      state.saasAuditLogs = await res.json();
      renderSaasAuditTable();
    }
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

function renderSaasAuditTable() {
  const tbody = document.getElementById('saasAuditTableBody');
  if (!tbody) return;

  const uFilter = (document.getElementById('auditFilterUser')?.value || '').trim().toLowerCase();
  const bFilter = (document.getElementById('auditFilterBiz')?.value || '').trim().toLowerCase();
  const aFilter = document.getElementById('auditFilterAction')?.value || '';

  const filtered = (state.saasAuditLogs || []).filter(log => {
    if (uFilter && !(log.user_name || '').toLowerCase().includes(uFilter)) return false;
    if (bFilter && !(log.laundry_name || '').toLowerCase().includes(bFilter)) return false;
    if (aFilter && log.action_type !== aFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#64748b;">No hay eventos administrativos registrados con estos filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td><small>${String(l.created_at || '').replace('T', ' ').slice(0, 19)}</small></td>
      <td><strong>${l.user_name || 'Sistema'}</strong></td>
      <td><span class="perm-chip">${l.action_type}</span></td>
      <td><strong>${l.entity_type}</strong>${l.laundry_name ? ` — ${l.laundry_name}` : ''}</td>
      <td><small style="color:#475569;">${JSON.stringify(l.details || {})}</small></td>
    </tr>
  `).join('');
}

// ----------------- GESTIONAR PLATAFORMA (PLANES, SUPERADMINS, ACUERDOS) -----------------
function switchSaasPlatformSubTab(subTab) {
  state.saasPlatformSubTab = subTab;
  document.getElementById('saasPlansSubPane').style.display = subTab === 'plans' ? 'block' : 'none';
  document.getElementById('saasAdminsSubPane').style.display = subTab === 'admins' ? 'block' : 'none';
  document.getElementById('saasAgreementsSubPane').style.display = subTab === 'agreements' ? 'block' : 'none';
  document.getElementById('btnSubTabPlans').className = subTab === 'plans' ? 'btn btn-primary' : 'btn btn-outline';
  document.getElementById('btnSubTabSaasAdmins').className = subTab === 'admins' ? 'btn btn-primary' : 'btn btn-outline';
  document.getElementById('btnSubTabAgreements').className = subTab === 'agreements' ? 'btn btn-primary' : 'btn btn-outline';
  loadSaasPlatform();
}

async function loadSaasPlatform() {
  if (!hasPerm('__superadmin__')) return;
  try {
    const [plansRes, dashRes, adminsRes, agRes] = await Promise.all([
      fetch('/api/saas/plans'),
      fetch('/api/saas/dashboard'),
      fetch('/api/saas/admins'),
      fetch('/api/saas/agreements')
    ]);
    if (plansRes.ok) state.saasPlans = await plansRes.json();
    if (dashRes.ok) {
      const d = await dashRes.json();
      state.saasLaundries = d.laundries || [];
    }
    if (adminsRes.ok) state.saasAdmins = await adminsRes.json();
    if (agRes.ok) state.saasAgreements = await agRes.json();

    renderSaasPlansTable();
    renderSaasAdminsTable();
    renderSaasAgreements();
  } catch (err) {
    console.error('Error loading platform:', err);
  }
}

function renderSaasPlansTable() {
  const tbody = document.getElementById('saasPlansTableBody');
  if (!tbody) return;
  const menuNames = Object.fromEntries(SAAS_TENANT_MENUS.map(m => [m.id, m.label]));

  tbody.innerHTML = (state.saasPlans || []).map(p => {
    const activeCount = (state.saasLaundries || []).filter(l => Number(l.plan_id) === Number(p.id) && l.status === 'Activo').length;
    const chips = (p.allowed_menus || []).map(id => `<span class="perm-chip">${menuNames[id] || id}</span>`).join('');
    return `
      <tr>
        <td><strong>${p.name}</strong><br><small style="color:#64748b;">${p.description || ''}</small></td>
        <td><strong style="color:#16a34a;">${formatMoney(p.price)} CLP</strong></td>
        <td style="text-align:center;"><strong>${p.limit_users || '∞'}</strong></td>
        <td style="text-align:center;"><strong>${p.limit_services || '∞'}</strong></td>
        <td><div class="role-perm-chips">${chips}</div></td>
        <td style="text-align:center;"><span class="perm-chip">${activeCount}</span></td>
        <td style="text-align:center;">
          <div class="table-actions">
            <button type="button" class="btn btn-sm btn-primary" onclick="openPlanModalById(${p.id})">✏️</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="deletePlanById(${p.id})">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openPlanModal(plan = null) {
  document.getElementById('planModalTitle').textContent = plan ? `✏️ Editar Plan: ${plan.name}` : '💳 Crear Nuevo Plan SaaS';
  document.getElementById('modalPlanId').value = plan ? plan.id : '';
  document.getElementById('modalPlanName').value = plan ? plan.name : '';
  document.getElementById('modalPlanPrice').value = plan ? plan.price : 29990;
  document.getElementById('modalPlanLimitUsers').value = plan ? plan.limit_users : 5;
  document.getElementById('modalPlanLimitServices').value = plan ? plan.limit_services : 100;
  document.getElementById('modalPlanSupport').value = plan ? (plan.support_level || 'normal') : 'normal';
  document.getElementById('modalPlanDescription').value = plan ? (plan.description || '') : '';

  const selected = new Set(plan ? (plan.allowed_menus || []) : SAAS_TENANT_MENUS.map(m => m.id));
  const grid = document.getElementById('planMenusGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="perm-group-box" style="grid-column: 1 / -1;">
        <div class="perm-group-title">Módulos Disponibles para las Lavanderías con este Plan</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:0.45rem;">
          ${SAAS_TENANT_MENUS.map(m => `
            <label class="perm-check-label">
              <input type="checkbox" class="plan-menu-checkbox" value="${m.id}" ${selected.has(m.id) ? 'checked' : ''}>
              <span>${m.label}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }
  document.getElementById('planFormModal').classList.add('open');
}

function openPlanModalById(id) {
  const p = (state.saasPlans || []).find(item => Number(item.id) === Number(id));
  if (p) openPlanModal(p);
}

function closePlanModal() {
  document.getElementById('planFormModal')?.classList.remove('open');
}

async function savePlanModalSubmit() {
  const id = document.getElementById('modalPlanId').value;
  const allowed_menus = Array.from(document.querySelectorAll('.plan-menu-checkbox:checked')).map(cb => cb.value);
  const payload = {
    name: document.getElementById('modalPlanName').value.trim(),
    price: Number(document.getElementById('modalPlanPrice').value) || 0,
    limit_users: parseInt(document.getElementById('modalPlanLimitUsers').value, 10) || 0,
    limit_services: parseInt(document.getElementById('modalPlanLimitServices').value, 10) || 0,
    support_level: document.getElementById('modalPlanSupport').value,
    description: document.getElementById('modalPlanDescription').value.trim(),
    allowed_menus
  };
  try {
    const res = await fetch(id ? `/api/saas/plans/${id}` : '/api/saas/plans', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando plan');
    closePlanModal();
    await loadSaasPlatform();
    showToast('✅ Plan guardado correctamente', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePlanById(id) {
  const p = (state.saasPlans || []).find(item => Number(item.id) === Number(id));
  if (!confirm(`¿Eliminar el plan "${p?.name || id}"?`)) return;
  try {
    const res = await fetch(`/api/saas/plans/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
    await loadSaasPlatform();
    showToast('🗑️ Plan eliminado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSaasAdminsTable() {
  const tbody = document.getElementById('saasAdminsTableBody');
  if (!tbody) return;
  tbody.innerHTML = (state.saasAdmins || []).map(a => `
    <tr>
      <td><strong style="font-family:monospace;">@${a.username}</strong></td>
      <td><strong>${a.full_name}</strong></td>
      <td>${a.email || '-'}</td>
      <td><span class="status-pill ${a.active ? 'status-ENTREGADO' : 'status-CANCELADO'}">${a.active ? '✅ Activo' : '⛔ Inactivo'}</span></td>
      <td style="text-align:center;"><button type="button" class="btn btn-sm btn-primary" onclick="openSaasAdminModalById(${a.id})">✏️ Editar</button></td>
    </tr>
  `).join('');
}

function openSaasAdminModal(admin = null) {
  document.getElementById('saasAdminModalTitle').textContent = admin ? `✏️ Editar SuperAdmin: @${admin.username}` : '👑 Nuevo Super Administrador SaaS';
  document.getElementById('modalSaasAdminId').value = admin ? admin.id : '';
  const uInp = document.getElementById('modalSaasAdminUsername');
  uInp.value = admin ? admin.username : '';
  uInp.readOnly = Boolean(admin);
  document.getElementById('modalSaasAdminFullName').value = admin ? admin.full_name : '';
  document.getElementById('modalSaasAdminEmail').value = admin ? (admin.email || '') : '';
  document.getElementById('modalSaasAdminPassword').value = '';
  document.getElementById('modalSaasAdminPasswordLabel').textContent = admin ? 'Nueva Contraseña (Opcional)' : 'Contraseña *';
  document.getElementById('modalSaasAdminActive').checked = admin ? Boolean(admin.active) : true;
  document.getElementById('saasAdminModal').classList.add('open');
}

function openSaasAdminModalById(id) {
  const a = (state.saasAdmins || []).find(item => Number(item.id) === Number(id));
  if (a) openSaasAdminModal(a);
}

function closeSaasAdminModal() {
  document.getElementById('saasAdminModal')?.classList.remove('open');
}

async function saveSaasAdminSubmit() {
  const id = document.getElementById('modalSaasAdminId').value;
  const payload = {
    username: document.getElementById('modalSaasAdminUsername').value.trim(),
    full_name: document.getElementById('modalSaasAdminFullName').value.trim(),
    email: document.getElementById('modalSaasAdminEmail').value.trim(),
    password: document.getElementById('modalSaasAdminPassword').value,
    active: document.getElementById('modalSaasAdminActive').checked
  };
  try {
    const res = await fetch(id ? `/api/saas/admins/${id}` : '/api/saas/admins', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando SuperAdmin');
    closeSaasAdminModal();
    await loadSaasPlatform();
    showToast('✅ Super Administrador guardado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSaasAgreements() {
  const active = (state.saasAgreements || []).find(a => a.active) || state.saasAgreements?.[0];
  if (active) {
    const t = document.getElementById('agreementTitleInput');
    const c = document.getElementById('agreementContentInput');
    if (t && !t.value) t.value = active.title;
    if (c && !c.value) c.value = active.content;
  }
  const hist = document.getElementById('saasAgreementsHistory');
  if (hist) {
    hist.innerHTML = (state.saasAgreements || []).map(a => `
      <div style="background:#f8fafc; border:1px solid ${a.active ? '#86efac' : '#e2e8f0'}; border-radius:8px; padding:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${a.title} (${a.version})</strong>
          ${a.active ? '<span class="perm-chip" style="background:#dcfce7; color:#15803d; border-color:#86efac;">Vigente</span>' : ''}
        </div>
        <small style="color:#64748b;">Publicado por ${a.published_by || 'SuperAdmin'} · ${String(a.created_at || '').slice(0, 10)}</small>
      </div>
    `).join('');
  }
}

async function publishAgreementSubmit() {
  const title = document.getElementById('agreementTitleInput').value.trim();
  const version = document.getElementById('agreementVersionInput').value.trim();
  const content = document.getElementById('agreementContentInput').value.trim();
  try {
    const res = await fetch('/api/saas/agreements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, version, content })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo publicar');
    document.getElementById('agreementVersionInput').value = '';
    await loadSaasPlatform();
    showToast('✅ Acuerdo de privacidad publicado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- SOPORTE SAAS (TICKETS ENTRE SEDES Y SUPERADMIN) -----------------
async function loadSupportTickets() {
  try {
    const btnNew = document.getElementById('btnNewSupportTicket');
    if (btnNew) btnNew.style.display = state.authUser?.is_superadmin ? 'none' : 'inline-flex';

    const res = await fetch('/api/support/tickets');
    if (!res.ok) return;
    const data = await res.json();
    state.supportTickets = data.tickets || [];
    const s = data.summary || {};

    document.getElementById('supportTotalCount').textContent = s.total || 0;
    document.getElementById('supportPendingCount').textContent = s.pending || 0;
    document.getElementById('supportInProgressCount').textContent = s.inProgress || 0;
    document.getElementById('supportResolvedCount').textContent = s.resolved || 0;

    state.supportUnreadCount = s.unread || 0;
    syncHeaderAndDrawerFromAuth();

    const tbody = document.getElementById('supportTicketsTableBody');
    if (!tbody) return;
    if (state.supportTickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748b;">No hay tickets de soporte registrados.</td></tr>';
      return;
    }
    tbody.innerHTML = state.supportTickets.map(t => {
      const statusCls = t.status === 'RESOLVED' ? 'status-ENTREGADO' : (t.status === 'IN_PROGRESS' ? 'status-EN_LAVADO' : 'status-RECIBIDO');
      return `
        <tr>
          <td><strong>#${t.id}</strong></td>
          <td><strong>${t.laundry_name}</strong></td>
          <td><strong>${t.subject}</strong><br><small style="color:#64748b;">Por: ${t.created_by_name}</small></td>
          <td><span class="perm-chip">${t.category}</span> · <small>${t.priority}</small></td>
          <td><span class="status-pill ${statusCls}">${t.status}</span></td>
          <td><small>${String(t.updated_at || '').slice(0, 16).replace('T', ' ')}</small></td>
          <td style="text-align:center;"><button type="button" class="btn btn-sm btn-primary" onclick="openSupportTicketById(${t.id})">💬 Abrir</button></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading support:', err);
  }
}

function openSupportCreateModal() {
  document.getElementById('supportSubjectInput').value = '';
  document.getElementById('supportMessageInput').value = '';
  document.getElementById('supportCreateModal').classList.add('open');
}

function closeSupportCreateModal() {
  document.getElementById('supportCreateModal')?.classList.remove('open');
}

async function submitNewSupportTicket() {
  const payload = {
    subject: document.getElementById('supportSubjectInput').value.trim(),
    category: document.getElementById('supportCategorySelect').value,
    priority: document.getElementById('supportPrioritySelect').value,
    message: document.getElementById('supportMessageInput').value.trim()
  };
  try {
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo enviar ticket');
    closeSupportCreateModal();
    await loadSupportTickets();
    showToast('✅ Ticket de soporte enviado', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openSupportTicketById(id) {
  try {
    const res = await fetch(`/api/support/tickets/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error abriendo ticket');

    const t = data.ticket;
    document.getElementById('activeSupportTicketId').value = t.id;
    document.getElementById('supportTicketModalTitle').textContent = `🎧 Ticket #${t.id}: ${t.subject}`;
    document.getElementById('supportReplyInput').value = '';

    const metaBar = document.getElementById('supportTicketMetaBar');
    if (metaBar) {
      const statusSel = state.authUser?.is_superadmin
        ? `<select class="form-control" style="width:auto; font-weight:700;" onchange="updateSupportTicketStatus(${t.id}, this.value)">
             <option value="PENDING" ${t.status === 'PENDING' ? 'selected' : ''}>⏳ Pendiente</option>
             <option value="IN_PROGRESS" ${t.status === 'IN_PROGRESS' ? 'selected' : ''}>🛠️ En Atención</option>
             <option value="RESOLVED" ${t.status === 'RESOLVED' ? 'selected' : ''}>✅ Resuelto</option>
           </select>`
        : `<span class="perm-chip">${t.status}</span>`;
      metaBar.innerHTML = `<span><strong>Sede:</strong> ${t.laundry_name} · ${t.category}</span>${statusSel}`;
    }

    const msgBox = document.getElementById('supportMessagesBox');
    if (msgBox) {
      msgBox.innerHTML = (data.messages || []).map(m => `
        <div class="support-msg-bubble ${m.sender_role === 'SUPER_ADMIN' ? 'from-superadmin' : 'from-tenant'}">
          <div style="font-size:0.75rem; font-weight:800; color:#475569; margin-bottom:0.2rem;">
            ${m.sender_name} (${m.sender_role === 'SUPER_ADMIN' ? 'Soporte SaaS' : 'Lavandería'})
          </div>
          <div>${m.message}</div>
        </div>
      `).join('');
    }

    document.getElementById('supportTicketModal').classList.add('open');
    await loadSupportTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeSupportTicketModal() {
  document.getElementById('supportTicketModal')?.classList.remove('open');
}

async function sendSupportReply() {
  const id = document.getElementById('activeSupportTicketId').value;
  const message = document.getElementById('supportReplyInput').value.trim();
  if (!message) return;
  try {
    const res = await fetch(`/api/support/tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al responder');
    await openSupportTicketById(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateSupportTicketStatus(id, status) {
  try {
    const res = await fetch(`/api/support/tickets/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Error cambiando estado');
    showToast(`Estado actualizado a ${status}`, 'success');
    await loadSupportTickets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}


// ==================== AJUSTES DE LA LAVANDERÍA (DATOS Y LOGO PERSONALIZADO) ====================

function populateLaundrySettingsForm() {
  const cfg = state.laundry || state.config || {};
  state.settingsDraftLogo = cfg.logo_url || '';

  const preview = document.getElementById('settingsLogoPreview');
  if (preview) preview.src = state.settingsDraftLogo || '/assets/logo.jpeg';

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('settingsName', cfg.name);
  setVal('settingsSlogan', cfg.slogan);
  setVal('settingsRut', sanitizeRut(cfg.rut || ''));
  setVal('settingsPhone', cfg.phone);
  setVal('settingsInstagram', cfg.instagram);
  setVal('settingsAddress', cfg.address);
  setVal('settingsEmail', cfg.email);
  setVal('settingsTerms', cfg.terms);

  const fileInput = document.getElementById('settingsLogoFileInput');
  if (fileInput) fileInput.value = '';
}

function handleSettingsLogoFileChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Por favor selecciona un archivo de imagen válido (PNG, JPG, WEBP o GIF).', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 380;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const outputType = (file.type === 'image/png' || file.type === 'image/webp') ? 'image/png' : 'image/jpeg';
      const dataUrl = outputType === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', 0.88)
        : canvas.toDataURL('image/png');

      state.settingsDraftLogo = dataUrl;
      const preview = document.getElementById('settingsLogoPreview');
      if (preview) preview.src = dataUrl;
      showToast('Vista previa del logo cargada. Haz clic en "Guardar Datos y Logo" para aplicar.', 'success');
    };
    img.onerror = () => showToast('No se pudo leer la imagen seleccionada.', 'error');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function resetLaundryLogoToDefault() {
  state.settingsDraftLogo = '';
  const preview = document.getElementById('settingsLogoPreview');
  if (preview) preview.src = '/assets/logo.jpeg';
  const fileInput = document.getElementById('settingsLogoFileInput');
  if (fileInput) fileInput.value = '';
  showToast('Logo predeterminado seleccionado. Guarda para confirmar.', 'success');
}

async function saveLaundrySettingsSubmit() {
  const btn = document.getElementById('btnSaveLaundrySettings');
  const payload = {
    name: (document.getElementById('settingsName')?.value || '').trim(),
    slogan: (document.getElementById('settingsSlogan')?.value || '').trim(),
    rut: sanitizeRut(document.getElementById('settingsRut')?.value || ''),
    phone: (document.getElementById('settingsPhone')?.value || '').trim(),
    instagram: (document.getElementById('settingsInstagram')?.value || '').trim().replace(/^@/, ''),
    address: (document.getElementById('settingsAddress')?.value || '').trim(),
    email: (document.getElementById('settingsEmail')?.value || '').trim(),
    terms: document.getElementById('settingsTerms')?.value || '',
    logo_url: state.settingsDraftLogo !== null ? state.settingsDraftLogo : (state.laundry?.logo_url || '')
  };

  if (!payload.name) {
    showToast('El nombre de la lavandería es obligatorio.', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Guardando...';
  }

  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const updated = await res.json();
    if (!res.ok) throw new Error(updated.error || 'No se pudieron guardar los ajustes.');

    state.config = updated;
    state.laundry = { ...(state.laundry || {}), ...updated };
    syncHeaderAndDrawerFromAuth();
    showToast('✅ Datos y logo de tu lavandería actualizados correctamente', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Guardar Datos y Logo';
    }
  }
}

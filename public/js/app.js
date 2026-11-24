// Lavandería Batery Clean - Frontend Application
// 100% Offline Capable - Local Database Powered

const state = {
  services: [],
  selectedItems: {}, // service_id or name -> { name, unit_price, quantity }
  config: null,
  activeTab: 'nueva-guia',
  networkInfo: null
};

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
  // 1. Setup UI & Event Listeners first so buttons always work immediately
  setupNavigation();
  setupDates();
  setupClientAutocomplete();
  setupSpecialServicesHandlers();
  setupOrderForm();
  setupClientModals();
  setupServiceModals();

  // 2. Load data from backend gracefully
  try {
    await loadConfig();
  } catch (err) {
    console.warn('No se pudo cargar la configuración:', err);
  }

  try {
    await loadServices();
  } catch (err) {
    console.warn('No se pudieron cargar los servicios:', err);
  }

  try {
    await loadStats();
  } catch (err) {
    console.warn('No se pudieron cargar las estadísticas:', err);
  }
});

// Explicit global scope bindings for inline HTML handlers
window.toggleClientColumn = toggleClientColumn;
window.toggleClientsGridVisibility = toggleClientsGridVisibility;
window.loadClients = loadClients;
window.loadOrders = loadOrders;
window.openClientModal = openClientModal;
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
window.openWhatsAppDebt = openWhatsAppDebt;
window.openWhatsAppReady = openWhatsAppReady;
window.filterTableByOverdue = filterTableByOverdue;

// Setup Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.target);
      if (targetPane) {
        targetPane.classList.add('active');
        state.activeTab = tab.dataset.target;

        if (state.activeTab === 'pedidos-list') {
          loadOrders();
        } else if (state.activeTab === 'clientes-list') {
          loadClients();
        } else if (state.activeTab === 'precios-catalog') {
          renderPricesCatalog();
        } else if (state.activeTab === 'gastos-list') {
          loadExpenses();
        } else if (state.activeTab === 'reportes-ventas') {
          loadSalesReport();
        }
      }
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
            item.innerHTML = `<strong>${c.name}</strong> - 📞 ${c.phone || 'S/N'} <br><small style="color:#64748b;">${c.address || ''}</small>`;

            item.addEventListener('click', () => {
              nameInput.value = c.name;
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
  if (phoneInput) phoneInput.addEventListener('input', (e) => doSearch(e.target.value));

  document.addEventListener('click', (e) => {
    if (suggestionsBox && !suggestionsBox.contains(e.target) && e.target !== nameInput && e.target !== phoneInput) {
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
    const paymentMethod = document.getElementById('paymentMethod')?.value || 'EFECTIVO';

    const payload = {
      client_name: clientName,
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
  setupDates();
  updateOrderSummary();
}

// ----------------- ORDERS MANAGEMENT (TAB 2) -----------------
async function loadOrders() {
  const container = document.getElementById('ordersTableBody');
  if (!container) return;

  container.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 2rem;">Cargando pedidos...</td></tr>';

  const statusFilter = document.getElementById('orderStatusFilter')?.value || 'TODOS';
  const searchFilter = document.getElementById('orderSearchInput')?.value || '';

  try {
    let url = `/api/orders?status=${encodeURIComponent(statusFilter)}`;
    if (searchFilter) url += `&search=${encodeURIComponent(searchFilter)}`;

    const res = await fetch(url);
    const orders = await res.json();

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

      tr.innerHTML = `
        <td><strong style="color: #d90429; font-size: 1rem;">${order.folio}</strong></td>
        <td>
          <strong>${order.client_name}</strong><br>
          <small style="color: #64748b;">📞 ${order.client_phone || 'Sin fono'}</small>
        </td>
        <td>
          <span>${formatDate(order.reception_date)}</span><br>
          <small style="color: #0284c7; font-weight:600;">Entrega: ${formatDate(order.delivery_date)}</small>
        </td>
        <td><span class="status-pill status-${order.status}">${formatStatus(order.status)}</span></td>
        <td>
          <span style="font-weight: 700; color: ${order.payment_status === 'PAGADO' ? '#15803d' : '#b45309'};">
            ${order.payment_status}
          </span><br>
          <small>${order.document_type || 'BOLETA'}</small>
        </td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.2rem 0.5rem; border-radius:4px; font-weight:700;">${totalPrendas} prendas</span></td>
        <td><strong style="color: #0f172a; font-size: 1.05rem;">${formatMoney(order.total)}</strong></td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-sm btn-outline btn-print-order" title="Imprimir Guía / Comprobante">🖨️ Ver/Imprimir</button>
            <button type="button" class="btn btn-sm btn-whatsapp btn-wa-order" title="Avisar por WhatsApp">📲 WhatsApp</button>
            <select class="status-select">
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
      statusSelect.addEventListener('change', async (e) => {
        await updateOrderStatus(order.id, e.target.value);
        loadOrders();
        loadStats();
      });

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
      showToast(`Estado actualizado a: ${newStatus}`);
    }
  } catch (err) {
    alert('Error al actualizar estado: ' + err.message);
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
        <td class="col-rut ${isColHidden('col-rut')}">${c.rut ? `<span style="font-family:monospace; font-weight:700;">${c.rut}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
        <td class="col-orders ${isColHidden('col-orders')}">
          <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:0.25rem 0.6rem; border-radius:12px; font-weight:700; font-size:0.8rem;">
            ${orderCount} ${orderCount === 1 ? 'pedido' : 'pedidos'}
          </span>
        </td>
        <td class="col-address ${isColHidden('col-address')}">${c.address ? `<span>📍 ${c.address}</span>` : '<span style="color:#94a3b8;">Sin dirección</span>'}</td>
        <td class="col-date ${isColHidden('col-date')}"><small style="color:#64748b;">${c.created_at ? formatDate(c.created_at.split(' ')[0]) : '-'}</small></td>
        <td style="text-align: center;">
          <div class="table-actions">
            <button type="button" class="btn btn-sm btn-primary btn-new-order-client" title="Crear nueva Guía para este cliente">
              📝 Pedido
            </button>
            <button type="button" class="btn btn-sm btn-outline btn-edit-client" title="Editar datos del cliente">
              ✏️ Editar
            </button>
            <button type="button" class="btn btn-sm btn-danger btn-delete-client" title="Eliminar cliente del sistema">
              🗑️
            </button>
          </div>
        </td>
      `;

      // 1. Create order for this client
      tr.querySelector('.btn-new-order-client').addEventListener('click', () => {
        document.querySelector('.nav-tab[data-target="nueva-guia"]').click();
        document.getElementById('clientName').value = c.name;
        document.getElementById('clientPhone').value = c.phone || '';
        document.getElementById('clientAddress').value = c.address || '';
        showToast(`Cliente "${c.name}" cargado en la Guía de Recepción`);
      });

      // 2. Edit Client
      tr.querySelector('.btn-edit-client').addEventListener('click', () => {
        openClientModal(c);
      });

      // 3. Delete Client
      tr.querySelector('.btn-delete-client').addEventListener('click', () => {
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
    rutInput.value = client.rut || '';
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
  const rut = document.getElementById('modalClientRut').value.trim();
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

    tr.innerHTML = `
      <td>
        <input type="text" class="table-input service-name-input" value="${s.name}" style="font-weight: 700;">
      </td>
      <td>
        <select class="table-select service-category-select" style="font-weight: 600;">
          ${catOptionsHtml}
        </select>
      </td>
      <td>
        <div class="table-price-wrapper">
          <span class="table-currency-symbol">$</span>
          <input type="number" step="100" min="0" class="table-input service-price-input" value="${s.default_price}">
        </div>
      </td>
      <td style="text-align: center;">
        <div class="table-actions">
          <button type="button" class="btn btn-sm btn-primary" onclick="openServiceModalById(${s.id})" title="Editar prenda en ventana completa">
            ✏️ Editar
          </button>
          <button type="button" class="btn btn-sm btn-success" onclick="saveRowInline(${s.id})" title="Guardar cambios directos de esta fila">
            💾 Guardar
          </button>
          <button type="button" class="btn btn-sm btn-danger" onclick="openDeleteServiceModalById(${s.id})" title="Eliminar prenda del catálogo">
            🗑️
          </button>
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

    // Update pending badge in header/nav
    const badge = document.getElementById('pendingNavBadge');
    if (badge) {
      badge.textContent = stats.pendingCount;
      badge.style.display = stats.pendingCount > 0 ? 'inline-block' : 'none';
    }

  } catch (err) {
    console.error('Error loading stats:', err);
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

  content.innerHTML = `
    <div class="receipt-paper">
      <!-- Flyer Header -->
      <div class="receipt-header">
        <div class="receipt-brand">
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:4px;">
            <img src="/assets/logo.jpeg" alt="Batery Clean" style="height:58px; width:auto; max-width:82px; object-fit:contain; border-radius:6px;">
            <div>
              <h2 style="margin:0; line-height:1.1; font-size:1.3rem; color:#004b93; font-weight:900;">LAVANDERÍA <br><span style="color:#00a844;">BATERY CLEAN</span></h2>
              <p style="margin:2px 0 0; font-weight:bold; color:#0056b3; font-size:0.75rem;">⚡ Lavado de Alta Energía ⚡</p>
            </div>
          </div>
          <p style="font-size:0.75rem; margin:2px 0;">📍 Calle Villa Alegre 603, Nacimiento</p>
          <p style="font-size:0.75rem; margin:2px 0;">📞 +569 68096021 | 📸 @lavanderiabateryclean_</p>
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
          <strong>Fecha Entrega:</strong>
          <span>${formatDate(order.delivery_date)}</span>
        </div>
        <div class="receipt-client-row" style="grid-column: span 2;">
          <strong>Cliente:</strong>
          <span style="font-weight:700; text-transform:uppercase;">${order.client_name}</span>
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
          <span style="margin-left: 1rem; font-weight:700;">Estado Pago:</span>
          <span style="color:${order.payment_status === 'PAGADO' ? '#15803d' : '#b45309'}; font-weight:bold;">
            ${order.payment_status}
          </span>
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

      <!-- Terms & Conditions verbatim from flyer -->
      <div class="receipt-terms">
        <strong style="display:block; text-align:center; font-size:0.75rem; margin-bottom:3px; color:#004b93;">TÉRMINOS Y CONDICIONES</strong>
        <div>1. La ropa se recibe en buen estado, y se entrega en el mismo estado, salvo desgaste normal por el proceso de lavado y secado.</div>
        <div>2. No nos hacemos responsables por prendas de valor, dinero u objetos olvidados en las prendas.</div>
        <div>3. En caso de pérdida o daño, se hará el reembolso del valor de la prenda, según su depreciación.</div>
        <div>4. El cliente deberá revisar su ropa al momento de la entrega.</div>
        <div>5. Este comprobante es su respaldo de recepción.</div>
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
  const pedidosTab = document.querySelector('.nav-tab[data-target="pedidos-list"]');
  if (pedidosTab) pedidosTab.click();
}

async function loadSalesReport() {
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const paymentSelect = document.getElementById('reportPaymentStatus');
  const docSelect = document.getElementById('reportDocType');

  const startDate = startInput ? startInput.value : '';
  const endDate = endInput ? endInput.value : '';
  const paymentStatus = paymentSelect ? paymentSelect.value : 'TODOS';
  const documentType = docSelect ? docSelect.value : 'TODOS';

  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (paymentStatus && paymentStatus !== 'TODOS') params.append('paymentStatus', paymentStatus);
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
    if (elTotalOrders) elTotalOrders.textContent = `${s.totalOrders || 0} pedidos (Ticket: ${formatMoney(s.averageTicket || 0)})`;
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

    // 7. Render Detailed Orders Table
    renderReportOrdersTable(data.orders || []);

  } catch (err) {
    console.error('Error al cargar reporte de ventas:', err);
    showToast('Error al calcular el reporte: ' + err.message, 'error');
  }
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

  if (elProcCount) elProcCount.textContent = countMap['EN_PROCESO'] || 0;
  if (elProcAmt) elProcAmt.textContent = `${formatMoney(totalMap['EN_PROCESO'] || 0)} en lavado/secado`;

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

  // Ready for pickup list
  renderReadyPickupTable((workshop && workshop.readyForPickup) || []);
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
    const itemsTooltip = (o.itemsSummary || '').replace(/"/g, '&quot;');

    rowsHtml += `
      <tr>
        <td><strong style="color: #d90429; font-size: 0.95rem;">${o.folio}</strong></td>
        <td>
          <span>${formatDate(o.reception_date)}</span>
        </td>
        <td>
          <strong style="color: #071933;">${o.client_name}</strong>
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
          </span>
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

  if (!query) {
    renderReportOrdersTable(state.lastReportData.orders);
    return;
  }

  const filtered = state.lastReportData.orders.filter(o => 
    o.folio.toLowerCase().includes(query) ||
    o.client_name.toLowerCase().includes(query) ||
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
    'Fecha Entrega',
    'Cliente',
    'Telefono',
    'Prendas Detalle',
    'Cantidad Prendas',
    'Tipo Documento',
    'Estado Pedido',
    'Estado Pago',
    'Total (CLP)'
  ];

  const rows = orders.map(o => [
    `"${o.folio}"`,
    `"${o.reception_date || ''}"`,
    `"${o.delivery_date || ''}"`,
    `"${(o.client_name || '').replace(/"/g, '""')}"`,
    `"${(o.client_phone || '').replace(/"/g, '""')}"`,
    `"${(o.itemsSummary || '').replace(/"/g, '""')}"`,
    o.itemsCount || 0,
    `"${o.document_type || 'BOLETA'}"`,
    `"${o.status || ''}"`,
    `"${o.payment_status || ''}"`,
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
              <button type="button" class="btn btn-sm btn-primary" onclick="openExpenseModalById(${e.id})" title="Editar datos del gasto">
                ✏️ Editar
              </button>
              <button type="button" class="btn btn-sm btn-danger" onclick="openDeleteExpenseModalById(${e.id})" title="Eliminar gasto">
                🗑️
              </button>
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

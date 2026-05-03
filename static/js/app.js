// ─── State ────────────────────────────────────────────────────────────────────
let currentUser  = null;
let allProducts  = [];
let cartItems    = [];
let activeFilter = 'All';

// ══════════════════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════════════════
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById(name + 'Section');
  if (sec) sec.classList.add('active');

  // Highlight nav
  const map = { home: 0, shop: 1, orders: 2 };
  const links = document.querySelectorAll('.nav-link');
  if (map[name] !== undefined && links[map[name]]) links[map[name]].classList.add('active');

  if (name === 'shop')   loadProducts();
  if (name === 'cart')   loadCart();
  if (name === 'orders') loadMyOrders();
  if (name === 'admin')  loadAdminDashboard();
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1))
  );
  document.getElementById('loginForm').style.display  = tab === 'login'  ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════
async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) { showToast('⚠️ Please fill in all fields.'); return; }

  const { ok, data } = await api('/api/auth/login', 'POST', { email, password });
  if (!ok) { showToast('❌ ' + (data.message || 'Login failed.')); return; }

  setCurrentUser(data.user);
  showToast(`👋 Welcome back, ${data.user.name}!`);
}

async function handleSignup() {
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value.trim();
  if (!name || !email || !password) { showToast('⚠️ Please fill in all fields.'); return; }

  const { ok, data } = await api('/api/auth/signup', 'POST', { name, email, password });
  if (!ok) { showToast('❌ ' + (data.message || 'Signup failed.')); return; }

  setCurrentUser(data.user);
  showToast(`🎉 Welcome, ${data.user.name}! Account created.`);
}

async function logout() {
  await api('/api/auth/logout', 'POST');
  currentUser = null; cartItems = [];
  document.getElementById('mainApp').style.display  = 'none';
  document.getElementById('authPage').classList.add('active');
  document.getElementById('adminNavLink').style.display = 'none';
  updateCartBadge();
}

function setCurrentUser(user) {
  currentUser = user;
  document.getElementById('authPage').classList.remove('active');
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('navAvatar').textContent  = user.name[0].toUpperCase();
  document.getElementById('navUserName').textContent = user.name;
  if (user.role === 'admin') document.getElementById('adminNavLink').style.display = 'block';

  loadProducts();
  loadCartSilent();
  loadHomeStats();
  showSection('home');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════
async function loadProducts() {
  const search = document.getElementById('searchInput')?.value || '';
  let url = `/api/products?search=${encodeURIComponent(search)}`;
  if (activeFilter !== 'All') url += `&category=${encodeURIComponent(activeFilter)}`;

  const { ok, data } = await api(url);
  if (!ok) { showToast('❌ Could not load products.'); return; }

  allProducts = data;
  renderFilterTabs();
  renderProductGrid();
}

function renderFilterTabs() {
  const { ok, data } = []; // use allProducts categories
  const categories = ['All', ...new Set(allProducts.map(p => p.category))];
  document.getElementById('filterTabs').innerHTML = categories.map(c => `
    <button class="filter-tab${c === activeFilter ? ' active' : ''}" onclick="setFilter('${c}')">${c}</button>
  `).join('');
}

function renderProductGrid() {
  const grid = document.getElementById('productsGrid');
  if (!allProducts.length) {
    grid.innerHTML = '<div class="loading">No products found.</div>';
    return;
  }
  grid.innerHTML = allProducts.map(p => `
    <div class="product-card" onclick="addToCart('${p._id}')">
      <div class="product-img">
        ${p.badge ? `<span class="product-badge${p.badge === 'organic' ? ' organic' : ''}">${p.badge}</span>` : ''}
        ${p.emoji}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-weight">${p.unit}</div>
        <div class="product-bottom">
          <div class="product-price">₹${p.price} <span>/ ${p.unit}</span></div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart('${p._id}')">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

function setFilter(cat) {
  activeFilter = cat;
  loadProducts();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CART
// ══════════════════════════════════════════════════════════════════════════════
async function loadCartSilent() {
  const { ok, data } = await api('/api/cart');
  if (ok) { cartItems = data; updateCartBadge(); }
}

async function loadCart() {
  const { ok, data } = await api('/api/cart');
  if (!ok) { document.getElementById('cartContent').innerHTML = '<div class="loading">Could not load cart.</div>'; return; }
  cartItems = data;
  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const total = cartItems.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartCount').textContent = total;
}

function renderCart() {
  const el = document.getElementById('cartContent');
  if (!cartItems.length) {
    el.innerHTML = `<div class="cart-empty"><div class="empty-icon">🛒</div><p>Your cart is empty.<br><a href="#" onclick="showSection('shop')" style="color:var(--green-mid);font-weight:600;">Start shopping →</a></p></div>`;
    return;
  }
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal > 299 ? 0 : 40;
  const total    = subtotal + delivery;

  el.innerHTML = `
    <div class="cart-items">
      ${cartItems.map(item => `
        <div class="cart-item">
          <div class="cart-item-emoji">${item.emoji}</div>
          <div class="cart-item-details">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">₹${item.price} × ${item.qty}</div>
          </div>
          <div class="cart-qty">
            <button class="qty-btn" onclick="updateCartItem('${item.product_id}', ${item.qty - 1})">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" onclick="updateCartItem('${item.product_id}', ${item.qty + 1})">+</button>
          </div>
          <div class="cart-item-total">₹${item.price * item.qty}</div>
          <button class="remove-btn" onclick="updateCartItem('${item.product_id}', 0)" title="Remove">✕</button>
        </div>
      `).join('')}
    </div>
    <div class="cart-summary">
      <div class="summary-row"><span>Subtotal</span><span>₹${subtotal}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? '<span style="color:var(--green-accent);font-weight:600">FREE</span>' : '₹' + delivery}</span></div>
      ${subtotal <= 299 ? `<div class="summary-row" style="color:var(--green-accent);font-size:12px"><span>Add ₹${300 - subtotal} more for free delivery!</span></div>` : ''}
      <div class="summary-total"><span>Total</span><span>₹${total}</span></div>
      <button class="checkout-btn" onclick="placeOrder()">Place Order →</button>
    </div>
  `;
}

async function addToCart(productId) {
  const product = allProducts.find(p => p._id === productId);
  const { ok, data } = await api('/api/cart/add', 'POST', { product_id: productId, qty: 1 });
  if (!ok) { showToast('❌ Could not add to cart.'); return; }
  cartItems = data.cart;
  updateCartBadge();
  if (product) showToast(`🛒 ${product.emoji} ${product.name} added to cart`);
}

async function updateCartItem(productId, qty) {
  const { ok, data } = await api('/api/cart/update', 'PUT', { product_id: productId, qty });
  if (!ok) { showToast('❌ Could not update cart.'); return; }
  cartItems = data.cart;
  updateCartBadge();
  renderCart();
}

async function placeOrder() {
  const { ok, data } = await api('/api/orders', 'POST');
  if (!ok) { showToast('❌ ' + (data.error || 'Could not place order.')); return; }
  cartItems = [];
  updateCartBadge();
  document.getElementById('orderIdDisplay').textContent = data.order_id;
  document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('active');
  showToast('🎉 Order confirmed! Delivering soon.');
  showSection('shop');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MY ORDERS
// ══════════════════════════════════════════════════════════════════════════════
async function loadMyOrders() {
  const { ok, data } = await api('/api/orders/my');
  const el = document.getElementById('ordersContent');
  if (!ok) { el.innerHTML = '<div class="loading">Could not load orders.</div>'; return; }
  if (!data.length) { el.innerHTML = '<div class="cart-empty"><div class="empty-icon">📦</div><p>No orders yet.<br><a href="#" onclick="showSection(\'shop\')" style="color:var(--green-mid);font-weight:600;">Start shopping →</a></p></div>'; return; }

  el.innerHTML = data.map(o => {
    const date  = new Date(o.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    const items = o.items.map(i => `${i.emoji} ${i.name} ×${i.qty}`).join(', ');
    return `
      <div class="order-history-item">
        <div class="order-history-header">
          <span class="order-history-id">#ORD-${o._id.slice(-6).toUpperCase()}</span>
          <span class="order-status status-${o.status}">${o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
        </div>
        <div class="order-history-items">${items}</div>
        <div class="order-history-footer">
          <span class="order-history-total">₹${o.total}</span>
          <span class="order-history-date">${date}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOME STATS
// ══════════════════════════════════════════════════════════════════════════════
async function loadHomeStats() {
  const { ok, data } = await api('/api/products?search=');
  if (ok) document.getElementById('heroProductCount').textContent = data.length + '+';
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function loadAdminDashboard() {
  // Stats
  const { ok: sOk, data: stats } = await api('/api/admin/stats');
  if (sOk) {
    document.getElementById('aStat1').textContent = stats.total_products;
    document.getElementById('aStat2').textContent = stats.orders_today;
    document.getElementById('aStat3').textContent = '₹' + stats.revenue_today;
    document.getElementById('aStat4').textContent = stats.total_users;
  }

  // Inventory
  const { ok: pOk, data: products } = await api('/api/products');
  if (pOk) {
    document.getElementById('inventoryBody').innerHTML = products.map(p => {
      const cls   = p.stock > 50 ? 'stock-ok' : p.stock > 0 ? 'stock-low' : 'stock-out';
      const label = p.stock > 50 ? 'In Stock' : p.stock > 0 ? 'Low Stock' : 'Out of Stock';
      return `
        <tr>
          <td>${p.emoji} ${p.name}</td>
          <td>₹${p.price}</td>
          <td>${p.stock}</td>
          <td><span class="stock-badge ${cls}">${label}</span></td>
          <td>
            <button class="action-btn-sm btn-edit" onclick="adminEditStock('${p._id}','${p.name}',${p.stock})">Edit</button>
            <button class="action-btn-sm btn-delete" onclick="adminDeleteProduct('${p._id}','${p.name}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Orders
  const { ok: oOk, data: orders } = await api('/api/orders');
  if (oOk) {
    document.getElementById('adminOrdersList').innerHTML = orders.slice(0, 6).map(o => {
      const itemsSummary = o.items.slice(0,2).map(i => i.name).join(', ') + (o.items.length > 2 ? '…' : '');
      return `
        <div class="order-item">
          <div class="order-info">
            <div class="order-id">#${o._id.slice(-6).toUpperCase()} — ${o.user_name}</div>
            <div class="order-detail">${itemsSummary} · ₹${o.total}</div>
          </div>
          <select class="order-status status-${o.status}" onchange="adminUpdateOrderStatus('${o._id}', this.value)"
            style="border:none;cursor:pointer;font-size:11px;font-weight:600;border-radius:20px;padding:4px 10px;">
            ${['pending','processing','delivered','cancelled'].map(s =>
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }).join('');
  }
}

async function adminAddProduct() {
  const name  = document.getElementById('newName').value.trim();
  const emoji = document.getElementById('newEmoji').value.trim() || '🥦';
  const price = document.getElementById('newPrice').value;
  const unit  = document.getElementById('newUnit').value;
  const category = document.getElementById('newCategory').value;
  const stock = document.getElementById('newStock').value;

  if (!name || !price) { showToast('⚠️ Name and price are required.'); return; }

  const { ok, data } = await api('/api/products', 'POST', { name, emoji, price: +price, unit, category, stock: +stock, badge: 'fresh' });
  if (!ok) { showToast('❌ ' + (data.error || 'Failed to add product.')); return; }

  ['newName','newEmoji','newPrice','newStock'].forEach(id => document.getElementById(id).value = '');
  showToast(`✅ ${emoji} ${name} added to catalog!`);
  loadAdminDashboard();
}

async function adminDeleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const { ok } = await api(`/api/products/${id}`, 'DELETE');
  if (ok) { showToast(`🗑️ ${name} deleted.`); loadAdminDashboard(); }
  else showToast('❌ Could not delete product.');
}

async function adminEditStock(id, name, current) {
  const val = prompt(`Update stock for ${name} (current: ${current}):`, current);
  if (val === null) return;
  const stock = parseInt(val);
  if (isNaN(stock) || stock < 0) { showToast('⚠️ Invalid stock value.'); return; }
  const { ok } = await api(`/api/products/${id}`, 'PUT', { stock });
  if (ok) { showToast(`📦 ${name} stock updated to ${stock}`); loadAdminDashboard(); }
  else showToast('❌ Could not update stock.');
}

async function adminUpdateOrderStatus(id, status) {
  const { ok } = await api(`/api/orders/${id}/status`, 'PUT', { status });
  if (ok) showToast(`✅ Order status updated to ${status}`);
  else showToast('❌ Could not update status.');
}

// ══════════════════════════════════════════════════════════════════════════════
//  INIT — check if already logged in (session cookie persists)
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  const { ok, data } = await api('/api/auth/me');
  if (ok && data.logged_in) {
    setCurrentUser(data.user);
  }
})();

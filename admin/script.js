const APP_CONFIG = window.APP_CONFIG || {};
// Use the same key as login.js for consistency
const USER_KEY = "currentUser";
const pageLinks = document.querySelectorAll("[data-page-link]");
const pages = document.querySelectorAll(".page");
const menuButton = document.getElementById("menuButton");
const overlay = document.getElementById("overlay");
const productForm = document.getElementById("productForm");
const toast = document.getElementById("toast");
const dropZone = document.querySelector(".drop-zone");
const productImage = document.getElementById("productImage");
const logoutLink = document.getElementById("logoutLink");
const validPages = new Set(Array.from(pages, (page) => page.id.replace("page-", "")));
const hasSupabaseConfig = APP_CONFIG.SUPABASE_URL
  && APP_CONFIG.SUPABASE_ANON_KEY
  && !APP_CONFIG.SUPABASE_URL.startsWith("ISI_")
  && !APP_CONFIG.SUPABASE_ANON_KEY.startsWith("ISI_");
const db = window.supabase && hasSupabaseConfig
  ? window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY)
  : null;

const state = {
  products: [],
  orders: [],
  orderFilter: "all",
  paymentFilter: "all",
};

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}

function formatRp(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status) {
  return {
    pending: "Menunggu Konfirmasi",
    paid: "Dibayar", 
    processing: "Sedang Diproses",
    completed: "Selesai",
    rejected: "Ditolak",
    approved: "Disetujui",
    cancelled: "Dibatalkan",
  }[status] || status || "-";
}

function statusClass(status) {
  return {
    pending: "warning",
    paid: "info",
    processing: "info",
    completed: "success",
    rejected: "danger",
    cancelled: "danger",
    approved: "success",
  }[status] || "warning";
}

function requireDb() {
  if (db) return true;
  showToast("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase-config.js");
  return false;
}

function updateRealTimeDate() {
  const dateElement = document.getElementById("currentDateDisplay"); // Pastikan ID ini ada di HTML
  if (dateElement && state.orders.length > 0) {
    const now = new Date();
    dateElement.textContent = now.toLocaleString("id-ID", { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Update dropdown rentang tanggal agar dinamis
  const rangeSelect = document.getElementById("dateRangeSelect");
  if (rangeSelect && (rangeSelect.options.length <= 1 || rangeSelect.options[0].text.includes("Memuat"))) {
    const now = new Date();
    const firstDayCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayCurrent = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const fmtRange = (s, e) => `${s.toLocaleDateString("id-ID", { day: '2-digit', month: 'short' })} - ${e.toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' })}`;

    rangeSelect.innerHTML = `
      <option value="current">${fmtRange(firstDayCurrent, lastDayCurrent)}</option>
      <option value="prev">${fmtRange(firstDayPrev, lastDayPrev)}</option>
    `;
  }
  refreshIcons();

  setText("reportDate", new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }));
}

function showPage(pageName, updateHash = true) {
  if (!validPages.has(pageName)) pageName = "dashboard";

  pages.forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageName}`);
  });

  pageLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.pageLink === pageName);
  });

  document.body.classList.remove("menu-open");
  if (updateHash) {
    history.replaceState(null, "", `#${pageName}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (pageName === "dashboard") {
    renderDashboard();
    requestAnimationFrame(drawSalesChart);
    updateRealTimeDate();
  }
}

async function loadAll() {
  if (!requireDb()) return;
  await Promise.all([loadProducts(), loadOrders()]);
  renderDashboard();
  updateRealTimeDate();
  renderProducts();
  renderOrders();
  renderPayments();
  renderCustomers();
  renderReports();
  requestAnimationFrame(drawSalesChart);
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Gagal memuat produk: " + error.message);
    return;
  }
  state.products = data || [];
}

async function loadOrders() {
  const { data, error } = await db
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Gagal memuat pesanan: " + error.message);
    return;
  }
  state.orders = data || [];
}

function renderDashboard() {
  const paidOrders = state.orders.filter((order) => ["paid", "completed"].includes(order.status));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const customers = new Set(state.orders.map((order) => order.customer_email).filter(Boolean)).size;
  const completed = state.orders.filter((order) => order.status === "completed").length;

  const cards = document.querySelectorAll("#page-dashboard .metric-card");
  const values = [formatRp(revenue), state.orders.length, customers, formatRp(revenue)];
  cards.forEach((card, index) => {
    const value = card.querySelector("strong");
    const note = card.querySelector("em");
    if (value) value.textContent = values[index] ?? "0";
    if (note) note.textContent = "Data langsung dari Supabase";
  });

  const summary = document.querySelectorAll(".summary-list dd");
  const activeProducts = state.products.filter((item) => item.is_active && item.approval_status !== "rejected").length;
  const summaryValues = [
    state.products.length,
    activeProducts,
    state.orders.filter((item) => item.status === "pending").length,
    state.orders.filter((item) => item.status === "paid").length,
    completed,
    state.orders.filter((item) => ["rejected", "cancelled"].includes(item.status)).length,
  ];
  summary.forEach((item, index) => {
    item.textContent = summaryValues[index] ?? 0;
  });
}

function renderProducts() {
  const rows = document.getElementById("productRows");
  if (!rows) return;

  if (!state.products.length) {
    rows.innerHTML = `<tr><td colspan="7">Belum ada produk.</td></tr>`;
    return;
  }

  rows.innerHTML = state.products.map((product, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><span class="product-cell">${product.image_url ? `<img class="admin-thumb-img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}"/>` : '<span class="thumb gray"></span>'}${escapeHtml(product.name)}</span></td>
      <td>${escapeHtml(product.category || "umum")}</td>
      <td>${formatRp(product.price)}</td>
      <td>${Number(product.stock || 0)}</td>
      <td><span class="status ${product.is_active ? "success" : "danger"}">${product.is_active ? "Aktif" : "Nonaktif"}</span></td>
      <td class="actions">
        <button type="button" onclick="editProduct('${escapeJs(product.id)}')" aria-label="Edit"><i data-lucide="pencil"></i></button>
        <button type="button" onclick="toggleProduct('${escapeJs(product.id)}', ${product.is_active ? "false" : "true"})" aria-label="Ubah status"><i data-lucide="${product.is_active ? "eye-off" : "eye"}"></i></button>
        <button type="button" onclick="deleteProduct('${escapeJs(product.id)}')" class="danger" aria-label="Hapus"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>
  `).join("");
  refreshIcons();
}

function renderOrders() {
  const rows = document.getElementById("orderRows");
  if (!rows) return;

  const filteredOrders = state.orders.filter(order => {
    if (state.orderFilter === "all") return true;
    return order.status === state.orderFilter;
  });

  if (!filteredOrders.length) {
    rows.innerHTML = `<tr><td colspan="7" class="empty-state" style="text-align: center; padding: 2rem; color: #8a95a6;">Belum ada pesanan dalam status ini.</td></tr>`;
    return;
  }

  rows.innerHTML = filteredOrders.map((order, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(order.order_number)}</td>
      <td>${escapeHtml(order.customer_name || "-")}</td>
      <td>${formatRp(order.total_amount)}</td>
      <td><span class="status ${statusClass(order.status)}">${statusLabel(order.status)}</span></td>
      <td>${formatDate(order.created_at)}</td>
      <td class="actions">
        ${order.payment_proof_url ? `<button type="button" onclick="openProof('${escapeJs(order.payment_proof_url)}')" aria-label="Bukti"><i data-lucide="image"></i></button>` : ""}
        ${order.status === "pending" ? `<button type="button" class="btn-process" onclick="updateOrderStatus('${escapeJs(order.id)}','paid')" title="Konfirmasi Pembayaran"><i data-lucide="check-circle"></i></button><button type="button" class="btn-reject" onclick="rejectOrder('${escapeJs(order.id)}')" title="Tolak Pesanan"><i data-lucide="x-circle"></i></button>` : ""}
        ${order.status === "paid" ? `<button type="button" class="btn-process" onclick="updateOrderStatus('${escapeJs(order.id)}','processing')" title="Proses Pesanan"><i data-lucide="package"></i></button>` : ""}
        ${order.status === "processing" ? `<button type="button" class="btn-complete" onclick="updateOrderStatus('${escapeJs(order.id)}','completed')" title="Selesaikan Pesanan"><i data-lucide="check-circle"></i></button>` : ""}
      </td>
    </tr>
  `).join("");
  refreshIcons();
}

function renderPayments() {
  const rows = document.getElementById("paymentRows");
  if (!rows) return;

  const orders = state.paymentFilter === "all"
    ? state.orders
    : state.orders.filter((order) => order.status === state.paymentFilter);

  if (!orders.length) {
    rows.innerHTML = `<tr><td colspan="9">Tidak ada data pembayaran.</td></tr>`;
    return;
  }

  rows.innerHTML = orders.map((order, index) => `
    <tr data-status="${escapeHtml(order.status)}">
      <td>${index + 1}</td>
      <td>PAY-${escapeHtml(String(order.order_number || "").replace(/[^a-z0-9]/gi, "").slice(-8) || index + 1)}</td>
      <td>${escapeHtml(order.order_number)}</td>
      <td>${escapeHtml(order.customer_name || "-")}</td>
      <td>${escapeHtml(order.payment_method || "Transfer Bank")}</td>
      <td>${formatRp(order.total_amount)}</td>
      <td><span class="status ${statusClass(order.status)}">${statusLabel(order.status)}</span></td>
      <td>${formatDate(order.created_at)}</td>
      <td class="actions">${order.payment_proof_url ? `<button type="button" onclick="openProof('${escapeJs(order.payment_proof_url)}')" aria-label="Bukti"><i data-lucide="eye"></i></button>` : "-"}</td>
    </tr>
  `).join("");
  refreshIcons();
}

function renderCustomers() {
  const rows = document.getElementById("customerRows");
  if (!rows) return;

  const customers = new Map();
  state.orders.forEach((order) => {
    const email = order.customer_email || "-";
    const current = customers.get(email) || {
      name: order.customer_name || "-",
      email,
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += Number(order.total_amount || 0);
    customers.set(email, current);
  });

  const list = Array.from(customers.values());
  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="6">Belum ada pelanggan.</td></tr>`;
    return;
  }

  rows.innerHTML = list.map((customer, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(customer.name)}</td>
      <td>${escapeHtml(customer.email)}</td>
      <td>${customer.count}</td>
      <td>${formatRp(customer.total)}</td>
      <td><span class="status ${customer.count > 1 ? "success" : "warning"}">${customer.count > 1 ? "Aktif" : "Baru"}</span></td>
    </tr>
  `).join("");
}

function renderReports() {
  const paidOrders = state.orders.filter((order) => ["paid", "completed"].includes(order.status));
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const rejected = state.orders.filter((order) => ["rejected", "cancelled"].includes(order.status)).length;
  const sold = state.orders.flatMap((order) => order.order_items || [])
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  setText("reportRevenue", formatRp(revenue));
  setText("reportItemsSold", sold);
  setText("reportRejected", rejected);

  const rows = document.getElementById("reportRows");
  if (!rows) return;

  const groups = new Map();
  state.orders.forEach((order) => {
    const date = order.created_at ? new Date(order.created_at) : new Date();
    const key = date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const item = groups.get(key) || { count: 0, total: 0 };
    item.count += 1;
    if (["paid", "completed"].includes(order.status)) item.total += Number(order.total_amount || 0);
    groups.set(key, item);
  });

  const list = Array.from(groups.entries());
  rows.innerHTML = list.length
    ? list.map(([period, item]) => `<tr><td>${period}</td><td>${item.count}</td><td>${formatRp(item.total)}</td><td>Rp 0</td><td>${formatRp(item.total)}</td></tr>`).join("")
    : `<tr><td colspan="5">Belum ada laporan.</td></tr>`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function saveProduct(event) {
  event.preventDefault();
  if (!requireDb()) return;

  const id = document.getElementById("productId").value;
  const name = document.getElementById("productName").value.trim();
  const category = document.getElementById("productCategory").value || "umum";
  const price = Number(document.getElementById("productPrice").value || 0);
  const stock = Number(document.getElementById("productStock").value || 0);
  const description = document.getElementById("productDescription").value.trim();
  const button = document.getElementById("saveProductButton");

  if (!name || price <= 0) {
    showToast("Nama dan harga produk wajib diisi");
    return;
  }

  button.disabled = true;
  button.textContent = "Menyimpan...";

  try {
    const payload = { name, category, price, stock, description, approval_status: "approved", is_active: true };
    const file = productImage?.files?.[0];

    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `product_${Date.now()}.${ext}`;
      const { error: uploadError } = await db.storage.from("product-images").upload(fileName, file);
      if (uploadError) throw new Error(uploadError.message);
      const { data } = db.storage.from("product-images").getPublicUrl(fileName);
      payload.image_url = data.publicUrl;
    }

    const result = id
      ? await db.from("products").update(payload).eq("id", id)
      : await db.from("products").insert(payload);

    if (result.error) throw new Error(result.error.message);
    showToast(id ? "Barang berhasil diperbarui" : "Barang berhasil disimpan");
    productForm.reset();
    document.getElementById("productId").value = "";
    button.textContent = "Simpan";
    await loadProducts();
    renderProducts();
    renderDashboard();
  } catch (error) {
    showToast("Gagal menyimpan produk: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Simpan";
  }
}

window.editProduct = function editProduct(id) {
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) return;
  document.getElementById("productId").value = product.id;
  document.getElementById("productName").value = product.name || "";
  document.getElementById("productCategory").value = product.category || "umum";
  document.getElementById("productPrice").value = product.price || 0;
  document.getElementById("productStock").value = product.stock || 0;
  document.getElementById("productDescription").value = product.description || "";
  showPage("barang");
};

window.toggleProduct = async function toggleProduct(id, isActive) {
  if (!requireDb()) return;
  const { error } = await db.from("products").update({ is_active: isActive }).eq("id", id);
  if (error) return showToast("Gagal mengubah status produk");
  await loadProducts();
  renderProducts();
  renderDashboard();
};

window.deleteProduct = async function deleteProduct(id) {
  if (!confirm("Hapus barang ini?")) return;
  if (!requireDb()) return;
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) return showToast("Gagal menghapus barang");
  showToast("Barang berhasil dihapus");
  await loadProducts();
  renderProducts();
  renderDashboard();
};

window.updateOrderStatus = async function updateOrderStatus(id, status) {
  if (!requireDb()) return;
  
  // Catatan: Pengurangan stok tidak perlu dilakukan manual di sini karena 
  // sudah ditangani secara otomatis oleh trigger 'trg_reduce_stock_on_order_completion' di database.
  const { error } = await db.from("orders").update({ status }).eq("id", id);
  if (error) return showToast("Gagal mengubah status pesanan");
  showToast("Status pesanan menjadi " + statusLabel(status));
  
  await Promise.all([loadOrders(), loadProducts()]);
  renderDashboard();
  renderOrders();
  renderPayments();
  renderCustomers();
  renderReports();
};

window.rejectOrder = async function rejectOrder(id) {
  const reason = prompt("Alasan penolakan pesanan:");
  if (!reason) return;
  if (!requireDb()) return;
  const { error } = await db.from("orders").update({ status: "rejected", rejected_reason: reason }).eq("id", id);
  if (error) return showToast("Gagal menolak pesanan");
  showToast("Pesanan ditolak");
  await loadOrders();
  renderDashboard();
  renderOrders();
  renderPayments();
  renderCustomers();
  renderReports();
};

window.openProof = function openProof(url) {
  window.open(url, "_blank", "noopener,noreferrer");
};

document.querySelectorAll("[data-tabs] button").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.paymentFilter = tab.dataset.filter;
    document.querySelectorAll("[data-tabs] button").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });
    renderPayments();
  });
});

document.querySelectorAll("[data-tabs-pesanan] button").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.orderFilter = tab.dataset.filter;
    document.querySelectorAll("[data-tabs-pesanan] button").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });
    renderOrders();
  });
});

pageLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(link.dataset.pageLink);
  });
});

menuButton?.addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});

overlay?.addEventListener("click", () => {
  document.body.classList.remove("menu-open");
});

logoutLink?.addEventListener("click", () => {
  sessionStorage.removeItem(USER_KEY);
});

productForm?.addEventListener("submit", saveProduct);
productForm?.addEventListener("reset", () => {
  document.getElementById("productId").value = "";
});


if (dropZone && productImage) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    productImage.files = event.dataTransfer.files;
    showToast(`${event.dataTransfer.files.length} gambar dipilih`);
  });

  productImage.addEventListener("change", () => {
    if (productImage.files.length) showToast(`${productImage.files.length} gambar dipilih`);
  });
}

function drawSalesChart() {
  const canvas = document.getElementById("salesChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width));
  const height = 260;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const daily = new Array(30).fill(0);
  const now = new Date();
  state.orders.forEach((order) => {
    if (!["paid", "completed"].includes(order.status)) return;
    const date = new Date(order.created_at);
    const diff = Math.floor((now - date) / 86400000);
    if (diff >= 0 && diff < 30) daily[29 - diff] += Number(order.total_amount || 0);
  });

  const values = daily.some(Boolean) ? daily : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(10, Math.ceil(Math.max(...values) / 10) * 10);
  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  // Garis Horizontal Grid
  ctx.strokeStyle = "rgba(229, 234, 242, 0.7)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.font = "500 11px Inter, sans-serif";
  ctx.fillStyle = "#8a95a6";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  [0, max / 4, max / 2, (max * 3) / 4, max].forEach((tick) => {
    const y = pad.top + chartH - (tick / max) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    
    let tickLabel = "Rp 0";
    if (tick > 0) {
      if (tick >= 1000000) tickLabel = `Rp ${(tick / 1000000).toFixed(1)}jt`;
      else if (tick >= 1000) tickLabel = `Rp ${Math.round(tick / 1000)}rb`;
      else tickLabel = `Rp ${tick}`;
    }
    ctx.fillText(tickLabel, pad.left - 10, y);
  });

  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labelIndices = [0, 7, 14, 21, 29];
  labelIndices.forEach((idx) => {
    const x = pad.left + (idx / (values.length - 1)) * chartW;
    const labelDate = new Date(now);
    labelDate.setDate(now.getDate() - (29 - idx));
    
    const dateStr = labelDate.toLocaleDateString("id-ID", { day: '2-digit', month: 'short' });
    ctx.fillStyle = "#8a95a6";
    ctx.fillText(dateStr, x, height - pad.bottom + 12);
  });

  const points = values.map((value, index) => ({
    x: pad.left + (index / (values.length - 1)) * chartW,
    y: pad.top + chartH - (value / max) * chartH
  }));

  // Gradient Bawah Garis (Area Chart)
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(37, 99, 255, 0.3)");
  gradient.addColorStop(1, "rgba(37, 99, 255, 0.0)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + chartH);
  points.forEach((point, i) => {
    if (i === 0) ctx.lineTo(point.x, point.y);
    else {
      const prev = points[i - 1];
      const cpX = (prev.x + point.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, point.y, point.x, point.y);
    }
  });
  ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Garis Grafik (Curved)
  ctx.beginPath();
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else {
      const prev = points[i - 1];
      const cpX = (prev.x + point.x) / 2;
      ctx.bezierCurveTo(cpX, prev.y, cpX, point.y, point.x, point.y);
    }
  });

  // Shadow Garis
  ctx.shadowColor = "rgba(37, 99, 255, 0.4)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  
  ctx.strokeStyle = "#2563ff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.shadowColor = "transparent";

  // Titik Data Bulat
  points.forEach((point, i) => {
    if (labelIndices.includes(i) || point.y < pad.top + chartH) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2563ff";
      ctx.stroke();
    }
  });
}

window.addEventListener("resize", drawSalesChart);
window.addEventListener("hashchange", () => {
  showPage(location.hash.slice(1) || "dashboard", false);
});
window.addEventListener("load", async () => {
  let savedUser = null;
  try {
    savedUser = JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
  } catch (error) {
    // Corrupt data, clear it
    sessionStorage.removeItem(USER_KEY);
  }

  // Validate user data has required fields and is admin
  if (!savedUser || !savedUser.email || !savedUser.role || savedUser.role !== 'admin') {
    // Clear any invalid session data to prevent redirect loops
    sessionStorage.removeItem(USER_KEY);
    window.location.href = "../login/index.html";
    return;
  }
  refreshIcons();
  showPage(location.hash.slice(1) || "dashboard", false);
  await loadAll();
  
  // Jalankan interval agar waktu terus berjalan (Real-time)
  setInterval(updateRealTimeDate, 1000);
});

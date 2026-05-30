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
  discounts: [],
  orders: [],
  paymentFilter: "all",
  approvalFilter: "pending", // Default filter untuk persetujuan barang
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
  if (dateElement) {
    const now = new Date();
    dateElement.textContent = now.toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
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
  await Promise.all([loadProducts(), loadDiscounts(), loadOrders()]);
  renderDashboard();
  updateRealTimeDate();
  renderProducts();
  renderDiscounts();
  renderOrders();
  renderPayments();
  renderApprovals();
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

async function loadDiscounts() {
  const { data, error } = await db
    .from("discounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Gagal memuat diskon: " + error.message);
    return;
  }
  state.discounts = data || [];
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

function renderDiscounts() {
  const rows = document.getElementById("discountRows");
  if (!rows) return;

  if (!state.discounts.length) {
    rows.innerHTML = `<tr><td colspan="8">Belum ada diskon.</td></tr>`;
    return;
  }

  rows.innerHTML = state.discounts.map((discount) => `
    <tr>
      <td>${escapeHtml(discount.code)}</td>
      <td>${escapeHtml(discount.name)}</td>
      <td>${discount.discount_type === "fixed" ? "Nominal" : "Persentase"}</td>
      <td>${discount.discount_type === "fixed" ? formatRp(discount.value) : `${Number(discount.value || 0)}%`}</td>
      <td>${formatRp(discount.minimum_order)}</td>
      <td>${escapeHtml(discount.starts_at || "-")} - ${escapeHtml(discount.ends_at || "-")}</td>
      <td><span class="status ${discount.is_active ? "success" : "danger"}">${discount.is_active ? "Aktif" : "Tidak Aktif"}</span></td>
      <td class="actions">
        <button type="button" onclick="toggleDiscount('${escapeJs(discount.id)}', ${discount.is_active ? "false" : "true"})" aria-label="Ubah status"><i data-lucide="${discount.is_active ? "eye-off" : "eye"}"></i></button>
        <button type="button" onclick="deleteDiscount('${escapeJs(discount.id)}')" aria-label="Hapus"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>
  `).join("");
  refreshIcons();
}

function renderOrders() {
  const rows = document.getElementById("orderRows");
  if (!rows) return;

  if (!state.orders.length) {
    rows.innerHTML = `<tr><td colspan="7">Belum ada pesanan.</td></tr>`;
    return;
  }

  rows.innerHTML = state.orders.map((order, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(order.order_number)}</td>
      <td>${escapeHtml(order.customer_name || "-")}</td>
      <td>${formatRp(order.total_amount)}</td>
      <td><span class="status ${statusClass(order.status)}">${statusLabel(order.status)}</span></td>
      <td>${formatDate(order.created_at)}</td>
      <td class="actions">
        ${order.payment_proof_url ? `<button type="button" onclick="openProof('${escapeJs(order.payment_proof_url)}')" aria-label="Bukti"><i data-lucide="image"></i></button>` : ""}
        ${order.status === "pending" ? `<button type="button" class="btn-process" onclick="updateOrderStatus('${escapeJs(order.id)}','processing')" title="Proses Pesanan"><i data-lucide="package"></i></button><button type="button" class="btn-reject" onclick="rejectOrder('${escapeJs(order.id)}')" title="Tolak Pesanan"><i data-lucide="x-circle"></i></button>` : ""}
        ${["paid", "processing"].includes(order.status) ? `<button type="button" class="btn-complete" onclick="updateOrderStatus('${escapeJs(order.id)}','completed')" title="Selesaikan Pesanan"><i data-lucide="check-circle"></i></button>` : ""}
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

function renderApprovals() {
  const rows = document.getElementById("approvalRows");
  if (!rows) return;

  if (!state.products.length) {
    rows.innerHTML = `<tr><td colspan="6">Belum ada produk.</td></tr>`;
    return;
  }

  // Filter products based on state.approvalFilter
  const filteredProducts = state.products.filter(product => {
    const currentStatus = product.approval_status || "pending"; // Default to 'pending' if not set
    if (state.approvalFilter === "all") return true;
    return currentStatus === state.approvalFilter;
  });

  if (!filteredProducts.length) {
    rows.innerHTML = `<tr><td colspan="6">Tidak ada produk dengan status ${statusLabel(state.approvalFilter)}.</td></tr>`;
    refreshIcons(); // Ensure icons are refreshed for empty state
    return;
  }

  rows.innerHTML = filteredProducts.map((product, index) => {
    const status = product.approval_status || "pending"; // Default to 'pending'
    let actionsHtml = '';

    if (status === 'pending') {
      actionsHtml = `
        <button class="approve" type="button" onclick="updateProductApproval('${escapeJs(product.id)}','approved')">Setujui</button>
        <button class="reject" type="button" onclick="updateProductApproval('${escapeJs(product.id)}','rejected')">Tolak</button>
      `;
    } else if (status === 'rejected') {
      actionsHtml = `<button class="approve" type="button" onclick="updateProductApproval('${escapeJs(product.id)}','approved')">Setujui Kembali</button>`;
    } else if (status === 'approved') {
      actionsHtml = `<button class="reject" type="button" onclick="updateProductApproval('${escapeJs(product.id)}','rejected')">Tolak</button>`;
    }

    return `
      <tr>
        <td>${index + 1}</td>
        <td><span class="product-cell">${product.image_url ? `<img class="admin-thumb-img" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}"/>` : '<span class="thumb gray"></span>'}${escapeHtml(product.name)}</span></td>
        <td>${escapeHtml(product.seller_name || "Admin")}</td>
        <td>${formatDate(product.created_at)}</td>
        <td><span class="status ${statusClass(status)}">${statusLabel(status)}</span></td>
        <td class="approve-actions">${actionsHtml}</td>
      </tr>`;
  }).join("");
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
    renderApprovals();
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
  renderApprovals();
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
  renderApprovals();
  renderDashboard();
};

window.updateProductApproval = async function updateProductApproval(id, approvalStatus) {
  if (!requireDb()) return;
  const { error } = await db
    .from("products")
    .update({ approval_status: approvalStatus, is_active: approvalStatus === "approved" })
    .eq("id", id);
  if (error) return showToast("Gagal mengubah persetujuan");
  showToast(approvalStatus === "approved" ? "Produk disetujui" : "Produk ditolak");
  await loadProducts();
  renderProducts();
  renderApprovals();
};

window.updateOrderStatus = async function updateOrderStatus(id, status) {
  if (!requireDb()) return;
  
  // Jika status diubah ke 'completed', kurangi stok barang
  if (status === 'completed') {
    const order = state.orders.find(o => String(o.id) === String(id));
    if (order && order.order_items) {
      for (const item of order.order_items) {
        // Ambil stok terbaru langsung dari DB untuk menghindari clash data lama
        const { data: pData } = await db.from("products").select("stock").eq("id", item.product_id).single();
        if (pData) {
          const newStock = Math.max(0, Number(pData.stock || 0) - Number(item.quantity || 0));
          await db.from("products").update({ stock: newStock }).eq("id", item.product_id);
        }
      }
    }
  }

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

window.toggleDiscount = async function toggleDiscount(id, isActive) {
  if (!requireDb()) return;
  const { error } = await db.from("discounts").update({ is_active: isActive }).eq("id", id);
  if (error) return showToast("Gagal mengubah diskon");
  await loadDiscounts();
  renderDiscounts();
};

window.deleteDiscount = async function deleteDiscount(id) {
  if (!confirm("Hapus diskon ini?")) return;
  if (!requireDb()) return;
  const { error } = await db.from("discounts").delete().eq("id", id);
  if (error) return showToast("Gagal menghapus diskon");
  await loadDiscounts();
  renderDiscounts();
};

async function addDiscount() {
  if (!requireDb()) return;
  const code = prompt("Kode diskon:");
  if (!code) return;
  const name = prompt("Nama diskon:", code);
  if (!name) return;
  const value = Number(prompt("Nilai diskon. Contoh 10 untuk 10%:", "10") || 0);
  const minimum = Number(prompt("Minimum belanja:", "0") || 0);

  const { error } = await db.from("discounts").insert({
    code: code.trim().toUpperCase(),
    name: name.trim(),
    discount_type: "percent",
    value,
    minimum_order: minimum,
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    is_active: true,
  });

  if (error) return showToast("Gagal menambah diskon: " + error.message);
  await loadDiscounts();
  renderDiscounts();
}

document.querySelectorAll("[data-tabs] button").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.paymentFilter = tab.dataset.filter;
    document.querySelectorAll("[data-tabs] button").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });
    renderPayments();
  });
});

// Approval tabs handling for Persetujuan Barang page
document.querySelectorAll('#page-persetujuan .tabs button').forEach(tab => {
  tab.addEventListener('click', () => {
    const txt = tab.textContent.toLowerCase();
    // Map tab text to actual approval status values
    if (txt.includes('menunggu')) state.approvalFilter = 'pending';
    else if (txt.includes('disetujui')) state.approvalFilter = 'approved';
    else if (txt.includes('ditolak')) state.approvalFilter = 'rejected';
    else state.approvalFilter = 'all'; // Untuk tab "Semua"
    document.querySelectorAll('#page-persetujuan .tabs button').forEach(item => {
      item.classList.toggle('active', item === tab);
    });
    renderApprovals();
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
document.getElementById("addDiscountButton")?.addEventListener("click", addDiscount);

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
  const pad = { top: 18, right: 22, bottom: 34, left: 54 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  ctx.strokeStyle = "#e5eaf2";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = "12px Inter, Arial, sans-serif";
  ctx.fillStyle = "#8a95a6";

  [0, max / 4, max / 2, (max * 3) / 4, max].forEach((tick) => {
    const y = pad.top + chartH - (tick / max) * chartH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    
    // Label dinamis: Ribuan (rb) atau Jutaan (jt)
    let tickLabel = "Rp 0";
    if (tick > 0) {
      if (tick >= 1000000) tickLabel = `Rp ${(tick / 1000000).toFixed(1)} jt`;
      else if (tick >= 1000) tickLabel = `Rp ${Math.round(tick / 1000)} rb`;
      else tickLabel = `Rp ${tick}`;
    }
    ctx.fillText(tickLabel, 10, y + 4);
  });

  ctx.setLineDash([]);
  ctx.strokeStyle = "#2563ff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  values.forEach((value, index) => {
    const x = pad.left + (index / (values.length - 1)) * chartW;
    const y = pad.top + chartH - (value / max) * chartH;
    if (index === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
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
    sessionStorage.removeItem(USER_KEY);
  }

  if (savedUser?.role !== 'admin') {
    window.location.href = "../login/index.html";
    return;
  }
  refreshIcons();
  showPage(location.hash.slice(1) || "dashboard", false);
  await loadAll();
});

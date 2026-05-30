const CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  ADMIN_EMAILS: [],
  ...(window.APP_CONFIG || {}),
};
// Use the same key as login.js for consistency
const USER_KEY = "currentUser";
const hasSupabaseConfig = CONFIG.SUPABASE_URL
  && CONFIG.SUPABASE_ANON_KEY
  && !CONFIG.SUPABASE_URL.startsWith("ISI_")
  && !CONFIG.SUPABASE_ANON_KEY.startsWith("ISI_");
const db = window.supabase
  && hasSupabaseConfig
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

let state = {
  user: null,
  products: [],
  allProducts: [],
  cart: [],
  orders: [],
  currentProduct: null,
  currentQty: 1,
  currentCategory: "semua",
  currentPage: "store",
  paymentProofFile: null,
};

const TOAST_ICONS = {
  success: "check-circle-2",
  error: "circle-alert",
  info: "info",
  warning: "triangle-alert",
};

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function toast(message, type = "info", duration = 3200) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `<span class="toast-icon"><i data-lucide="${TOAST_ICONS[type] || TOAST_ICONS.info}"></i></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(item);
  refreshIcons();

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";
    item.style.transition = "all .2s ease";
    window.setTimeout(() => item.remove(), 220);
  }, duration);
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

function genOrderNumber() {
  return "INV/" + new Date().getFullYear() + "/" + Date.now().toString(36).toUpperCase();
}

function statusLabel(status) {
  return {
    pending: "Menunggu Konfirmasi",
    paid: "Dibayar",
    processing: "Sedang Diproses",
    rejected: "Dibatalkan",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  }[status] || status;
}

function getBadgeClass(status) {
  return {
    pending: "badge-pending",
    paid: "badge-paid",
    processing: "badge-paid",
    rejected: "badge-rejected",
    completed: "badge-completed",
    cancelled: "badge-rejected",
  }[status] || "badge-pending";
}

function productImage(product, altClass = "prod-placeholder") {
  if (product.image_url) {
    return `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy"/>`;
  }

  return `<div class="${altClass}"><i data-lucide="package"></i></div>`;
}

const App = {
  async init() {
    refreshIcons();

    try {
      const saved = sessionStorage.getItem(USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate user data before proceeding
        if (parsed && parsed.email && parsed.role) {
          state.user = parsed;
          this.applyLogin();
          await this.loadProducts();
          await this.loadUserOrders();
          this.navigate("store", false);
        } else {
          // Invalid data, clear it and redirect
          sessionStorage.removeItem(USER_KEY);
          this.showAuth();
        }
      } else {
        this.showAuth();
      }
    } catch (error) {
      sessionStorage.removeItem(USER_KEY);
      this.showAuth();
    } finally {
      const loader = document.getElementById("app-loader");
      if (loader) {
        loader.classList.add("fade-out");
        window.setTimeout(() => loader.classList.add("hidden"), 320);
      }
    }
  },

  showAuth() {
    // Prevent redirect loop: only redirect if not already redirecting
    if (!window._redirecting) {
      window._redirecting = true;
      sessionStorage.removeItem(USER_KEY);
      window.location.href = "../login/index.html";
    }
  },

  async loginEmail() {
    this.showAuth();
  },

  applyLogin() {
    if (!state.user) return;

    const name = state.user.email.split("@")[0];
    const initial = name[0]?.toUpperCase() || "U";

    document.getElementById("page-auth")?.classList.remove("active");
    document.getElementById("app-shell")?.classList.remove("hidden");

    this.setText("nav-avatar", initial);
    this.setText("nav-name", name);
    this.setText("mobile-avatar", initial);
    this.setText("mobile-user-name", name);
    this.setText("account-email", state.user.email);
    this.updateCartUI();
  },

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  async signOut() {
    sessionStorage.removeItem(USER_KEY);
    state.user = null;
    state.cart = [];
    state.orders = [];
    this.updateCartUI();
    this.showAuth();
    toast("Berhasil keluar", "info");
  },

  navigate(page, shouldScroll = true) {
    state.currentPage = page;
    document.querySelectorAll("#app-shell .page").forEach((item) => {
      item.classList.toggle("active", item.id === `page-${page}`);
    });

    document.querySelectorAll("[data-nav]").forEach((item) => {
      item.classList.toggle("active", item.dataset.nav === page);
    });

    if (page === "orders") this.loadUserOrders();
    if (page === "account") this.updateAccountStats();
    if (shouldScroll) window.scrollTo({ top: 0, behavior: "smooth" });
    refreshIcons();
  },

  focusSearch() {
    this.navigate("store");
    window.setTimeout(() => {
      const input = document.getElementById("search-input") || document.getElementById("nav-search-input");
      input?.focus();
    }, 180);
  },

  filterFromNav(value) {
    const mobileSearch = document.getElementById("search-input");
    if (mobileSearch) mobileSearch.value = value;
    this.filterProducts();
  },

  async loadProducts() {
    if (!db) {
      toast("Koneksi Supabase belum siap", "error");
      return;
    }

    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      toast("Gagal memuat produk", "error");
      return;
    }

    state.allProducts = data || [];
    state.products = [...state.allProducts];
    this.setText("stat-products", state.allProducts.length);
    this.setText("products-count", `${state.products.length} produk`);
    this.renderCategories();
    this.renderProducts();
    this.updateAccountStats();
  },

  renderCategories() {
    const categories = ["semua", ...new Set(state.allProducts.map((item) => item.category || "umum"))];
    const iconMap = {
      semua: "layout-grid",
      fashion: "shirt",
      elektronik: "smartphone",
      makanan: "utensils",
      minuman: "cup-soda",
      aksesoris: "gem",
      rumah: "home",
      umum: "package",
    };

    const tabs = document.getElementById("category-tabs");
    if (!tabs) return;

    tabs.innerHTML = categories.map((category) => {
      const label = category.charAt(0).toUpperCase() + category.slice(1);
      const icon = iconMap[category] || "tag";
      return `
        <button class="cat-chip ${category === state.currentCategory ? "active" : ""}" onclick="App.filterCategory('${escapeJs(category)}',this)">
          <i data-lucide="${icon}"></i>
          <span>${escapeHtml(label)}</span>
        </button>`;
    }).join("");

    refreshIcons();
  },

  filterCategory(category, element) {
    state.currentCategory = category;
    document.querySelectorAll("#category-tabs .cat-chip").forEach((item) => {
      item.classList.toggle("active", item === element);
    });
    this.filterProducts();
  },

  filterProducts() {
    const mobileValue = document.getElementById("search-input")?.value || "";
    const desktopValue = document.getElementById("nav-search-input")?.value || "";
    const query = (mobileValue || desktopValue).toLowerCase();

    state.products = state.allProducts.filter((product) => {
      const category = product.category || "umum";
      const matchCategory = state.currentCategory === "semua" || category === state.currentCategory;
      const matchQuery = !query
        || product.name?.toLowerCase().includes(query)
        || product.description?.toLowerCase().includes(query)
        || category.toLowerCase().includes(query);

      return matchCategory && matchQuery;
    });

    this.setText("products-count", `${state.products.length} produk`);
    this.renderProducts();
  },

  renderProducts() {
    const grid = document.getElementById("products-grid");
    if (!grid) return;

    if (!state.products.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="search-x"></i>
          <div class="empty-title">Produk tidak ditemukan</div>
          <div>Coba kata kunci lain atau pilih kategori berbeda.</div>
        </div>`;
      refreshIcons();
      return;
    }

    grid.innerHTML = state.products.map((product) => {
      const stock = Number(product.stock || 0);
      const soldText = Math.max(1, Math.min(99, stock + 7));
      const productId = escapeJs(product.id);

      return `
        <article class="product-card" onclick="App.openOrderModal('${productId}')">
          <div class="prod-image-wrap">
            ${productImage(product)}
            ${stock <= 0 ? '<div class="prod-out-of-stock"><span class="prod-out-badge">Stok Habis</span></div>' : ""}
          </div>
          <div class="prod-body">
            <div class="prod-category">${escapeHtml(product.category || "umum")}</div>
            <div class="prod-name">${escapeHtml(product.name)}</div>
            <div class="prod-rating">Rating 4.8 | ${soldText} terjual</div>
            <div class="prod-footer">
              <div>
                <div class="prod-price">${formatRp(product.price)}</div>
                <div class="prod-category">Stok ${stock}</div>
              </div>
              <button class="prod-add-btn" onclick="event.stopPropagation();App.openOrderModal('${productId}')" ${stock <= 0 ? "disabled" : ""} aria-label="Tambah ke keranjang">
                <i data-lucide="plus"></i>
              </button>
            </div>
          </div>
        </article>`;
    }).join("");

    refreshIcons();
  },

  openOrderModal(productId) {
    const product = state.allProducts.find((item) => String(item.id) === String(productId));
    if (!product || Number(product.stock || 0) <= 0) {
      toast("Stok produk habis", "error");
      return;
    }

    state.currentProduct = product;
    state.currentQty = 1;

    document.getElementById("modal-product-img").innerHTML = productImage(product, "prod-placeholder");
    this.setText("modal-product-name", product.name);
    this.setText("modal-product-category", product.category || "umum");
    this.setText("modal-product-price", formatRp(product.price));
    this.setText("modal-product-stock", `Stok tersedia: ${product.stock}`);
    this.setText("modal-qty-info", `maks. ${product.stock}`);
    this.setText("modal-qty", "1");
    this.setText("modal-total", formatRp(product.price));

    document.getElementById("order-modal").classList.add("open");
    refreshIcons();
  },

  changeQty(delta) {
    const product = state.currentProduct;
    if (!product) return;

    state.currentQty = Math.max(1, Math.min(Number(product.stock || 1), state.currentQty + delta));
    this.setText("modal-qty", state.currentQty);
    this.setText("modal-total", formatRp(Number(product.price || 0) * state.currentQty));
  },

  closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
  },

  addToCart() {
    const product = state.currentProduct;
    if (!product) return;

    const existing = state.cart.find((item) => String(item.id) === String(product.id));
    if (existing) {
      existing.quantity = Math.min(Number(product.stock || 1), existing.quantity + state.currentQty);
    } else {
      state.cart.push({ ...product, quantity: state.currentQty });
    }

    this.updateCartUI();
    this.closeModal("order-modal");
    toast(`${product.name} masuk keranjang`, "success");
  },

  removeFromCart(id) {
    state.cart = state.cart.filter((item) => String(item.id) !== String(id));
    this.updateCartUI();
  },

  updateCartUI() {
    const count = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

    this.setText("cart-count", count);
    this.setText("mobile-cart-count", count);
    this.setText("bottom-cart-count", count);
    this.setText("cart-count-label", `${count} item`);
    this.setText("cart-total-display", formatRp(total));

    document.getElementById("cart-count")?.classList.toggle("hidden", count === 0);
    document.getElementById("bottom-cart-count")?.classList.toggle("hidden", count === 0);

    const list = document.getElementById("cart-items-list");
    if (!list) return;

    if (!state.cart.length) {
      list.innerHTML = `
        <div class="empty-state">
          <i data-lucide="shopping-cart"></i>
          <div class="empty-title">Keranjang kosong</div>
          <div>Tambahkan produk yang kamu suka.</div>
        </div>`;
      refreshIcons();
      return;
    }

    list.innerHTML = state.cart.map((item) => `
      <div class="cart-item">
        <div class="cart-item-img">${productImage(item)}</div>
        <div class="cart-item-body">
          <div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-qty">${item.quantity} item x ${formatRp(item.price)}</div>
          <div class="cart-item-price">${formatRp(Number(item.price || 0) * Number(item.quantity || 0))}</div>
        </div>
        <button class="cart-item-remove" onclick="App.removeFromCart('${escapeJs(item.id)}')" aria-label="Hapus">x</button>
      </div>`).join("");

    refreshIcons();
    this.updateAccountStats();
  },

  openCart() {
    document.getElementById("cart-sidebar")?.classList.add("open");
    document.getElementById("cart-overlay")?.classList.add("open");
  },

  closeCart() {
    document.getElementById("cart-sidebar")?.classList.remove("open");
    document.getElementById("cart-overlay")?.classList.remove("open");
  },

  openCheckoutModal() {
    if (!state.cart.length) {
      toast("Keranjang masih kosong", "error");
      return;
    }

    const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    this.setText("checkout-total", formatRp(total));

    ["checkout-name", "checkout-phone", "checkout-address", "checkout-notes"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });

    document.getElementById("proof-preview")?.classList.add("hidden");
    const placeholder = document.getElementById("proof-placeholder");
    if (placeholder) placeholder.style.display = "";
    const proofInput = document.getElementById("payment-proof");
    if (proofInput) proofInput.value = "";
    state.paymentProofFile = null;

    this.closeCart();
    document.getElementById("checkout-modal")?.classList.add("open");
  },

  previewPaymentProof(input) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("File harus berupa gambar", "error");
      input.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast("Ukuran file maksimal 5MB", "error");
      input.value = "";
      return;
    }

    state.paymentProofFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      const preview = document.getElementById("proof-preview");
      preview.src = event.target.result;
      preview.classList.remove("hidden");
      document.getElementById("proof-placeholder").style.display = "none";
    };
    reader.readAsDataURL(file);
  },

  async submitOrder() {
    const name = document.getElementById("checkout-name").value.trim();
    const phone = document.getElementById("checkout-phone").value.trim();
    const address = document.getElementById("checkout-address").value.trim();
    const bank = document.getElementById("checkout-bank").value;
    const notes = document.getElementById("checkout-notes").value.trim();

    if (!name) return toast("Nama lengkap wajib diisi", "error");
    if (!phone) return toast("Nomor WhatsApp wajib diisi", "error");
    if (!address) return toast("Alamat pengiriman wajib diisi", "error");
    if (!state.paymentProofFile) return toast("Upload bukti transfer terlebih dahulu", "error");
    
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const fileExt = state.paymentProofFile.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      return toast("Format file tidak didukung (Gunakan JPG/PNG/WebP)", "error");
    }
    if (!db) return toast("Koneksi database belum siap", "error");

    const button = document.getElementById("submit-order-btn");
    button.disabled = true;
    button.innerHTML = "Memproses...";

    try {
      const extension = state.paymentProofFile.name.split(".").pop() || "jpg";
      const fileName = `proof_${Date.now()}.${extension}`;
      const { error: uploadError } = await db.storage
        .from("payment-proofs")
        .upload(fileName, state.paymentProofFile);

      if (uploadError) throw new Error("Gagal upload bukti transfer");

      const { data: urlData } = db.storage.from("payment-proofs").getPublicUrl(fileName);
      const total = state.cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

      const { data: order, error: orderError } = await db
        .from("orders")
        .insert({
          order_number: genOrderNumber(),
          status: "pending",
          total_amount: total,
          customer_name: name,
          customer_email: state.user.email,
          customer_phone: phone,
          customer_address: address,
          payment_method: bank,
          payment_proof_url: urlData.publicUrl,
          notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw new Error(orderError.message);

      const items = state.cart.map((item) => ({
        order_id: order.id,
        product_id: item.id,
        product_name: item.name,
        product_image: item.image_url || null,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: Number(item.price || 0) * Number(item.quantity || 0),
      }));

      const { error: itemError } = await db.from("order_items").insert(items);
      if (itemError) throw new Error(itemError.message);

      state.cart = [];
      this.updateCartUI();
      this.closeModal("checkout-modal");
      toast("Pesanan berhasil dikirim", "success", 4500);
      await this.loadUserOrders();
      this.navigate("orders");
    } catch (error) {
      toast("Gagal: " + error.message, "error");
    } finally {
      button.disabled = false;
      button.innerHTML = '<i data-lucide="send"></i> Kirim Pesanan';
      refreshIcons();
    }
  },

  async loadUserOrders() {
    if (!state.user?.email || !db) return;

    const { data, error } = await db
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_email", state.user.email)
      .order("created_at", { ascending: false });

    if (error) {
      toast("Gagal memuat pesanan", "error");
      return;
    }

    state.orders = data || [];
    this.renderUserOrders();
    this.updateAccountStats();
  },

  renderUserOrders() {
    const container = document.getElementById("user-orders-list");
    if (!container) return;

    if (!state.orders.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="package-open"></i>
          <div class="empty-title">Belum ada pesanan</div>
          <div>Mulai belanja dan pantau statusnya di sini.</div>
          <button class="btn btn-primary" onclick="App.navigate('store')">Belanja Sekarang</button>
        </div>`;
      refreshIcons();
      return;
    }

    container.innerHTML = state.orders.map((order) => `
      <article class="order-card">
        <div class="order-card-top">
          <div>
            <div class="order-num">${escapeHtml(order.order_number)}</div>
            <div class="order-date">${formatDate(order.created_at)}</div>
          </div>
          <span class="badge ${getBadgeClass(order.status)}">${escapeHtml(statusLabel(order.status))}</span>
        </div>
        <div class="order-items-row">
          ${(order.order_items || []).map((item) => `<span class="order-item-chip">${escapeHtml(item.product_name)} x${item.quantity}</span>`).join("")}
        </div>
        <div class="order-detail-grid">
          <div class="order-detail-item">
            <span class="order-detail-label">Penerima</span>
            <span class="order-detail-value">${escapeHtml(order.customer_name || "-")}</span>
          </div>
          <div class="order-detail-item">
            <span class="order-detail-label">Telepon</span>
            <span class="order-detail-value">${escapeHtml(order.customer_phone || "-")}</span>
          </div>
          <div class="order-detail-item">
            <span class="order-detail-label">Pembayaran</span>
            <span class="order-detail-value">${escapeHtml(order.payment_method || "Transfer")}</span>
          </div>
          <div class="order-detail-item">
            <span class="order-detail-label">Alamat</span>
            <span class="order-detail-value">${escapeHtml(order.customer_address || "-")}</span>
          </div>
        </div>
        <div class="order-card-foot">
          <div class="order-amount">${formatRp(order.total_amount)}</div>
          ${order.payment_proof_url ? `<button class="order-proof-link" onclick="App.showImage('${escapeJs(order.payment_proof_url)}')"><i data-lucide="image"></i>Bukti Transfer</button>` : ""}
        </div>
        ${order.rejected_reason ? `<div class="order-reject-note">Alasan penolakan: ${escapeHtml(order.rejected_reason)}</div>` : ""}
      </article>`).join("");

    refreshIcons();
  },

  showImage(url) {
    document.getElementById("zoom-image").src = url;
    document.getElementById("image-modal").classList.add("open");
  },

  updateAccountStats() {
    const cartCount = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    this.setText("stat-products", state.allProducts.length);
    this.setText("stat-orders", state.orders.length);
    this.setText("mobile-cart-count", cartCount);
  },
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach((modal) => modal.classList.remove("open"));
    App.closeCart();
  }
});

document.addEventListener("DOMContentLoaded", () => App.init());

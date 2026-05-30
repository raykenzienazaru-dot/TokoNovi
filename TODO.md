# TODO - Perbaikan Fitur Ecomers

## Step 1: Status Pesanan Bertahap
- [ ] Update `supabase-schema.sql` constraint `orders.status` menambah: `processing`, `shipped`
- [ ] Update `admin/script.js`: `statusLabel`, `statusClass`, dan `renderOrders()` alur tombol

## Step 2: Reset Password (Lupa Password)
- [ ] Tambah RPC `reset_app_user_password(input_email, input_name, input_new_password)` di `supabase-schema.sql`
- [ ] Update `login/index.html` tambah panel forgot password (form email, nama, password baru, konfirmasi)
- [ ] Update `login/script.js`: switch ke tab/panel forgot + fungsi resetPassword() panggil RPC

## Step 3: Grafik Dinamis Mulai Rp 0
- [ ] Update `admin/script.js` `drawSalesChart()` rework tick & scaling (tanpa hardcode jutaan)

## Step 4: Tanggal Real-Time
- [ ] Update `admin/index.html` dropdown tanggal: hapus opsi hardcoded Mei/Jun, ganti dengan elemen id yang diisi JS
- [ ] Update `admin/script.js` `updateDateDisplay()` untuk isi bulan/tahun berjalan

## Step 5: Pengurangan Stok Otomatis Saat Completed
- [ ] Update `admin/script.js` `updateOrderStatus()` saat status `completed` kurangi stok dari `order_items`
- [ ] Pastikan reload produk & render ulang setelah update stok

## Step 6: Hapus Barang (trash icon)
- [ ] Update `admin/script.js` `renderProducts()` untuk menampilkan tombol trash dan memanggil `deleteProduct(id)`

## Step 7: Verifikasi
- [ ] Jalankan regen schema / deploy SQL ke Supabase
- [ ] Manual test: admin pesanan alur bertahap
- [ ] Manual test: forgot password
- [ ] Manual test: grafik Y-axis dinamis mulai Rp 0
- [ ] Manual test: dropdown tanggal bulan berjalan
- [ ] Manual test: stok berkurang saat completed
- [ ] Manual test: tombol hapus barang muncul


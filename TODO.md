# TODO - Perbaikan Fitur Ecomers

## Step 1: Status Pesanan Bertahap
- [x] Update `supabase-schema.sql` constraint `orders.status` menambah: `processing`, `shipped`
- [x] Update `admin/script.js`: `statusLabel`, `statusClass`, dan `renderOrders()` alur tombol

## Step 2: Reset Password (Lupa Password)
- [x] Tambah RPC `reset_app_user_password(input_email, input_name, input_new_password)` di `supabase-schema.sql`
- [x] Update `login/index.html` tambah panel forgot password
- [x] Update `login/script.js`: switch ke tab/panel forgot + fungsi resetPassword() panggil RPC

## Step 3: Grafik Dinamis Mulai Rp 0
- [x] Update `admin/script.js` `drawSalesChart()` rework tick & scaling

## Step 4: Tanggal Real-Time
- [x] Update `admin/index.html` dropdown tanggal
- [x] Update `admin/script.js` `updateDateDisplay()` untuk isi bulan/tahun berjalan

## Step 5: Pengurangan Stok Otomatis Saat Completed
- [x] Gunakan Database Trigger untuk pengurangan stok (Lebih aman & konsisten)
- [x] Pastikan reload produk & render ulang setelah update stok

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

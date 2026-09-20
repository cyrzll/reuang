# REUANG - WhatsApp & Telegram Order Manager

Sistem manajemen pemesanan otomatis terintegrasi untuk WhatsApp Bisnis dan Telegram. Membantu pemilik toko mengelola katalog produk, mencatat pesanan pelanggan dari chat, memverifikasi bukti transfer, menghitung laba bersih otomatis berdasarkan harga modal (HPP), serta mengekspor rekapan penjualan ke Excel.

---

## 🌟 Fitur Utama

- **Integrasi Bot WhatsApp & Telegram**:
  - Hubungkan WhatsApp toko dengan memindai kode QR (Baileys multi-device).
  - Hubungkan bot Telegram menggunakan token BotFather.
- **Katalog Produk & Harga Modal (HPP)**:
  - Manajemen produk dan kategori.
  - Input harga jual serta harga modal (HPP) untuk kalkulasi untung bersih otomatis per transaksi.
- **Pencatatan & Verifikasi Pesanan**:
  - Daftar pesanan masuk secara realtime.
  - Tinjau foto bukti transfer pembayaran dan nama rekening pengirim sebelum menyetujui transaksi.
  - Alur status pesanan: Menunggu Disetujui ➔ Diproses ➔ Siap ➔ Selesai.
- **Notifikasi Otomatis Pelanggan**:
  - Pengiriman pesan WhatsApp otomatis ke pelanggan saat pesanan siap/selesai.
- **Laporan Penjualan & Ekspor Excel**:
  - Grafik tren penjualan dan ringkasan omset, pesanan, modal, dan laba bersih.
  - Ekspor data transaksi ke spreadsheet (.xlsx) dengan filter per hari (pemilih tanggal kalender), per minggu, atau per bulan.
- **Pengaturan Toko & Rekening**:
  - Konfigurasi profil usaha, rekening bank tujuan transfer, upload QRIS, dan pesan sambutan bot.
- **Landing Page Elegan**:
  - Antarmuka publik modern bergaya monokrom shadcn/ui dengan smooth scroll (Lenis) dan animasi scroll (GSAP ScrollTrigger).

---

## 🛠️ Tech Stack

### Frontend (`/web`)
- **Framework**: [Astro 7](https://astro.build/) + [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) dengan standar komponen shadcn/ui
- **Animasi & Smooth Scroll**: [GSAP](https://greensock.com/) + ScrollTrigger & [Lenis](https://lenis.darkroom.engineering/)
- **Grafik & Visualisasi**: Chart.js & React-Chartjs-2
- **Ikon**: [Lucide React](https://lucide.dev/)

### Backend (`/server`)
- **Runtime & Server**: Node.js (>= 22) dengan [Hono](https://hono.dev/)
- **Database**: MySQL dengan [Drizzle ORM](https://orm.drizzle.team/)
- **WhatsApp Engine**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **Pemrosesan Gambar**: [Sharp](https://sharp.pixelplumbing.com/) & QRCode

---

## 📁 Struktur Proyek

```text
whatsapp-order/
├── server/                 # Backend Hono API & Baileys Bot
│   ├── src/
│   │   ├── baileys/        # Handler WhatsApp multi-device & sesi auth
│   │   ├── db/             # Schema Drizzle ORM & koneksi MySQL
│   │   ├── routes/         # Endpoint API (Auth, Order, Katalog, Store, dsb.)
│   │   └── index.ts        # Entry point server
│   ├── media/              # Penyimpanan media lokal (bukti transfer, produk, qris)
│   └── drizzle.config.ts   # Konfigurasi migrasi database
├── web/                    # Frontend Astro + React
│   ├── src/
│   │   ├── components/     # Komponen React (Dashboard, LandingPage, Views, UI)
│   │   ├── context/        # AuthContext & state manajemen sesi
│   │   ├── layouts/        # Layout Astro
│   │   └── pages/          # Routing Astro (/, /login, /register, /dashboard)
│   └── public/             # Asset statis (logo, favicon)
├── mobile/                 # Modul aplikasi mobile (pengembangan masa depan)
├── .gitignore              # Konfigurasi pengabaian file Git
└── README.md               # Dokumentasi proyek
```

---

## 🚀 Panduan Memulai

### 1. Prasyarat
- Node.js versi 22 atau lebih baru
- MySQL Database

### 2. Konfigurasi Backend (`/server`)

Masuk ke folder `server` dan install dependensi:
```bash
cd server
npm install
```

Buat file konfigurasi `.env` di dalam folder `server`:
```env
# Konfigurasi Database MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=db_reuang

# Kunci Rahasia JWT
JWT_SECRET=your_jwt_secret_key_change_in_prod
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_change_in_prod
```

Jalankan migrasi database Drizzle (jika diperlukan):
```bash
npx drizzle-kit push
```

Jalankan server pengembangan:
```bash
npm run dev
```
*Server API akan berjalan pada `http://localhost:3000`.*

---

### 3. Konfigurasi Frontend (`/web`)

Buka terminal baru, masuk ke folder `web` dan install dependensi:
```bash
cd web
npm install
```

Jalankan server pengembangan Astro:
```bash
npm run dev
```
*Aplikasi web akan berjalan pada `http://localhost:4321`.*

---

## 🧭 Rute Halaman Utama

| Rute | Keterangan |
| :--- | :--- |
| `/` | Landing page publik REUANG |
| `/login` | Halaman login toko / admin |
| `/register` | Halaman pendaftaran akun toko baru |
| `/dashboard` | Dashboard manajemen pesanan, katalog, penjualan, dan bot |
| `/catalog` | Pengelolaan katalog produk & harga modal |
| `/orders` | Pemrosesan daftar pesanan masuk |
| `/sales` | Laporan penjualan, untung bersih, dan ekspor Excel |
| `/store-settings`| Pengaturan bot WhatsApp/Telegram, rekening bank, & profil toko |
| `/admin` | Panel persetujuan toko (khusus role admin) |

---

## 📄 Lisensi

Hak Cipta © REUANG. Seluruh hak cipta dilindungi undang-undang.

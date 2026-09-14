# TapSaldo Backend — Top Up via GoPay (Midtrans Sandbox)

Backend ini yang bikin fitur "top up dari GoPay, saldo langsung masuk" jadi beneran
jalan, bukan simulasi tombol doang. Alurnya pakai payment gateway Midtrans (mode
Sandbox, jadi belum motong saldo GoPay asli) + Firebase Realtime Database buat
sinkronisasi saldo instan.

## 1. Siapkan akun yang dibutuhkan (gratis semua)

1. **Midtrans Sandbox** — daftar di https://dashboard.midtrans.com/register,
   pilih mode *Sandbox*. Ambil `Server Key` dan `Client Key` di menu Settings > Access Keys.
2. **Firebase** — buat project baru di https://console.firebase.google.com,
   aktifkan **Realtime Database**. Lalu di Project Settings > Service Accounts,
   klik "Generate new private key" buat dapetin file JSON credential.

## 2. Jalankan backend secara lokal (buat development)

```bash
cd backend
npm install
cp .env.example .env
# isi .env dengan Server Key, Client Key, dan Firebase credential kamu
npm start
```

## 3. Deploy supaya webhook bisa diakses publik

Midtrans butuh ngirim notifikasi ke URL publik (bukan localhost), jadi backend
ini harus di-deploy. Opsi gratis yang gampang buat skripsi:

- **Railway** (railway.app) — connect repo GitHub, set environment variables
  dari `.env`, deploy otomatis dapat URL publik.
- **Render** (render.com) — sama caranya, tinggal set env vars di dashboard.

Setelah dapat URL publik (misal `https://tapsaldo-backend.up.railway.app`),
daftarkan sebagai Payment Notification URL di:
Midtrans Dashboard > Settings > Configuration >
`https://tapsaldo-backend.up.railway.app/api/midtrans-notification`

## 4. Sambungkan dari sisi app (tapsaldo.html)

Ganti tombol "Top Up" biar manggil backend ini, lalu buka popup pembayaran
Midtrans Snap:

```html
<!-- taruh di <head>, ganti YOUR_CLIENT_KEY -->
<script src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key="YOUR_CLIENT_KEY"></script>
```

```js
async function topupViaGopay(userId, amount) {
  const res = await fetch('https://tapsaldo-backend.up.railway.app/api/topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount })
  });
  const data = await res.json();

  // buka popup pembayaran Midtrans, user pilih GoPay
  window.snap.pay(data.token, {
    onSuccess: () => console.log('Pembayaran berhasil, tunggu webhook update saldo'),
    onPending: () => console.log('Menunggu pembayaran GoPay...'),
    onError: () => console.log('Pembayaran gagal'),
  });
}
```

Buat saldo di app ter-update **real-time** tanpa perlu refresh/polling, app bisa
langsung "dengerin" perubahan di Firebase Realtime Database pakai Firebase
JS SDK (`onValue(ref(db, 'balances/' + userId), ...)`), jadi begitu webhook
nulis saldo baru di server, angka di layar app langsung berubah otomatis.

## Testing pembayaran GoPay di Sandbox

Midtrans Sandbox nyediain simulator pembayaran (gak perlu app Gojek asli) —
setelah `window.snap.pay()` dipanggil, pilih GoPay, lalu Midtrans nampilin
QR/simulator yang bisa langsung di-"approve" buat mensimulasikan pembayaran
berhasil. Ini yang biasa dipakai buat demo & pengujian di sidang skripsi.

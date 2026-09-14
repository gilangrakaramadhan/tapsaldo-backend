require('dotenv').config();
const express = require('express');
const midtransClient = require('midtrans-client');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// ---- Init Firebase Admin (buat simpan & sinkron saldo real-time) ----
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL,
});
const db = admin.database();

// ---- Init Midtrans Snap (Sandbox) ----
const snap = new midtransClient.Snap({
  isProduction: false, // sandbox = testing, belum motong saldo asli
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// 1) Buat transaksi top up -> dipanggil dari app pas user klik "Top Up via GoPay"
app.post('/api/topup', async (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'userId dan amount wajib diisi' });
  }

  const orderId = `TOPUP-${userId}-${Date.now()}`;

  const parameter = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    enabled_payments: ['gopay'],
    customer_details: { first_name: userId },
  };

  try {
    const transaction = await snap.createTransaction(parameter);
    // simpan status pending dulu, biar webhook tau ini top up siapa & berapa
    await db.ref(`pendingTopups/${orderId}`).set({ userId, amount, status: 'pending' });
    res.json({ token: transaction.token, redirect_url: transaction.redirect_url, orderId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2) Webhook notifikasi dari Midtrans setelah pembayaran GoPay selesai/gagal
app.post('/api/midtrans-notification', async (req, res) => {
  try {
    const statusResponse = await snap.transaction.notification(req.body);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    const isSuccess =
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept');

    if (isSuccess) {
      const pendingSnap = await db.ref(`pendingTopups/${orderId}`).once('value');
      const pending = pendingSnap.val();

      if (pending && pending.status === 'pending') {
        // update saldo secara atomik biar gak race condition
        const balanceRef = db.ref(`balances/${pending.userId}`);
        await balanceRef.transaction((current) => (current || 0) + pending.amount);

        await db.ref(`pendingTopups/${orderId}`).update({ status: 'settled' });

        await db.ref(`transactions/${pending.userId}`).push({
          type: 'topup',
          amount: pending.amount,
          source: 'gopay',
          time: Date.now(),
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3) Endpoint buat app baca saldo (atau app bisa langsung "listen" ke Firebase Realtime DB
//    dari sisi client biar update-nya instan tanpa polling)
app.get('/api/balance/:userId', async (req, res) => {
  const snapshot = await db.ref(`balances/${req.params.userId}`).once('value');
  res.json({ balance: snapshot.val() || 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));

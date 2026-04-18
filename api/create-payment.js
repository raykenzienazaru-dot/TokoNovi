export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderId, amount, customerDetails, items } = req.body || {};

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // PERBAIKAN 1: Server key harus dalam string
const serverKey = process.env.MIDTRANS_SERVER_KEY;
    
    // PERBAIKAN 2: Ambil dari environment variable
    const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
    const appBaseUrl = process.env.APP_BASE_URL || 'https://tokonovi.vercel.app/';

    if (!serverKey) {
      return res.status(500).json({ error: 'MIDTRANS_SERVER_KEY is not set' });
    }

    const baseUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const authString = Buffer.from(`${serverKey}:`).toString('base64');

    const safeItems = (items || []).map((item, index) => ({
      id: String(item.product_id || item.id || `item-${index + 1}`),
      price: Math.round(Number(item.unit_price || item.price || 0)),
      quantity: Math.max(1, Number(item.quantity || 1)),
      name: String(item.product_name || item.name || 'Produk').slice(0, 50),
    }));

    const payload = {
      transaction_details: {
        order_id: String(orderId),
        gross_amount: Math.round(Number(amount)),
      },
      customer_details: {
        first_name: customerDetails?.first_name || customerDetails?.name || 'Customer',
        phone: customerDetails?.phone || '',
        email: customerDetails?.email || `${Date.now()}@tokoku.com`,
      },
      item_details: safeItems,
      callbacks: {
        finish: `${appBaseUrl}/payment-success`,
        error: `${appBaseUrl}/payment-failed`,
        pending: `${appBaseUrl}/payment-pending`,
      },
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Basic ${authString}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Midtrans error:', data);
      return res.status(response.status).json({
        error: Array.isArray(data.error_messages)
          ? data.error_messages.join(', ')
          : data.status_message || 'Payment failed',
        raw: data,
      });
    }

    return res.status(200).json({
      token: data.token,
      redirect_url: data.redirect_url,
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}
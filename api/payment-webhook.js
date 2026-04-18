
import crypto from 'crypto';
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const notification = req.body;
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
 
  // Verify signature
  const orderId = notification.order_id;
  const statusCode = notification.status_code;
  const grossAmount = notification.gross_amount;
 
  const hash = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
 
  if (hash !== notification.signature_key) {
    return res.status(403).json({ error: 'Invalid signature' });
  }
 
  // Update order status in Supabase
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role key untuk server-side
  );
 
  const transactionStatus = notification.transaction_status;
  const fraudStatus = notification.fraud_status;
 
  let paymentStatus = 'unpaid';
  let orderStatus = 'pending';
 
  if (transactionStatus === 'capture' || transactionStatus === 'settlement') {
    if (fraudStatus === 'accept' || !fraudStatus) {
      paymentStatus = 'paid';
      orderStatus = 'processing';
    }
  } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
    paymentStatus = 'failed';
    orderStatus = 'cancelled';
  } else if (transactionStatus === 'pending') {
    paymentStatus = 'unpaid';
  }
 
  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: paymentStatus,
      status: orderStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('midtrans_order_id', orderId);
 
  if (error) {
    console.error('Supabase update error:', error);
    return res.status(500).json({ error: 'Database update failed' });
  }
 
  return res.status(200).json({ status: 'ok' });
}
 
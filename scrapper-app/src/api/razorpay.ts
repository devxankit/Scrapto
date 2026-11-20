/**
 * Razorpay Checkout (UPI, cards, net banking, wallets).
 *
 * The backend creates the Razorpay order and returns { orderId, amount (paise), keyId };
 * we open the native checkout with it and hand the signed result back to the backend,
 * which verifies the signature and the captured amount with Razorpay before crediting.
 */
import RazorpayCheckout from 'react-native-razorpay';
import { colors } from '../theme';

export type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

/** Thrown when the person closes the checkout; screens show no error for it. */
export class PaymentCancelled extends Error {
  constructor() {
    super('Payment cancelled');
    this.name = 'PaymentCancelled';
  }
}

export async function openRazorpay(opts: {
  keyId: string;
  orderId: string;
  /** Amount in paise, exactly as returned by the backend's Razorpay order. */
  amountPaise: number;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<RazorpayResult> {
  if (!opts.keyId || !opts.orderId) throw new Error('Payment could not be started. Please try again.');
  try {
    const r: any = await RazorpayCheckout.open({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: 'INR',
      name: 'Scraptox',
      description: opts.description,
      prefill: {
        name: opts.prefill?.name ?? '',
        email: opts.prefill?.email ?? '',
        contact: opts.prefill?.contact ? `+91${String(opts.prefill.contact).replace(/\D/g, '').slice(-10)}` : '',
      },
      theme: { color: colors.primary },
    });
    return {
      razorpay_payment_id: r.razorpay_payment_id,
      razorpay_order_id: r.razorpay_order_id ?? opts.orderId,
      razorpay_signature: r.razorpay_signature,
    };
  } catch (e: any) {
    // Razorpay reports a closed checkout as code 0 / 2 ("Payment cancelled by user").
    const desc: string = e?.description ?? e?.error?.description ?? '';
    if (e?.code === 0 || e?.code === 2 || /cancel/i.test(desc)) throw new PaymentCancelled();
    let msg = desc;
    try {
      const parsed = JSON.parse(desc);
      msg = parsed?.error?.description ?? desc;
    } catch {
      // description was plain text
    }
    throw new Error(msg || 'Payment failed. No money was taken.');
  }
}

declare module 'react-native-razorpay' {
  const RazorpayCheckout: { open(options: Record<string, unknown>): Promise<Record<string, any>> };
  export default RazorpayCheckout;
}

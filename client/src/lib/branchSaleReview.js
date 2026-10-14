// Review is read-only; server validation remains authoritative on completion.
export function saleReviewErrors({ branch, customerType, cart, selectedReg, name, paymentMethod, noReferral, selectedReferral }) {
  const errors = {};
  if (!branch) errors.branch = 'Select a branch before reviewing the sale.';
  if (!cart.length) errors.cart = 'Please add products to cart.';
  if (customerType === 'registered' && !selectedReg) errors.customer = 'Please select a registered client.';
  if (customerType !== 'registered' && !name.trim()) errors.customer = 'Please enter customer name.';
  if (!paymentMethod) errors.payment = 'Select a payment method.';
  if (customerType === 'new' && !noReferral && !selectedReferral) errors.referral = 'Please select a referral distributor or tick "no referral".';
  return errors;
}

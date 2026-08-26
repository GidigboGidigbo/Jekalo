// Response serializers. Rows already carry camelCase fields with kobo
// integers; payloads stay kobo end-to-end, so these only normalize the
// money-typed numeric columns for output.

export function serializeListing(listing) {
  if (!listing) return listing;
  const { dailyRate, securityDeposit, ...rest } = listing;
  return { ...rest, dailyRate: Number(dailyRate), securityDeposit: Number(securityDeposit) };
}

export function serializeRentalBooking(booking) {
  if (!booking) return booking;
  const { totalAmount, securityDeposit, ...rest } = booking;
  return { ...rest, totalAmount: Number(totalAmount), securityDeposit: Number(securityDeposit) };
}

export function serializeRide(ride) {
  if (!ride) return ride;
  return ride;
}

export function serializePayment(payment) {
  if (!payment) return payment;
  const { platformPercentage, ...rest } = payment;
  return { ...rest, platformPercentage: Number(platformPercentage) };
}

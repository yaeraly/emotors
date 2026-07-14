/** HQ Sales review window after branch submission. */
export const HQ_SALES_REVIEW_BOOKING_HOURS = 24;

/** Branch confirmation window after HQ Sales approval. */
export const BRANCH_CONFIRMATION_BOOKING_HOURS = 48;

/** Payment window after branch confirmation and invoice issuance. */
export const PAYMENT_BOOKING_HOURS = 72;

/** Post-payment window until HQ Warehouse dispatch. */
export const POST_PAYMENT_BOOKING_HOURS = 168;

export function addBookingHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

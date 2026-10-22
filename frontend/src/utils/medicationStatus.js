// Presentation only: never infer or persist BoLo based on the browser clock.
export const medicationPendingLabel = (scheduledAt, now = new Date()) => {
  const at = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  return Number.isFinite(at) && at > new Date(now).getTime()
    ? 'Chưa đến giờ' : 'Chưa xác nhận uống';
};

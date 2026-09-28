// Hàm giả lập delay API (300ms)
export const mockDelay = (ms = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

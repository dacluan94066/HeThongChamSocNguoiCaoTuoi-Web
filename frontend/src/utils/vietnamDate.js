// Ngày hiện tại theo giờ Việt Nam, độc lập múi giờ của trình duyệt.
export const todayVietnam = () => new Date(Date.now() + 7 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

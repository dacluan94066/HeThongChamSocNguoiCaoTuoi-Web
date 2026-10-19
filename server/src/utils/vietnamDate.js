// Ngay nghiep vu cua CareSenior theo gio Viet Nam (UTC+7, khong co DST).
// Tra ve YYYY-MM-DD de so sanh an toan voi ngay nhap cung dinh dang.
const todayVietnam = () => new Date(Date.now() + 7 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

module.exports = { todayVietnam };

# Nhắc lịch khám trên Android

Không cần tạo bảng hoặc chạy migration SQL. Backend dùng bảng `ThongBao` hiện
có và tự sinh bản ghi `NhacLichKham` đúng mốc. Dùng danh sách đầy đủ từ
`GET /api/elderly/me/appointments`, không dùng danh sách upcoming giới hạn 5 dòng
để quyết định hủy lịch nhắc.

## Hành vi

- Chỉ đặt nhắc cho tài khoản Người cao tuổi và lịch có trạng thái `ChuaDen`.
- Mỗi lịch có hai thông báo một lần: trước 24 giờ và trước 2 giờ. Mốc đã qua
  được bỏ qua, không gửi bù và không lặp mỗi ngày.
- Cùng thời điểm đó, server tạo bản ghi trong màn **Thông báo**. Worker chạy mỗi
  30 giây và API `GET /notifications/me` tự bù nếu server vừa khởi động lại.
  Thông báo được chống trùng; bấm vào có nút mở màn Lịch khám. Lịch đổi/hủy/đã
  khám sẽ xóa thông báo nhắc cũ chưa đọc, còn mục đã đọc được giữ làm lịch sử.
- Giờ SQL không có múi giờ được hiểu là giờ Việt Nam, không phụ thuộc múi giờ
  thiết bị. Timestamp có `Z` hoặc offset được chuyển về giờ Việt Nam.
- Bật qua nút **Bật nhắc lịch khám** trên Trang chủ hoặc Lịch khám. Có giải thích
  trước khi xin quyền thông báo Android 13+. Quyền **Báo thức và lời nhắc** giúp
  nhắc đúng giờ; nếu từ chối, giao diện báo rõ Android có thể gửi muộn.
- Tải Trang chủ, kéo tải lại Lịch khám, quay lại app và mỗi 30 giây khi app đang
  mở sẽ đồng bộ lại. Lịch bị hủy/đã khám/đổi giờ sẽ hủy hoặc lập lại thông báo.
  Tải API thất bại giữ lịch nhắc đã biết và hiển thị trạng thái chưa đồng bộ.
- Khi Mobile đang ở foreground, Socket.IO xác thực bằng JWT và nhận sự kiện
  `lichkham:updated` trong room riêng của chính tài khoản. Mobile luôn tải lại
  API chính thức sau sự kiện rồi mới đổi giao diện/hủy lịch nhắc; payload socket
  không được dùng làm dữ liệu hiển thị. Polling 30 giây vẫn là fallback.
- Dùng ID âm và kênh riêng nên không hủy lịch nhắc thuốc. Tải lại không tạo trùng.
- Đăng xuất/phiên hết hạn hủy nhắc và thông báo lịch khám đã hiện. Request cũ
  không được lập lại nhắc sau khi đổi tài khoản. Payload có chủ tài khoản; bấm
  thông báo chỉ mở Lịch khám sau khi đã khôi phục đúng phiên đăng nhập.

## Giới hạn quan trọng

Đây là **local notification**, không phải push từ server. Khi app bị đóng hoàn
toàn hoặc mất mạng, điện thoại vẫn chỉ biết lịch đã đồng bộ gần nhất. Thay đổi
trên Web chỉ hủy/lập lại nhắc sau khi Mobile đồng bộ được. Muốn cập nhật kể cả
khi app đóng cần thêm push/background sync ở đợt riêng. Android Force stop,
quyền bị thu hồi và cơ chế tiết kiệm pin của hãng có thể ngăn hoặc trì hoãn nhắc.

## Test nhanh trên điện thoại/emulator

1. Chạy bản Mobile mới, đăng nhập Người cao tuổi. Bấm **Bật nhắc lịch khám**,
   cho phép thông báo và Báo thức/lời nhắc. Nếu đã từ chối vĩnh viễn, bật lại
   trong cài đặt ứng dụng của Android.
2. Trên Web tạo lịch `ChuaDen` cho đúng người, giờ khám = **hiện tại + 2 giờ
   3 phút** (làm tròn phút và chừa đủ thời gian thao tác). Mở Lịch khám, kéo tải
   lại. Chuyển app ra nền, không Force stop. Khoảng 3 phút sau phải nhận nhắc
   “trước 2 giờ”; bấm vào phải mở Lịch khám.
3. Test mốc 24 giờ bằng lịch khác có giờ khám = **hiện tại + 24 giờ 3 phút**.
   Tải lại Mobile, đợi khoảng 3 phút, kiểm tra nội dung và giờ khám.
4. Tạo lịch tương tự bước 2 rồi đổi giờ trên Web trước lúc nhắc. Mở lại Mobile
   hoặc đợi đồng bộ foreground (30 giây). Không được nhắc giờ cũ; nhắc giờ mới.
   Lặp lại với Hủy/Đã khám: không được nhắc nữa. Kéo tải lại nhiều lần: mỗi mốc
   chỉ được có một thông báo.
5. Đăng xuất A, đăng nhập B trước lúc nhắc: không được hiện nhắc của A.
6. Thử bấm thông báo khi app đang mở và sau khi vuốt đóng app (không Force stop).
   Cả hai phải vào Lịch khám sau khi xác thực đúng tài khoản.

## Kiểm thử tự động

`flutter test test/appointment_reminder_test.dart` kiểm tra phép tính thời gian,
timezone, bỏ qua mốc quá hạn/trạng thái không hợp lệ, lập/hủy qua Android method
channel giả lập, chống trùng, đổi chủ tài khoản, race logout, điều hướng cold/warm
và giải thích/từ chối quyền. Đây không thay thế kiểm thử thông báo nổi trên máy thật.

# Giai đoạn 5 — SOS realtime và chuông cho Người thân

Ngày kiểm thử: 27/10/2026. Kết luận: **READY WITH LIMITATIONS**.

## Phạm vi thay đổi trong lượt này

7 file có sẵn được chỉnh:

- `server/src/services/alertNotification.service.js`: nối nhánh Người thân sau khi SOS/cập nhật đã commit; nhánh staff giữ nguyên.
- `server/src/services/relativeRealtime.service.js`: đọc lại quyền hiện tại, lưu thông báo an toàn và phát payload riêng cho Người thân.
- `frontend/src/utils/sosAlarm.js`: tái sử dụng bộ điều phối audio, thêm giới hạn chuông tùy chọn và loại bỏ SOS của NCT bị thu hồi.
- `frontend/src/components/SosAudioControls.jsx`: dùng được trong ngữ cảnh chỉ xem.
- `frontend/src/pages/Relatives/RelativePortalPage.jsx`: tích hợp panel/hook SOS vào portal có sẵn.
- `server/test/sos-flow.test.js`, `server/test/sos-realtime-permissions.test.js`: bổ sung mock schema chưa cài đặt cho nhánh mới; giữ kiểm tra hồi quy cũ.

9 file mới:

- `frontend/src/utils/relativeSos.js`: điều phối xác minh quyền, chống trùng, dữ liệu tạm và thu hồi.
- `frontend/src/hooks/useRelativeSos.js`: đăng ký trên Socket.IO hiện có và nối notification/audio.
- `frontend/src/components/RelativeSosPanel.jsx`: điều khiển âm thanh, cảnh báo khẩn và chi tiết chỉ đọc.
- `frontend/test/relativeSos.test.js`: 18 test điều phối và âm thanh, dùng API/audio/lock giả lập.
- `frontend/test/run-relative-sos-preview.mjs`, `frontend/test/fixtures/relativeSosPreview.jsx`: môi trường trình duyệt cách ly, Socket.IO thật + SQL trong RAM + media native.
- `server/test/relative-sos-realtime.test.js`: 11 test pipeline SOS, người nhận, thu hồi và hồi quy.
- `server/test/fixtures/relative-sos-fixture.cjs`: fixture RAM, HTTP/JWT/Socket.IO thật trên loopback; không tải cấu hình database thật.
- `frontend/test/README_relative_sos_stage5.md`: báo cáo này.

Đây là danh sách riêng của Giai đoạn 5. Git status còn các file chưa commit từ Giai đoạn 2/3/4; chúng không phải tất cả đều được sửa trong lượt này.

## Quyền người nhận và payload

- Tái sử dụng Socket.IO và room `user_<id>`, JWT, quyền `QLCANHBAO/xem` và API `/api/relatives` hiện có. Không thêm API hay hệ thống realtime thứ hai.
- Nhánh Admin và Người chăm sóc được chạy như trước. Nhánh Người thân chạy sau commit, độc lập; lỗi nhánh này không hoàn tác SOS đã ghi nhận.
- Người thân phải có tài khoản hoạt động, role `NguoiThan`, liên kết hiệu lực, `DongYChiaSe=1` và quyền xem cảnh báo. Đọc lại SQL ngay trước mỗi lần phát, sau khi lưu thông báo; không coi room là quyền truy cập NCT.
- Schema Giai đoạn 2 chỉ có phạm vi bổ sung bệnh nền/dị ứng/kết quả khám. Cảnh báo/SOS thuộc phạm vi cơ bản của liên kết đồng ý chia sẻ kết hợp quyền `QLCANHBAO/xem`; không tạo thêm cột phạm vi mới.
- Payload Người thân được dựng từ danh sách trường cho phép: ID SOS/NCT/cảnh báo liên quan, tên, thời gian, trạng thái, mức khẩn và nội dung cố định. Không sao chép nội dung/GPS/địa chỉ/ghi chú của payload staff.
- Thông báo Người thân lưu trong `ThongBao` hiện có, nội dung cố định an toàn. Khóa/kiểm tra giao dịch tránh tạo trùng cùng User–SOS. Không tạo bảng/index/schema mới.
- API thông báo Giai đoạn 2 vốn đã đọc lại liên kết/quyền hiện hành và thay nội dung tự do bằng nội dung an toàn; test kiểm tra lại sau thu hồi. Không sửa API này.
- Web xác minh lại profile và danh sách SOS qua GET có quyền trước khi hiển thị, mở chi tiết hoặc phát âm thanh; bỏ qua tên/nội dung/trạng thái do sự kiện Socket gửi tới nếu API không xác nhận.

## Âm thanh, trùng sự kiện và thu hồi

- Giữ file `/audio/sos-bip-bip.mp3` và singleton audio/controller hiện có. Không thay audio, không tạo một audio cho từng SOS.
- Mặc định tắt; người dùng chủ động bật. Hiển thị lỗi chặn autoplay và nút thử lại. Không thay đổi cấu hình bảo mật trình duyệt.
- Chuông Người thân giới hạn 2 phút; tắt chuông hoặc tắt âm thanh dừng ngay, không gọi API thay đổi trạng thái SOS.
- Tái sử dụng Web Locks, storage và BroadcastChannel của controller để tránh chồng tiếng giữa các tab. Ledger chỉ chứa ID/thời gian và lựa chọn âm thanh, không lưu tên/nội dung y tế/GPS.
- Metadata chống trùng có TTL 7 ngày, tối đa 1.000 ID. SOS cũ hơn 5 phút không phát như SOS mới; lịch sử vẫn xem trong Cảnh báo & SOS.
- Sự kiện `relatives:access-changed` hiện có xóa ngay dữ liệu/chi tiết/popup của NCT tương ứng và dừng phần chuông không còn quyền. SOS của NCT khác vẫn được giữ.
- Không dùng room theo NCT cho Người thân: kết nối user-room vẫn ở đó để nhận thay đổi quyền; mọi payload SOS được kiểm lại trên backend. Sau thu hồi kết nối đang mở không còn nhận dữ liệu NCT đó.
- Portal sử dụng cơ chế xóa cache và tải lại danh sách liên kết Giai đoạn 4; hook bổ sung kiểm tra khi focus và mỗi 15 giây. Mất socket đóng dữ liệu/chuông; reconnect đọc lại quyền qua API.
- Phản hồi HTTP đến muộn không phục hồi dữ liệu đã thu hồi; kiểm tra định kỳ/bật âm thanh đến muộn không ghi đè trạng thái SOS mới hơn.

## Kết quả kiểm thử

| Nhóm | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Toàn bộ backend | PASS: 376, SKIP: 1, FAIL: 0 | `node --test --test-reporter=tap test/*.test.js`; không bật SQL integration |
| Toàn bộ frontend | PASS: 106, FAIL: 0 | Cùng lệnh node ở frontend, gồm 18 test SOS Người thân mới |
| Frontend production build | PASS | `npm run build`; còn cảnh báo chunk >500 kB |
| Frontend lint | PASS, 0 lỗi | `npm run lint`; 10 warning có sẵn ở AuthContext, AccountMenuModals, SmartAlertCenter, StatusTag |
| Socket.IO/HTTP/JWT thật cách ly | PASS | Controller SOS và hai service production; SQL RAM; owner HTTP POST -> commit mô phỏng -> các client Socket.IO; không gửi SOS thật |
| Người nhận/thu hồi | PASS trong fixture | Nhiều NCT/Người thân; tài khoản khóa/sai role/thiếu quyền/không liên kết; đọc lại sau persistence; notifications sau thu hồi; giữ quyền NCT khác |
| Admin/Người chăm sóc | PASS hồi quy | Vẫn nhận payload/quyền cũ; database chưa có schema Người thân không làm hỏng SOS staff hoặc response đã commit |
| Payload riêng tư | PASS trong fixture | Dữ liệu độc thử GPS/nội dung/nội bộ có ở staff, không có trong payload/chi tiết Người thân |
| Âm thanh giả lập | PASS | Opt-in, NotAllowedError, hai tab dùng lock chung, chống trùng/reconnect, tắt chuông chỉ đọc, giới hạn 2 phút, phản hồi chậm |
| Trình duyệt tích hợp thực | PASS | Portal React thật, transport Socket.IO thật, SQL RAM; MP3 native `play()` resolve, một loop hoạt động; replay không tăng loop count; nút tắt chuông pause thực |
| Thu hồi trên trình duyệt thực | PASS | Thu hồi An xóa dữ liệu/popup của An, giữ Bình và loop; thu hồi Bình xóa phần còn lại và pause; SOS mới của An bị thu hồi không xuất hiện |
| Fallback autoplay trong trình duyệt | PASS (mô phỏng lỗi) | Chủ động trả NotAllowedError bằng fixture; UI thông báo rõ; bỏ mô phỏng + thao tác Cho phép âm thanh phát MP3 native thành công |
| Chrome desktop và chính sách autoplay Chrome thực | NOT_RUN | Công cụ không được cấp quyền điều khiển cửa sổ Google Chrome; không thay thiết lập hay đi đường khác để vượt quyền |
| Loa vật lý có nghe được | NOT_RUN | Xác minh HTMLAudioElement play/pause, chưa xác nhận âm thanh nghe bằng tai trên thiết bị người dùng |
| SQL Server integration | NOT_RUN / 1 SKIP | Test opt-in hiện có có thể tạo DB, nên không bật trong lượt này. Transaction lưu ThongBao đã được kiểm bằng SQL RAM/assertion, chưa chạy SQL này trên SQL Server thật |
| Mobile thật -> DB chính -> Web | NOT_RUN | Cố ý không gửi SOS thật/không ghi database chính |
| `git diff --check` | PASS | Không có lỗi whitespace; chỉ cảnh báo chuyển LF/CRLF của cấu hình Git |

Fixture trình duyệt đã dừng và tab thử nghiệm đã đóng. Không để server test chạy nền.

## Hạn chế và triển khai

- Database chính chưa được áp dụng patch Người thân theo thông tin đã xác nhận ở đầu nhiệm vụ. Lượt này không kết nối để sửa database, không chạy patch/FINAL/seed, không tạo/xóa database fixture. Chưa thể dùng chức năng Người thân trên database chính cho đến khi patch Giai đoạn 2 được phê duyệt và áp dụng riêng.
- Chưa xác minh transaction ThongBao mới bằng SQL Server thật; cần dùng database cách ly đã được duyệt trước khi nghiệm thu triển khai thực tế.
- Xác minh SOS trên Web dùng API danh sách có sẵn, tối đa 200 bản ghi gần nhất của NCT. ID không nằm trong trang được tải sẽ không hiển thị/phát chuông thay vì bỏ qua kiểm tra quyền.
- Trình duyệt/OS có thể chặn autoplay hoặc tab nền; cảnh báo hình ảnh vẫn hoạt động. Khi Web đóng hoàn toàn không có Web Push (ngoài phạm vi).
- Giới hạn 2 phút và 5 phút chỉ áp dụng nhánh Người thân; không đổi chính sách staff có sẵn.
- Không sửa Mobile, database/schema, authentication hay API SOS. Ngoài 7 file có sẵn nêu trên, bảo toàn nội dung các file Giai đoạn 2/3/4 bằng so sánh hash trước/sau. `relativeRealtime.service.js` và `RelativePortalPage.jsx` được mở rộng đúng phạm vi tích hợp Giai đoạn 5.
- Không commit/push, không reset/clean. Dừng sau Giai đoạn 5.

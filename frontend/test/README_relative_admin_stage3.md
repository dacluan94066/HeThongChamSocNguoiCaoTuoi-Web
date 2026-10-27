# Nghiệm thu Giai đoạn 3 — Web Admin Người thân

Ngày kiểm tra: 27/10/2026. Kết luận: **READY WITH LIMITATIONS**.

## Phạm vi

- Trang `/nguoi-than`: danh sách tài khoản Người thân, tìm kiếm, lọc trạng thái, chọn tài khoản để quản lý NCT được theo dõi.
- Tạo tài khoản qua form sẵn có tại `/nguoi-dung`, chọn role `NGUOI_THAN`, quay về tài khoản vừa tạo.
- Hồ sơ NCT: mục mở rộng "Người thân được phép theo dõi", chỉ dành cho Admin có quyền `QLNGUOIDUNG/xem`.
- Cùng một `RelativeLinksPanel` phục vụ hai trang: cấp, xem chi tiết, cập nhật phạm vi/căn cứ, thu hồi có xác nhận và xem lịch sử chỉ đọc.
- Không triển khai portal Người thân hoặc SOS fan-out cho Người thân.

## File của Giai đoạn 3

Chỉnh sửa 4 file:

- `frontend/src/App.jsx`
- `frontend/src/layouts/MainLayout.jsx`
- `frontend/src/pages/Users/UsersPage.jsx`
- `frontend/src/pages/ElderlyProfiles/ElderlyProfilesPage.jsx`

Tạo 10 file:

- `frontend/src/components/RelativeAdminRoute.jsx`
- `frontend/src/components/RelativeLinksPanel.jsx`
- `frontend/src/pages/Relatives/RelativeAdminPage.jsx`
- `frontend/src/pages/Relatives/RelativeAdmin.css`
- `frontend/src/services/relativeService.js`
- `frontend/src/utils/relativeAdmin.js`
- `frontend/test/relativeAdmin.test.js`
- `frontend/test/run-relative-admin-preview.mjs`
- `frontend/test/fixtures/relativeAdminPreview.jsx`
- `frontend/test/README_relative_admin_stage3.md`

## API đã tích hợp

Sử dụng API/JWT hiện có, không sửa endpoint hoặc backend:

| API | Mục đích |
| --- | --- |
| GET /api/users?vaiTro=NGUOI_THAN | Danh sách tài khoản |
| POST /api/users | Tạo tài khoản qua form cũ |
| GET /api/permissions/matrix | Kiểm tra role đã cài và giới hạn quyền Người thân chỉ đọc |
| GET /api/elderly | Chọn hồ sơ theo quyền Admin |
| GET /api/relatives/links | Danh sách, phân trang, kiểm tra trùng đúng cặp |
| POST /api/relatives/links | Cấp liên kết với căn cứ đồng ý và 3 phạm vi boolean rõ ràng |
| PUT /api/relatives/links/:id | Cập nhật với version gốc và lý do |
| POST /api/relatives/links/:id/revoke | Thu hồi với version gốc và lý do |
| GET /api/relatives/links/:id/history | Lịch sử CAP/CAP_NHAT/THU_HOI |

Thời điểm đồng ý được nhập và gửi theo giờ Việt Nam (+07:00). GPS SOS và ghi chú nội bộ không phải lựa chọn chia sẻ. Lỗi backend không được đổi thành thành công giả. Lỗi 409 giữ bản nháp và khóa gửi lại cho đến khi đóng/chọn phiên bản mới.

## Kiểm thử đã chạy

| Nhóm | Kết quả | Phạm vi bằng chứng |
| --- | --- | --- |
| Frontend Node test | PASS 63/63 | Gồm 50 test cũ và 13 test mới về guard, payload, consent, version, trùng, lỗi, privacy lịch sử, service và tích hợp UI |
| Backend regression | PASS 365; SKIP 1 | Chạy với CARESENIOR_RELATIVES_SQL_TEST=0, không kết nối SQL integration |
| Frontend build | PASS | Còn cảnh báo chunk lớn hơn 500 kB |
| Frontend lint | PASS, 0 lỗi | 10 cảnh báo ở các file cũ: StatusTag, AuthContext, AccountMenuModals, SmartAlertCenter |
| Admin danh sách/tạo tài khoản | PASS | Thao tác trực tiếp trên Chromium IAB, App thật + API mock trong RAM |
| Cấp liên kết/validation | PASS | Form thiếu căn cứ bị chặn; grant gửi đúng ID và scope true/false/true, giờ +07:00 |
| Cập nhật liên kết | PASS | Payload không đổi ID; version và lý do đúng; phạm vi hiển thị cập nhật |
| Thu hồi | PASS | Hủy không thay đổi; xác nhận có lý do đổi trạng thái; không còn nút sửa/thu hồi |
| Lịch sử | PASS | Đọc CAP, CAP_NHAT, THU_HOI, tên Admin, thời gian và thay đổi trước/sau; không có thao tác sửa/xóa |
| Quan hệ nhiều–nhiều | PASS | Hai Người thân cùng hiện dưới một NCT; một Người thân có hai NCT |
| Chống trùng | PASS | Cặp đang hoạt động bị vô hiệu hóa trong dropdown; helper/preflight và backend conflict được kiểm tra |
| Xung đột 409 | PASS | Bản nháp còn nguyên, không ghi thành công, nút lưu bị khóa |
| Tìm kiếm/tài khoản khóa | PASS | Lọc tên tài khoản, tên NCT; tài khoản khóa không được cấp liên kết mới |
| Chặn truy cập trái quyền | PASS | Người chăm sóc và Admin thiếu quyền bị 403; NCT bị Web role gate chặn như trước |
| Loading/empty/error | PASS | Mock chậm hiển thị tải; empty không chèn dữ liệu mẫu; lỗi có thông báo/thử lại |
| Database chưa cài patch | PASS trên mock | Thông báo chưa sẵn sàng, không cho tạo; hồ sơ NCT và trang tài khoản cũ vẫn mở |
| Responsive | PASS trực quan | Thao tác ở viewport khoảng 599px; xem màn chính trong iframe viewport thật 768/1024/1440px, thu nhỏ để quan sát. Không phải kiểm thử thiết bị tablet vật lý |
| git diff --check | PASS | Có thể có thông báo LF/CRLF theo cấu hình Git; không có lỗi whitespace |
| Hash file Giai đoạn 2 | PASS | Đối chiếu SHA-256 với manifest trước Giai đoạn 3 |
| SQL Server thật/chrome profile thật | NOT_RUN | Chưa được phép áp dụng patch; không tạo tài khoản, liên kết hoặc dữ liệu thật |
| SQL integration tạo database | NOT_RUN | Cố ý tắt; không tạo/xóa database thử nghiệm |
| Trọn bộ module cũ trên môi trường thật | NOT_RUN | Đã chạy test tự động hiện có; không tuyên bố nghiệm thu mọi luồng thật |

## Chạy lại fixture an toàn

Từ `frontend`, chạy `node test/run-relative-admin-preview.mjs`, mở `http://127.0.0.1:5191/nguoi-than`.

Fixture không đọc `.env`, không chạy server ứng dụng, không kết nối SQL, không worker/email/SOS thật. Dùng App frontend thật với các API cùng origin được mock; các thay đổi chỉ nằm trong bộ nhớ và mất khi dừng. Pure validation của backend được tái sử dụng để kiểm tra hợp đồng dữ liệu. Không dùng cấu hình fixture làm cấu hình production.

Các điều khiển trong thanh vàng hỗ trợ unready, empty, error, slow, conflict; endpoint `/__relative_fixture/state` cung cấp trace RAM (mật khẩu đã ẩn). Route `/__relative_fixture/viewport?width=768` hỗ trợ xem responsive 768/1024/1440px.

## Giới hạn và bảo toàn

- Database chính chưa có patch Người thân. Cần phê duyệt áp dụng riêng trước khi chạy luồng thật; giai đoạn này không chạy patch, FINAL hoặc seed.
- Không sửa backend, SQL, authentication, Flutter hoặc dữ liệu thật trong Giai đoạn 3. Các thay đổi backend/SQL đang thấy trong git status thuộc Giai đoạn 2 và được bảo toàn theo hash.
- Không tạo/xóa database thử nghiệm. Không xóa `mobile/design_reference/`.
- Không commit/push/reset/clean. Dừng sau Giai đoạn 3.
- Trình duyệt còn cảnh báo cũ về `alertItem`, một số prop AntD deprecated và static message; không có lỗi runtime chặn các thao tác đã kiểm thử.

# Giai đoạn 4 — Web Người thân CareSenior

Ngày kiểm tra: 27/10/2026. Kết luận: **READY WITH LIMITATIONS**.

## Đã triển khai

- Role `NguoiThan` đăng nhập bằng API auth hiện có và mở `/nguoi-than-cua-toi`.
- Không gian riêng, tách khỏi `MainLayout` của Admin/người chăm sóc; các route nghiệp vụ cũ được chặn trước khi mount hoặc gọi API.
- Danh sách NCT được liên kết, chọn/chuyển NCT, hồ sơ cơ bản và ba phạm vi đồng ý chia sẻ do API quyết định.
- Số đo gần nhất trong những bản ghi đã tải, lịch sử, biểu đồ 7 ngày; không tự tính lại ngưỡng đánh giá.
- Lịch thuốc, lịch khám, cảnh báo và SOS chỉ xem. Kết quả khám, bệnh nền, dị ứng không hiện nếu chưa được đồng ý chia sẻ.
- Không có nút thêm/sửa/xóa sức khỏe, xác nhận thuốc, tạo/hủy lịch khám hoặc tiếp nhận/xử lý SOS.
- Đổi mật khẩu cá nhân dùng lại modal/API hiện có; không cấp quyền sửa hồ sơ NCT.
- Loading, empty, error, retry, phân trang và thông báo database chưa cài đặt.

## File Giai đoạn 4

Sửa 4 file:

| File | Mục đích |
| --- | --- |
| `frontend/src/App.jsx` | Route riêng Người thân và guard tách không gian staff |
| `frontend/src/utils/accessControl.js` | Cho phép role mới vào Web, giữ tập role staff, chọn trang sau đăng nhập |
| `frontend/src/pages/Login/LoginPage.jsx` | Điều hướng sau đăng nhập/khôi phục phiên theo role, giữ form và API cũ |
| `frontend/src/services/axiosClient.js` | Bỏ toast mất mạng giả chỉ với ERR_CANCELED của lượt đọc Người thân có cờ riêng; giữ nguyên lỗi thật và 401/403 |

Tạo 11 file:

| File | Mục đích |
| --- | --- |
| `frontend/src/components/WorkspaceRoutes.jsx` | Guard role staff/Người thân và trang mặc định |
| `frontend/src/hooks/useRelativePortal.js` | Gắn state với phiên, làm mới quyền, dọn khi rời trang |
| `frontend/src/pages/Relatives/RelativePortalPage.jsx` | Giao diện Người thân, các tab chỉ xem và biểu đồ |
| `frontend/src/pages/Relatives/RelativePortal.css` | Style scoped, responsive, bảng cuộn nội bộ |
| `frontend/src/services/relativePortalService.js` | Tái sử dụng axios/JWT, adapter chỉ GET |
| `frontend/src/utils/relativePortalData.js` | Allowlist DTO/query, kiểm tra ID, giờ Việt Nam, dữ liệu biểu đồ |
| `frontend/src/utils/relativePortalStore.js` | State trong RAM, hủy request và epoch chống dữ liệu trả về muộn |
| `frontend/test/relativePortal.test.js` | 25 test mới |
| `frontend/test/run-relative-portal-preview.mjs` | Server fixture RAM cô lập |
| `frontend/test/fixtures/relativePortalPreview.jsx` | App thật + StrictMode, điều khiển mock và đo responsive |
| `frontend/test/README_relative_portal_stage4.md` | Báo cáo này |

Không sửa backend, SQL, Flutter, model/repository hoặc các trang Admin/người chăm sóc. Các thay đổi Giai đoạn 2 và 3 được giữ nguyên; riêng `App.jsx` được bổ sung wrapper/route mới, giữ nguyên các route Admin đã hoàn thành.

Đối chiếu SHA-256 cuối giai đoạn: 27/27 file trong manifest Giai đoạn 2 không đổi; 40/41 file baseline Giai đoạn 2–3 không đổi, ngoại lệ được phép là `frontend/src/App.jsx`. Các test Giai đoạn 3 vẫn PASS. Git HEAD vẫn `bf297b8`.

## API sử dụng

API nghiệp vụ Người thân chỉ dùng GET:

- `/api/relatives/me/elderly`
- `/api/relatives/me/elderly/:id`
- `/api/relatives/me/elderly/:id/health-metrics`
- `/api/relatives/me/elderly/:id/medication-schedules`
- `/api/relatives/me/elderly/:id/appointments`
- `/api/relatives/me/elderly/:id/alerts`
- `/api/relatives/me/elderly/:id/sos`

Tái sử dụng `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/permissions/me` và API đổi mật khẩu riêng `POST /api/auth/change-password`. Không đổi endpoint, JWT, middleware hoặc hợp đồng backend.

## Kiểm soát dữ liệu

- Backend Giai đoạn 2 vẫn kiểm tra role, quyền đọc, liên kết đang hoạt động và phạm vi đồng ý trên từng truy vấn. ID từ URL không được coi là quyền truy cập.
- Adapter frontend chỉ giữ các trường được hiển thị; loại CCCD, địa chỉ, liên hệ riêng, GPS, căn cứ đồng ý, ghi chú xử lý nội bộ và kết quả y tế ngoài scope, ngay cả nếu fixture cố tình chèn các trường này.
- Khi đổi NCT: xóa dữ liệu cũ trước khi tải mới. Mỗi lượt tải có epoch, signal hủy và kiểm tra ID; phản hồi cũ không thể ghi vào hồ sơ mới.
- Khi đăng xuất hoặc unmount: hủy request, xóa list/profile/sections khỏi store. Không lưu hồ sơ sức khỏe vào localStorage/sessionStorage/IndexedDB.
- Khi 401/403/404 hoặc schema chưa sẵn sàng: đóng dữ liệu đang xem. 401 vẫn dùng xử lý hết phiên của client cũ.
- Dùng sự kiện **cấp/thu hồi quyền đã có** `relatives:access-changed` để xóa và kiểm tra lại dữ liệu; cũng kiểm tra lại khi focus/reconnect và định kỳ 60 giây. Khi tab ẩn hoặc socket mất kết nối, dữ liệu được đóng. Không đăng ký sự kiện SOS, không phát chuông, không thêm room hoặc SOS fan-out.

## Kết quả kiểm thử

| Hạng mục | Kết quả | Bằng chứng/phạm vi |
| --- | --- | --- |
| Frontend tests | PASS 88/88 | 63 test cũ + 25 test mới; mock/in-memory |
| Backend regression | PASS 365, SKIP 1 | CARESENIOR_RELATIVES_SQL_TEST=0; không chạy SQL integration tạo DB |
| Production build | PASS | Còn cảnh báo bundle lớn hơn 500 kB |
| Lint | PASS, 0 lỗi | 10 cảnh báo cũ ở StatusTag/AuthContext/AccountMenuModals/SmartAlertCenter |
| Đăng nhập Người thân | PASS fixture trình duyệt | Đi qua form/API auth mock, mở đúng trang Người thân |
| Một Người thân xem hai NCT | PASS fixture trình duyệt | Chuyển An/Bình, luôn có tên NCT đang xem |
| Route Admin/người chăm sóc | PASS fixture trình duyệt | `/nguoi-dung`, `/ho-so-nguoi-cao-tuoi`, `/lich-uong-thuoc` bị chặn trước khi gọi API staff |
| ID NCT chưa liên kết | PASS | URL `nct=703` không hiện hồ sơ; model tests từ chối ID không trong list; backend regression kiểm tra IDOR độc lập |
| Bảo mật scope | PASS | An không xem bệnh nền/kết quả; Bình được xem phần đã cho phép; không có PRIVATE_* trên UI |
| Scope đổi khi đang xem | PASS fixture trình duyệt | Kết quả khám bị đóng ngay khi mock scope-off phát sự kiện quyền |
| Thu hồi khi đang đăng nhập | PASS fixture trình duyệt | Mock revoke bỏ An khỏi list, xóa nội dung cũ và hiển thị thông báo, không đợi đăng nhập lại |
| Chỉ xem | PASS fixture trình duyệt | Thuốc/khám/cảnh báo/SOS không có nút nghiệp vụ hoặc âm thanh SOS |
| State/race/session | PASS unit + browser | Late response bị bỏ; chuyển NCT không lẫn; logout không còn portal hoặc tên NCT trên DOM |
| 401/403 | PASS fixture trình duyệt | 401 về login; 403 xóa dữ liệu và báo quyền thay đổi |
| Loading/empty/error/retry | PASS fixture trình duyệt | Slow, empty, error, unready; retry khôi phục dữ liệu |
| Ba role cũ | PASS unit + fixture trình duyệt | Admin/NCS đăng nhập về dashboard cũ; NCT vẫn bị chặn Web |
| Responsive 768/1024/1440px | PASS fixture trình duyệt | Viewport iframe thực tế; document không rộng hơn vùng client, cardOverflow=0 |
| Màn nhỏ 360px | PASS sau sửa | Đã phát hiện và sửa grid item kéo rộng bảng; kiểm tra lại tab sức khỏe có document=345px, portal=345px, cardOverflow=0; bảng cuộn bên trong |
| Trace API | PASS fixture | Snapshot trace có 135 request Người thân, 0 request ghi nghiệp vụ, 0 lượt gọi API staff |
| Hủy request | PASS unit + browser | Request Người thân bị hủy không hiện toast mất mạng; lỗi mạng thật, request cũ, 401/403 vẫn được xử lý |
| git diff --check | PASS | Kiểm tra cuối giai đoạn; cảnh báo LF/CRLF của Git không phải lỗi whitespace |
| Database chính/luồng tích hợp SQL thật | NOT_RUN | Chưa được phép áp dụng patch; không dùng DB thật để tạo tài khoản/liên kết/ghi sức khỏe |
| Đổi mật khẩu thật | NOT_RUN | Giữ modal/API cũ, không thay đổi thông tin đăng nhập thật |
| Thiết bị tablet vật lý/kiểm thử toàn bộ trình duyệt | NOT_RUN | Đã kiểm tra Chromium IAB với viewport fixture, không tuyên bố đã chạy mọi thiết bị |

## Chạy lại fixture

Từ `frontend`: `node test/run-relative-portal-preview.mjs`, mở `http://127.0.0.1:5192/login`.

Tài khoản giả: `fixture.NguoiThan`, mật khẩu `fixture-only-123`. Đây là giá trị công khai của test RAM, không phải tài khoản thật. Các role giả còn lại: `fixture.QuanTriVien`, `fixture.NguoiChamSoc`, `fixture.NguoiCaoTuoi`.

Fixture không load `.env`, không khởi động backend ứng dụng, không kết nối SQL, không worker/email/SOS thật. Quyền Người thân chỉ đọc lấy từ pure policy của backend, không dùng fixture cố tình cấp sai quyền. Không lấy cấu hình này làm cấu hình production.

Điều khiển mock trong thanh vàng hỗ trợ empty/error/slow/denied/expired/unready, revoke và scope-off. `/__portal_fixture/state` là trace RAM, đã ẩn mật khẩu. `/__portal_fixture/viewport?width=768` hỗ trợ 360/768/1024/1440px; DOM metrics gửi nội bộ cùng origin để đo overflow.

## Giới hạn và dữ liệu

- Database chính `QLSucKhoeNguoiCaoTuoi` vẫn chưa được áp dụng patch Người thân. Không chạy patch, FINAL hoặc seed; không tạo/xóa database thử nghiệm.
- Cần phê duyệt áp dụng SQL riêng và nghiệm thu luồng tích hợp thật trước khi sử dụng tài khoản Người thân trên dữ liệu thực tế.
- Chỉ số/biểu đồ được tính từ các bản ghi đã tải, có nút tải thêm và mô tả rõ; không khẳng định đã lấy toàn bộ lịch sử hoặc số đo ngoài các trang đã tải.
- Ảnh và trace thử nghiệm được lưu riêng trong workspace KLCN với tiền tố `phase4_portal_`; không đưa dữ liệu giả vào ứng dụng production.
- Giữ `mobile/design_reference/`, toàn bộ Flutter và backend không đổi. Không commit, push, reset, clean. Dừng sau Giai đoạn 4; không triển khai chuông SOS Người thân hoặc Giai đoạn 5/6.

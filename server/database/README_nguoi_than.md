# Người thân — Giai đoạn 2 (database và backend)

Chỉ triển khai backend. Không có giao diện Người thân, không sửa Flutter, chưa nối Người thân vào fan-out SOS thật.
Ba role cũ được giữ nguyên; `NguoiThan` chỉ dùng Web và một tài khoản vẫn chỉ có một role.

## Cài đặt — chỉ sau phê duyệt riêng cho database đích

1. Sao lưu database và ghi nhận phiên bản backend/schema/quyền trước khi áp dụng.
2. Chọn đúng database trong SSMS, kiểm tra `SELECT DB_NAME()` và nội dung patch.
3. Kiểm thử `patch_nguoi_than.sql` trên bản sao cách ly trước. Không chạy FINAL trên database có dữ liệu.
4. Sau khi được phép riêng, chạy **chỉ** `patch_nguoi_than.sql` trên database đích bằng tài khoản có quyền DDL cần thiết.
5. Kiểm tra hai bảng mới, 6 FK, 6 CHECK, filtered unique index và 11 quyền của `NguoiThan` (5 quyền xem, tất cả quyền ghi bằng 0).
6. So sánh các role/quyền/tài khoản cũ với bản ghi nhận trước đó. Patch không thay đổi chúng.

Patch dùng transaction, application lock và `XACT_ABORT`. Lỗi sẽ rollback phần bổ sung trong transaction.
Có thể chạy lặp lại cùng phiên bản; đối tượng không đúng schema v1, quyền mới vượt trần chỉ xem hoặc liên kết trùng sẽ bị từ chối, không tự sửa/xóa/gộp.
Không hard-code `VaiTroID`, không chạy seed, không tạo tài khoản hoặc gán liên kết tự động.
FINAL chứa nguyên nội dung patch ở cuối để cài mới. Khác biệt SĐT/index cũ không được patch này sửa.

## Bảng và phạm vi chia sẻ

- `NguoiCaoTuoi_NguoiThan`: FK tới NCT và `NguoiDung.UserID`; quan hệ gia đình, người đồng ý/tư cách/thời điểm/căn cứ,
  ba cờ `XemBenhNen`, `XemDiUng`, `XemKetQuaKham`, người/thời điểm cấp và thu hồi, lý do, `rowversion`.
- `LichSuLienKetNguoiThan`: lịch sử `CAP`, `CAP_NHAT`, `THU_HOI`; actor, thời gian UTC, lý do, JSON trước/sau.
- Unique `(NguoiThanUserID,NguoiCaoTuoiID) WHERE ThuHoiLuc IS NULL`.
- Thu hồi giữ nguyên dòng cũ; cấp lại tạo dòng và vòng đời mới. Không xóa lịch sử.
- Mọi lần cấp/cập nhật cần đồng ý rõ và đủ phạm vi, không nhận `gps` hoặc quyền xem ghi chú nội bộ.
- Thời điểm đồng ý phải là ISO 8601 có múi giờ. Các mốc liên kết/audit lưu UTC. Không thay cách lưu thời gian y tế cũ.
- Chỉ Admin được xem chứng cứ đồng ý và lịch sử liên kết. Người thân không được xem nội dung nội bộ này.

API không thể tự xác minh tính xác thực của căn cứ đồng ý; Admin chịu trách nhiệm xác minh trước khi ghi nhận.

## API

Tất cả đường dẫn bên dưới có tiền tố `/api/relatives`, cần JWT hợp lệ. Response theo `success/message/data` hiện có.

Admin (có kiểm tra lại tài khoản Admin trong transaction):

| Method | Path | Ý nghĩa |
|---|---|---|
| GET | `/links` | Lọc `nguoiThanUserId`, `nguoiCaoTuoiId`, `includeRevoked=true/false`, phân trang |
| POST | `/links` | Cấp quyền với đồng ý đầy đủ |
| PUT | `/links/:id` | Cập nhật quan hệ/phạm vi/đồng ý, bắt buộc version và lý do |
| POST | `/links/:id/revoke` | Thu hồi ngay, bắt buộc version và lý do |
| GET | `/links/:id/history` | Lịch sử, chỉ Admin |

Body cấp quyền (các giá trị chỉ là minh họa, thay bằng dữ liệu và căn cứ đã được xác minh):

```json
{
  "nguoiCaoTuoiId": 1,
  "nguoiThanUserId": 2,
  "moiQuanHe": "Con gái",
  "dongYChiaSe": true,
  "nguoiDongY": "Họ tên người đồng ý",
  "tuCachDongY": "Bản thân NCT",
  "thoiDiemDongY": "2026-10-26T08:00:00+07:00",
  "canCuDongY": "Tham chiếu biên bản đồng ý đã xác minh",
  "phamViChiaSe": { "benhNen": false, "diUng": false, "ketQuaKham": false }
}
```

Cập nhật dùng toàn bộ thông tin đồng ý trên nhưng bỏ hai ID, thêm `version` (base64 trả từ API) và `lyDo`.
Thu hồi chỉ nhận `{ "version": "...", "lyDo": "..." }`. Sửa phiên bản cũ hoặc liên kết đã thu hồi trả 409.
Người cấp/thu hồi lấy từ JWT, không nhận từ body. Không thể sửa NCT/người thân của một liên kết đã tạo.

Người thân:

| GET Path | Nội dung / quyền chức năng |
|---|---|
| `/me/elderly` | Hồ sơ đã liên kết / `QLHOSONCT` |
| `/me/elderly/:id` | Hồ sơ cơ bản; bệnh nền/dị ứng theo đồng ý |
| `/me/elderly/:id/health-metrics` | Số đo / `QLCHISOSK` |
| `/me/elderly/:id/medication-schedules` | Lịch và trạng thái / `QLLICHUONGTHUOC` |
| `/me/elderly/:id/appointments` | Lịch khám, kết quả theo đồng ý / `QLLICHKHAM` |
| `/me/elderly/:id/alerts` | Cảnh báo đã lọc nội dung / `QLCANHBAO` |
| `/me/elderly/:id/sos` | SOS, không GPS/ghi chú nội bộ / `QLCANHBAO` |
| `/me/notifications` | Thông báo SOS đã lưu cho chính tài khoản, chỉ khi liên kết còn hiệu lực |

Phân trang `limit` mặc định 100, tối đa 200; `offset` mặc định 0. Có `tuNgay`, `denNgay`, `loaiChiSoId` cho truy vấn dữ liệu phù hợp.
Không nhận NCT ID thay thế trong query/body. Mọi query có tham số SQL, phạm vi được kiểm tra lại tại SELECT.
HTTP 403 cho hồ sơ không liên kết/không quyền; 422 cho dữ liệu không hợp lệ; 409 cho xung đột; 503 nếu chưa cài patch hoặc lỗi cơ sở dữ liệu.
Response Người thân có `Cache-Control: no-store`, không trả CCCD, địa chỉ chi tiết, tài khoản NCT, actor/ghi chú nội bộ.
Nội dung cảnh báo/SOS là mô tả giới hạn theo loại; không dùng free text cũ có thể chứa dữ liệu nhạy cảm/GPS.

Người thân không dùng API quản trị cũ, kể cả khi ma trận bị cấp nhầm quyền ghi. Chỉ cho phép thêm các API cá nhân:
GET `/api/auth/me`, `/api/permissions/me`, `/api/auth/login-history` và đổi mật khẩu chính mình.
POST `/api/auth/change-password` nhận `matKhauHienTai/matKhauMoi`; PUT `/api/users/me/password` nhận `matKhauCu/matKhauMoi`.
Không cấp `QLHOSONCT/sua` cho Người thân; các role cũ vẫn đi qua kiểm tra quyền cũ của chúng.
Admin tạo tài khoản qua POST `/api/users`, `vaiTro=NGUOI_THAN`, tái sử dụng validation/hash/login hiện có.

## Realtime — chuẩn bị cho giai đoạn tích hợp

Socket nhận role thứ tư nhưng không cho vào room Admin. Không có endpoint join-room tùy ý.
Sau commit cấp/cập nhật/thu hồi, tất cả socket của tài khoản nhận `relatives:access-changed`:
`nguoiCaoTuoiId/lienKetId/action/version`. Sự kiện không chứa căn cứ đồng ý hoặc thông tin sức khỏe.
Mỗi API đọc và `realtimeRecipients()` đều kiểm tra lại tài khoản, role, quyền và liên kết SQL, không tin room/token như quyền xem NCT.
`relativeRealtime.service.js` chuẩn bị việc gửi payload SOS giới hạn tới người nhận hợp lệ; nó chưa được gọi từ luồng SOS thật ở giai đoạn này.
Giai đoạn Web sau phải nghe sự kiện để xóa cache/toast/chuông theo NCT ở mọi tab và revalidate khi reconnect/focus.
Không tuyên bố đã xóa dữ liệu khỏi trình duyệt khi chưa triển khai Web; thông tin người dùng đã chụp/lưu ngoài ứng dụng không thể thu hồi.

## Rollback không phá hủy dữ liệu

- Nếu áp dụng patch lỗi: transaction rollback tự động; điều tra lỗi trước khi thử lại, không tự chạy FINAL.
- Nếu đã áp dụng thành công: dừng triển khai Người thân, khóa các tài khoản `NguoiThan` hoặc thu hồi liên kết bằng API Admin theo phê duyệt riêng.
  Tài khoản khóa bị chặn ở request tiếp theo; helper realtime cũng lọc lại trạng thái tài khoản.
- Có thể triển khai lại bản backend trước tính năng sau khi kiểm tra vận hành. Giữ role/bảng/lịch sử; không DROP hoặc xóa dữ liệu.
- Lưu danh sách trạng thái trước khi khóa để có thể phục hồi có kiểm soát. Không chạy script seed cũ có DELETE toàn bộ PhanQuyen.
- `seed_phanquyen.js` mới chỉ thêm mặc định còn thiếu, giữ cấu hình và role lạ; không tự chạy trong deploy/startup.

## Kiểm thử an toàn

```powershell
cd D:\DoAnTotNghiep\DOAN_QLSUCKHOENGUOICAOTUOI\server
node --test test/*.test.js
```

Test SQL được SKIP mặc định. Chỉ bật sau khi cho phép tạo database thử nghiệm trên SQL Server cấu hình:

```powershell
$env:CARESENIOR_RELATIVES_SQL_TEST='1'
node --test test/relative-sql.integration.test.js
Remove-Item Env:CARESENIOR_RELATIVES_SQL_TEST
```

Runner chỉ dùng cấu hình để kết nối `master`, tạo database mới có tên cố định dạng `CareSeniorRelativesTest_<timestamp>_<random>`;
không nhận tên database đích tùy ý. DDL/fixture chạy trong pool mới đã kiểm tra tên khác database ứng dụng.
Runner không chạy nguyên FINAL (bỏ phần DROP/CREATE/USE đầu file), không import DB config ứng dụng hay khởi động worker,
không gửi email, không gọi SOS Mobile. HTTP/Socket.IO dùng loopback, dữ liệu tổng hợp trong database cách ly.
Database thử nghiệm được giữ lại, không tự xóa; mỗi lần chạy tạo một database mới và dùng thêm dung lượng đĩa.

## Kết quả thực hiện Giai đoạn 2

- Toàn bộ backend: **365 PASS, 0 FAIL**, 1 integration test SQL được SKIP theo mặc định an toàn.
- Chạy riêng integration SQL có bật cờ: **16/16 PASS**, gồm 15 nhóm kiểm tra và test cha.
- Frontend hồi quy: **50/50 PASS**, không sửa frontend.
- Kiểm tra SQL cuối cùng trên `QLSucKhoeNguoiCaoTuoi`: vẫn chỉ có ba role cũ; cả hai bảng Người thân chưa tồn tại.
- Không chạy patch/seed trên database ứng dụng; không sửa dữ liệu thật, Flutter, giao diện Web; không commit/push.
- Hai lỗi đầu trong quá trình xây fixture (nạp tên module và kỳ vọng 403 cho HTTP verb không có route) đã sửa và chạy lại đạt.
- Test mật khẩu cũ được cập nhật tên guard; thêm test hành vi giữ nguyên quyền cũ và chỉ cho Người thân đổi mật khẩu chính mình.

Database fixture được giữ lại, chỉ chứa dữ liệu tổng hợp:

1. `CareSeniorRelativesTest_1793031972613_e0446305` — lần đầu dừng ở fixture loader.
2. `CareSeniorRelativesTest_1793032040282_1a1cfd72` — lần kiểm tra kỳ vọng HTTP, đã được khắc phục.
3. `CareSeniorRelativesTest_1793032102818_f5a13fa3` — 13/13 PASS.
4. `CareSeniorRelativesTest_1793032539971_ff206442` — bản cuối, 16/16 PASS.

**Chưa thực hiện:** giao diện Người thân/Admin liên kết trên Web, xóa cache/toast/chuông tại browser,
nối Người thân vào fan-out SOS thật, kiểm thử Chrome cho role mới và áp dụng patch trên database ứng dụng.
Đây là phần dành cho các giai đoạn sau, không phải chức năng đã hoàn thành trong Giai đoạn 2.

## Danh sách file thay đổi (đường dẫn tính từ gốc repository)

14 file sửa:

```text
QLSucKhoeNguoiCaoTuoi_FINAL.sql
server/seed_phanquyen.js
server/src/app.js
server/src/controllers/auth.controller.js
server/src/controllers/nguoiDung.controller.js
server/src/controllers/permission.controller.js
server/src/middlewares/auth.middleware.js
server/src/middlewares/error.middleware.js
server/src/middlewares/permission.middleware.js
server/src/routes/auth.routes.js
server/src/routes/index.js
server/src/routes/nguoiDung.routes.js
server/src/socket.js
server/test/user-password-reset.test.js
```

12 file mới:

```text
server/database/README_nguoi_than.md
server/database/patch_nguoi_than.sql
server/src/controllers/relative.controller.js
server/src/routes/relative.routes.js
server/src/services/relativeAccess.service.js
server/src/services/relativeRead.repository.js
server/src/services/relativeRealtime.service.js
server/src/services/relativeSchema.js
server/src/utils/relativePolicy.js
server/src/utils/relativeValidation.js
server/test/relative-policy.test.js
server/test/relative-sql.integration.test.js
```

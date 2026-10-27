# CareSenior — Web Người cao tuổi, Giai đoạn 4

Ngày nghiệm thu: 27/10/2026. Kết luận: **READY WITH LIMITATIONS**.

## Chức năng đã triển khai

- Màn SOS riêng trong `/ca-nhan/sos`, nút đỏ lớn, vòng tiến trình giữ liên tục 3 giây. Hỗ trợ pointer và phím Space/Enter, bỏ qua key repeat. Nhả sớm, rời nút, pointer cancel/lost capture, blur, chuyển tab ẩn, pagehide hoặc rời màn đều hủy **thao tác giữ trước khi gửi**. Không có thao tác click thường gửi SOS.
- Phân biệt idle/holding/sending/confirmed/error/uncertain. Chỉ response hợp lệ, đúng hồ sơ và có thời gian từ API mới xác nhận ghi nhận. Số người chăm sóc bằng 0 hoặc chưa xác định được trình bày rõ. Xác nhận lưu không đồng nghĩa người chăm sóc đã xem hoặc đã đến hỗ trợ.
- Trạng thái request được giữ ở cấp workspace khi đổi route, chống nhấn lặp bằng khóa trạng thái đồng bộ. Không tự retry POST khi timeout, mất mạng, reconnect hay đọc lịch sử. Unknown outcome vẫn unknown khi lịch sử/realtime cập nhật; không tự suy luận kết quả của request bị mất phản hồi.
- Với kết quả chưa xác định: người dùng chủ động tải lịch sử thành công, xác nhận đã xem, chuẩn bị thao tác mới, rồi phải giữ đủ 3 giây lại. Với kết quả thành công/lỗi cũng cần chủ động chuẩn bị thao tác mới. Cơ chế chống trùng 30 giây/transaction của Backend được giữ nguyên.
- GPS hoàn toàn tùy chọn. Chỉ gọi Geolocation sau nút đồng ý lấy vị trí; xử lý denied/unsupported/timeout/invalid. Không đặt tọa độ mặc định. GPS hết hạn sau 2 phút không được dùng; thu hồi quyền hoặc chọn không chia sẻ sẽ xóa tọa độ. Khi bắt đầu giữ trong lúc GPS còn chờ, yêu cầu gửi không kèm vị trí và bỏ qua callback GPS đến muộn.
- Lịch sử và chi tiết SOS của chính NCT, không có thao tác tiếp nhận/giải quyết SOS. Màn Cảnh báo có phân loại SOS với sức khỏe/nhắc lịch, mức độ, trạng thái và chi tiết. Ghi chú xử lý nội bộ không được render.
- Tab Thông báo lấy dữ liệu tài khoản, phân biệt đọc/chưa đọc, đánh dấu đã đọc và mở route đã whitelist trong workspace. Đánh dấu đọc chỉ PATCH ThongBao, không PATCH trạng thái SOS.
- Tái sử dụng socket JWT hiện có. Sự kiện chỉ làm mất hiệu lực dữ liệu để tải lại qua API đúng quyền; không render payload socket như hồ sơ/chi tiết hay kết quả gửi thành công. Có debounce, dedupe hữu hạn, cập nhật trạng thái kết nối, reconnect, online/focus/visibility resync, cleanup khi logout/đổi tài khoản.
- Không tạo popup đè nút SOS. Nút AI nổi được ẩn riêng trên màn SOS; chức năng/logic AI giữ nguyên. Navigation vẫn đủ 5 mục.
- Đã sửa UI form số đo bị mất loại chỉ số khi danh mục tải lại lúc reconnect: form đang mở giữ snapshot loại/đơn vị đã chọn. Không đổi API, validation hay thuật toán sức khỏe. Chrome regression giữ HTTP danh mục ở trạng thái pending rồi lưu form thành công.

## File thay đổi trong Giai đoạn 4

12 file có sẵn được sửa:

| File | Mục đích |
|---|---|
| `frontend/src/hooks/useElderlyResource.js` | Nhận revision theo nhóm dữ liệu từ context realtime, giữ abort/session guard hiện có |
| `frontend/src/pages/ElderlyPortal/ElderlyPortalPage.jsx` | Provider realtime, coordinator SOS dùng chung route, trạng thái kết nối; bảo vệ khoảng cách navigation và ẩn FAB trên SOS |
| `frontend/src/pages/ElderlyPortal/ElderlyPortal.css` | UI SOS/cảnh báo/realtime và vùng chạm link |
| `frontend/src/pages/ElderlyPortal/ElderlyWorkspaceScreens.jsx` | Thay placeholder SOS/Cảnh báo, giữ placeholder AI |
| `frontend/src/pages/ElderlyPortal/ElderlyHomeHealth.jsx` | Nhãn shortcut SOS và giữ lựa chọn form khi danh mục resync; không đổi nghiệp vụ |
| `frontend/test/elderlyWorkspace.browser.test.js` | API RAM, Socket.IO cách ly, ca kiểm thử Giai đoạn 4 |
| `frontend/test/fixtures/elderlyWorkspacePreview.jsx` | Thao tác UI React thật và assertion responsive/realtime/hold |
| `server/src/services/alertNotification.service.js` | Signal SOS riêng về chủ hồ sơ sau commit, kiểm tra lại account/role/quyền hiện hành |
| `server/src/services/alertWorkflow.service.js` | Dùng cùng kiểm tra chủ hồ sơ khi phát cập nhật SOS; không thay đổi transaction/chuyển trạng thái |
| `server/test/sos-flow.test.js` | Kiểm tra owner event chỉ sau commit, không thêm notification |
| `server/test/sos-realtime-permissions.test.js` | Bổ sung mock signal owner, giữ nguyên assertion hồi quy Admin/NCS |
| `server/test/fixtures/relative-sos-fixture.cjs` | Cập nhật SQL double cho lookup chủ SOS, giữ fixture người thân cách ly |

11 file mới:

- `frontend/src/context/ElderlyLiveContext.js`
- `frontend/src/hooks/useElderlyRealtime.js`
- `frontend/src/utils/elderlyRealtime.js`
- `frontend/src/utils/elderlySafety.js`
- `frontend/src/services/elderlySafetyService.js`
- `frontend/src/pages/ElderlyPortal/ElderlySos.jsx`
- `frontend/src/pages/ElderlyPortal/ElderlyAlerts.jsx`
- `frontend/test/elderlySafety.test.js`
- `frontend/test/elderlyRealtime.test.js`
- `server/test/elderly-safety-realtime.test.js`
- `frontend/test/README_elderly_web_stage4.md`

## API và sự kiện tái sử dụng

| API | Mục đích |
|---|---|
| POST `/emergency-alerts` | Gửi SOS của tài khoản JWT; body chỉ nội dung và tọa độ đã được đồng ý nếu có |
| GET `/emergency-alerts` | Lịch sử SOS, Backend áp dụng scope NCT hiện tại |
| GET `/elderly/me/alerts` | Cảnh báo của chính NCT |
| GET `/notifications/me` | Thông báo tài khoản; GET này có materialize nhắc lịch theo nghiệp vụ cũ |
| PATCH `/notifications/:id/read` | Đọc thông báo đúng UserID; không đổi trạng thái cảnh báo/SOS |

Không thêm endpoint hoặc quyền. Các đường dẫn seen/resolve của SOS không được cung cấp trong adapter NCT.

Socket vẫn là singleton `socketClient` do AuthContext quản lý JWT. Bridge chỉ subscribe/off đúng callback của mình:

- `canhbao:new`, `canhbao:updated`: tải lại cảnh báo/SOS đúng NCT.
- `thongbao:new`: tải lại thông báo đúng tài khoản đang mở.
- `lichuongthuoc:updated`, `donthuoc:created`: làm mới dữ liệu thuốc theo API cũ.
- `lichkham:updated`: làm mới lịch khám.
- `chisuckhoe:new`: consumer sẵn sàng nếu Backend gửi cho owner; không giả định Backend hiện phát tất cả số đo Mobile tới NCT.
- `connect`, `disconnect`, `connect_error` và online/focus/visibility: trạng thái kết nối/resync, hoàn toàn không POST SOS.

Payload có ID tài khoản/NCT khác bị bỏ qua. Notification tối giản không có NCT ID được xử lý như signal từ private room của JWT rồi đọc lại API, không dùng trực tiếp để render dữ liệu. Event ID/status được dedupe trong bộ nhớ, tối đa 512 khóa, cửa sổ 60 giây; danh sách API tiếp tục loại hàng trùng ID. Reconnect có thể tải lại cùng hàng nhưng không append/thông báo lặp, không tạo SOS mới.

Backend bổ sung lookup owner trực tiếp qua HoSoNguoiCaoTuoi → NguoiDung → VaiTro/PhanQuyen, yêu cầu account HoatDong, role NguoiCaoTuoi, QLCANHBAO.ChoPhepXem và đúng hồ sơ. Signal riêng chỉ có ID, trạng thái và thời gian cần để invalidation, không có GPS/ghi chú nội bộ. Chủ hồ sơ bị khóa/đổi role/mất quyền không được nhận signal mới. Cả tạo và cập nhật SOS đều phát sau commit. Luồng staff/family hiện có được tái sử dụng, không tạo notification/worker/realtime thứ hai.

## Kết quả kiểm thử cuối

| Nhóm | Kết quả | Phạm vi thực sự chạy |
|---|---|---|
| Toàn bộ Backend | **423 PASS, 0 FAIL, 1 SKIP** | 424 test tính cả SQL opt-in bị bỏ qua |
| Toàn bộ Frontend | **217 PASS, 0 FAIL, 0 SKIP** | Bao gồm 18 unit SOS/bridge và browser suite |
| Chrome fixture | **33 ca PASS** | Chrome executable thật, headless/profile tạm; React StrictMode, API RAM, Socket.IO local |
| Giữ/nhả/hủy/rời màn | **PASS** | Timer xác định trong unit; pointer/Space tổng hợp trong Chrome; đủ 3s mới gọi API |
| GPS optional | **PASS với mock** | Hỗ trợ, cấp quyền, từ chối, timeout, tọa độ sai, hết hạn, pending callback và thu hồi/clear |
| Timeout / lỗi mạng | **PASS với mock** | Coordinator không retry; Chrome kiểm tra HTTP 503 + transport reconnect, không tự báo thành công |
| Request đang gửi qua đổi route | **PASS** | HTTP fixture cố tình giữ pending, rời SOS rồi quay lại nhận đúng response ban đầu, chỉ 1 POST |
| Backend → Socket.IO owner | **PASS, SQL double** | Production Socket.IO + JWT thật của fixture, hai NCT khác nhau; owner hợp lệ nhận, tài khoản khác không nhận; quyền bị thu hồi được kiểm tra lại |
| Admin/NCS/Người thân | **PASS, cách ly** | Hồi quy HTTP SOS → controller → transaction mock → Socket.IO; scope, consent và payload riêng, tắt chuông/chống trùng cũ vẫn PASS |
| Thông báo thường | **PASS** | Socket event lặp/API hàng trùng chỉ hiện 1 hàng; đọc đúng tài khoản; route liên quan không rời workspace |
| Session/role | **PASS** | Đổi tài khoản lúc đang giữ không gửi; logout/storage/race tests Giai đoạn 2–3 và guards 4 role |
| Hồi quy sức khỏe/thuốc/lịch khám | **PASS** | Bộ cũ; form đang nhập qua catalog resync không mất loại chỉ số; confirm cạnh tranh Giai đoạn 3 giữ nguyên |
| Responsive | **PASS** | Tour 360/768/1024/1440px; không tràn ngang; mô phỏng chữ 1,8× trên 360/1024px gồm SOS/Cảnh báo |
| Keyboard/accessibility | **PASS trong fixture** | Button có focus, Space/Enter handler, cancel/blur, progressbar và trạng thái; chưa nghiệm thu screen reader/thiết bị trợ năng thật |
| Production build | **PASS** | Còn warning bundle khoảng 2,01 MB trước gzip / 625 KB gzip |
| Lint | **PASS, 0 error** | 10 warning sẵn có, không có warning mới ở file Giai đoạn 4 |
| Git/whitespace | **PASS** | git diff --check và kiểm tra whitespace file mới |
| SQL Server/Stage6 tích hợp | **NOT_RUN** | Không kết nối database thật, không tạo DB; SQL integration opt-in bị SKIP vì có thao tác tạo DB ngoài phạm vi |
| DB chính/đăng nhập hệ thống thật | **NOT_RUN** | Không dùng tài khoản chính, không gọi API 5000/5173 để kiểm thử |
| GPS/permission dialog thật | **NOT_RUN** | Geolocation được kiểm tra bằng stub trong Chrome, không lấy tọa độ thật |
| Chuột/touch vật lý, screen reader, loa thật | **NOT_RUN** | Sự kiện trình duyệt tổng hợp; âm thanh các role cũ chỉ kiểm tra mock/hồi quy |

Các assertion số liệu Node tính cả suite cha của browser; không cộng các lượt chạy lại thành test mới. 33 ca Chrome gồm 25 ca hồi quy và 8 ca bổ sung: hủy SOS, denied GPS, uncertain/reconnect, pending/đổi route, đổi tài khoản khi giữ, thông báo realtime/read/link, gửi bằng bàn phím 360px và có GPS 768px.

Lệnh đã chạy:

```powershell
# server/
$env:CARESENIOR_RELATIVES_SQL_TEST='0'
node --test test/*.test.js

# frontend/
node --test test/*.test.js
npm run build
npm run lint

# repository root
git status --short
git diff --name-only
git diff --check
```

Frontend không có script npm test; dùng Node runner của project. Vite fixture dùng `envDir:false`, API/Socket.IO RAM trên port ngẫu nhiên. Không nạp SQL config/.env hoặc khởi động worker thật. Các bộ test Backend inject config/db bằng SQL doubles; Socket.IO là server/client thật nhưng database chỉ là mô hình RAM.

Log: TEMP `caresenior-stage4-backend.txt`, `caresenior-stage4-frontend.txt`. Ảnh và JSON cuối: `C:\Users\Admin\AppData\Local\Temp\caresenior-elderly-web-67v38c`.

## Bảo toàn và giới hạn

- Baseline SHA-256 trước sửa: 64 file dirty/untracked, lưu ngoài repo trong TEMP `caresenior-stage4-baseline-341dd3d31f544bfd9a69958ae0c2830d`. Không mất file nào; 7 file baseline được sửa đúng phạm vi nêu trên, các file khác giữ nguyên. Cả 26 file design_reference được bảo toàn.
- Controller confirm thuốc Giai đoạn 3 giữ nguyên hash so với baseline. Không sửa authentication/JWT/Google, role, schema SQL, API nghiệp vụ thuốc/lịch khám/sức khỏe, source Flutter hoặc audio/SOS hook các role cũ.
- Chỉ thay đổi emission owner SOS trong hai backend service. Không có migration, seed, patch, INSERT dữ liệu thử, database mới/xóa hoặc SOS thật trong quá trình kiểm thử.
- Không gọi GET `/notifications/me` trên database chính để kiểm thử chỉ đọc; mọi ca API này dùng RAM hoặc mock materializer. Khi người dùng thực sự mở tab Thông báo trên bản chạy thật, API cũ vẫn có materialize theo nghiệp vụ đã có.
- Không khẳng định database đang chạy hoàn toàn bất biến trước các worker độc lập; xác nhận thao tác kiểm thử này không ghi vào database chính/fixture SQL. Không tự dừng/khởi động lại server đang chạy.
- Dữ liệu SOS/GPS chỉ lưu trong bộ nhớ workspace. Đổi route giữ trạng thái gửi; đăng xuất/đổi tài khoản thì dọn dữ liệu. F5 không khôi phục một request đang chờ từ storage và không tự POST lại; cần xem lịch sử, không suy luận request cũ chưa được nhận.
- Không hứa cập nhật tức thời cho thay đổi chưa có event owner (ví dụ một số đường ghi chỉ số sức khỏe). Đồng bộ lại, focus/online/visibility và refresh vẫn đọc API mới.
- Chưa kiểm chứng môi trường triển khai HTTPS, GPS/permission UI thật, mạng thiết bị thật hay SQL tích hợp. Đây là các giới hạn nghiệm thu còn lại.
- Rủi ro endpoint staff `/medication-schedules/:id/status` được ghi nhận ở Giai đoạn 3 vẫn nằm ngoài phạm vi Giai đoạn 4; không tự sửa nghiệp vụ thuốc.
- Không commit, push, reset hoặc clean Git. Dừng sau Giai đoạn 4; placeholder AI Giai đoạn 5 được giữ nguyên.

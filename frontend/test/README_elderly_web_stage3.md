# Nghiệm thu Web Người cao tuổi — Giai đoạn 3 (27/10/2026)

Kết luận: **READY WITH LIMITATIONS** cho workspace NCT Giai đoạn 3.
Chưa triển khai SOS/Cảnh báo Web NCT (Giai đoạn 4), AI (Giai đoạn 5).
Không commit/push, không chạy SQL, không sửa Flutter.

## Thay đổi trong lượt Giai đoạn 3

7 file có sẵn được chỉnh sửa:

- `frontend/src/components/ElderlyProfileFields.jsx`: tùy chọn ẩn CCCD khi sửa hồ sơ riêng; mặc định các luồng cũ vẫn giữ CCCD.
- `frontend/src/pages/ElderlyPortal/ElderlyPortal.css`: UI nội dung, responsive, modal và khoảng cách AI theo chiều cao navigation.
- `frontend/src/pages/ElderlyPortal/ElderlyPortalPage.jsx`: cung cấp callback tải lại hồ sơ qua owner gate; đo chiều cao navigation để chữ lớn không làm AI chồng thanh điều hướng. Giữ nguyên 5 mục và routes.
- `frontend/src/pages/ElderlyPortal/ElderlyWorkspaceScreens.jsx`: thay 5 placeholder thuộc Giai đoạn 3 bằng component chức năng; giữ nguyên nội dung placeholder SOS/Cảnh báo/AI.
- `frontend/test/elderlyWorkspace.browser.test.js`: mở rộng API RAM, giữ kiểm thử auth/guard Giai đoạn 2 và thêm dữ liệu/chức năng Giai đoạn 3.
- `frontend/test/fixtures/elderlyWorkspacePreview.jsx`: thao tác UI thật trong Chrome fixture.
- `server/src/controllers/lichUongThuoc.controller.js`: chỉ chỉnh `confirmMine`, theo phê duyệt riêng trong hội thoại.

10 file mới:

- `frontend/src/hooks/useElderlyResource.js`
- `frontend/src/services/elderlyCareService.js`
- `frontend/src/utils/elderlyCare.js`
- `frontend/src/pages/ElderlyPortal/ElderlyCareUi.jsx`
- `frontend/src/pages/ElderlyPortal/ElderlyHomeHealth.jsx`
- `frontend/src/pages/ElderlyPortal/ElderlySchedule.jsx`
- `frontend/src/pages/ElderlyPortal/ElderlyPersonalProfile.jsx`
- `frontend/test/elderlyCare.test.js`
- `server/test/medication-confirm-race.test.js`
- `frontend/test/README_elderly_web_stage3.md`

Đã ghi baseline SHA-256 của 52 file đang có thay đổi/chưa theo dõi trước khi sửa vào thư mục TEMP ngoài repository. Đối chiếu cuối: 5 file baseline thay đổi đúng phạm vi (3 file workspace + 2 file browser test nêu trên); các file baseline khác được giữ nguyên, không có file bị mất. Cả 26 file trong `mobile/design_reference/` được giữ nguyên. Hai file tracked mới được sửa trong lượt này là shared profile fields và controller confirm. Không sửa auth/JWT, role middleware, endpoint, permission, SQL, model hoặc source Flutter trong Giai đoạn 3.

## Chức năng và API tái sử dụng

| Màn/chức năng | API hiện có | Hành vi |
|---|---|---|
| Hồ sơ/gate | GET `/elderly/me` | Owner gate từ Giai đoạn 2; không lấy NCT ID từ URL |
| Chỉ số | GET `/health-metric-types`, GET/POST `/elderly/me/health-metrics` | Danh mục, số mới nhất, bộ lọc loại/khoảng ngày, biểu đồ theo thời điểm, lịch sử, thêm số đo |
| Thuốc | GET `/elderly/me/medication-schedule` | Ngày Việt Nam, từng liều, tiến độ theo số liều, trạng thái từ backend |
| Xác nhận thuốc | PATCH `/medication-schedule/:id/confirm` | Trong ngày; liều bỏ lỡ hôm nay được xác nhận đã uống muộn; hộp thoại ghi nhận việc đã xảy ra |
| Ngày cũ | PATCH `/medication-schedule/:id/supplement` | Thời điểm có offset +07:00, lý do, xác nhận thông tin; eligibility hiển thị 48 giờ, backend kiểm tra lại |
| Lịch khám | GET `/elderly/me/appointments`, GET `/elderly/me/appointments/upcoming` | Danh sách, sắp tới/lịch sử, trạng thái/ngày, chi tiết/kết quả, chỉ đọc |
| Người chăm sóc | GET `/elderly/me/caregivers` | Dữ liệu được phân công của chính tài khoản |
| Sửa hồ sơ | PUT `/elderly/me` | Whitelist trường được phép, không gửi CCCD/ID/role/trạng thái quản lý |
| Mật khẩu | POST `/auth/change-password` | Dùng nguyên modal/service Web hiện có |

Trang chủ tổng hợp các API chỉ đọc trên; mỗi phần có loading/error/empty riêng và nút tải lại. Hồ sơ có callback reload qua gate đã kiểm tra owner. Không sử dụng GET `/notifications/me` có tác dụng materialize dữ liệu. Không gọi API SOS hoặc AI từ màn placeholder.

Danh mục/đơn vị lấy từ API. Không copy giới hạn minh họa, không đổi validation/thuật toán cảnh báo. Backend quyết định hợp lệ và `laBatThuong`. POST chỉ số hiện có ghi thời điểm máy chủ hiện tại, vì vậy form không cung cấp lựa chọn thời gian đo trong quá khứ mà API này chưa lưu.

Web/Mobile dùng cùng API và hồ sơ. Sau thao tác, Web tải lại dữ liệu từ API; cập nhật từ Mobile xuất hiện khi người dùng tải lại mục hoặc refresh trang. Không cam kết realtime tức thời cho các mục chưa có event. Request dữ liệu có AbortSignal và kiểm tra phiên; response cũ sau đổi tài khoản/bộ lọc không được render. Không lưu hồ sơ, số đo, lịch thuốc hoặc AI vào localStorage. Mutation dùng khóa đồng bộ để hai click cùng render chỉ tạo một request, không tự retry mutation sau lỗi mạng.

## Lỗi xác nhận thuốc và bản sửa được duyệt

Trước sửa đã chạy characterization với handler thật + SQL double RAM: hai request đồng thời đều trả 200 và request sau ghi đè `ThoiGianThucTe`.

Bản sửa chỉ ở `confirmMine`:

1. SELECT trạng thái đang thấy cùng ownership/date hiện có.
2. UPDATE nguyên tử với `TrangThai=@previousStatus`, loại trạng thái đã `DaUong` và trạng thái không thay đổi.
3. Dùng `@@ROWCOUNT`; chỉ mutation thành công mới xóa nhắc chưa đọc và phát event.
4. Request thua/lặp trả envelope lỗi hiện có, HTTP 409, `DOSE_CHANGED`, thông báo tải lại lịch. Không sửa lại thời gian đã uống.
5. Giữ nguyên whitelist, ownership, chỉ xác nhận hôm nay, xác nhận muộn BoLo hôm nay và API supplement ngày cũ.

Test 5 ca: cùng xác nhận Web/Mobile, lặp/đổi liều đã uống, uống muộn, hai trạng thái cạnh tranh, ngày cũ/ngoài quyền/trạng thái lạ. **PASS bằng production handler + SQL mock, không phải thử cạnh tranh trên SQL Server thật.**

Giới hạn ngoài phê duyệt: endpoint cũ PATCH `/medication-schedules/:id/status` cho Admin/Người chăm sóc vẫn dùng UPDATE không có điều kiện chống ghi đè tương tự. Chưa sửa endpoint này theo yêu cầu chỉ chỉnh confirm. Không suy rộng kết quả chống trùng của `/confirm` sang endpoint đó.

## Kết quả kiểm thử

| Nhóm | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Toàn bộ Backend | PASS: 420, FAIL: 0, SKIP: 1 | Node tests; SQL integration opt-in được tắt để tránh tạo database |
| Toàn bộ Frontend | PASS: 191, FAIL: 0, SKIP: 0 | Bao gồm unit, guard/session, Người thân, SOS/audio mock và Chrome fixture |
| Chrome headless fixture | PASS: 25 ca (suite cha được Node tính riêng) | UI React thật, API/Socket.IO RAM, profile Chrome tạm, port ngẫu nhiên |
| Responsive | PASS | Tour các màn tại 360/768/1024/1440px, không tràn ngang |
| Chữ 1,8× | PASS | 360/1024px; Home/Health/Schedule/Profile; AI không đè navigation |
| Health | PASS | Biểu đồ/lịch sử, đổi loại và đơn vị, 13:05/23:55 cùng ngày; validator backend trả lỗi cho số đo âm; lưu hợp lệ + double click |
| Thuốc | PASS | Chọn ngày, tiến độ, confirm một lần, supplement có offset/lý do trong RAM; cạnh tranh handler backend mock |
| Lịch khám | PASS | Tour 4 kích thước; modal kết quả đọc; không có thao tác ghi |
| Hồ sơ | PASS | CCCD không chỉnh sửa, lưu qua own API rồi refresh gate/header, mật khẩu mock, logout/storage và đổi tài khoản |
| Hủy form hồ sơ | PASS | Chạy lại Chrome actions sau chỉnh reset form: trường tùy chọn chưa lưu không giữ sang lần mở kế tiếp |
| Kiểm thử bổ sung sau chỉnh reset form cuối | PASS | 31 unit/session/gate + browser actions (2 test tính cả suite cha) |
| Production build | PASS | Còn cảnh báo bundle lớn khoảng 1,98 MB trước gzip |
| Lint | PASS, 0 error | 10 warning sẵn có; không có warning mới ở file Stage 3 |
| git diff --check | PASS | Kiểm tra cả file tracked; kiểm tra whitespace file mới riêng |
| Tích hợp SQL Stage6/main | NOT_RUN | Không kết nối SQL, không tạo/xóa database, không chạy patch/seed |
| Web và Flutter thật đồng thời | NOT_RUN | Đã kiểm tra chung handler bằng mock; không sửa/chạy Flutter hay ghi thuốc thật |
| Đăng nhập database chính và loa thật | NOT_RUN | Browser chỉ dùng tài khoản RAM; không gửi SOS hay gọi điện |

Lệnh từ `server/` (PowerShell):

```powershell
$env:CARESENIOR_RELATIVES_SQL_TEST='0'
node --test test/*.test.js
```

Lệnh từ `frontend/`:

```powershell
node --test test/*.test.js
npm run build
npm run lint
```

Frontend không có script `npm test`; dùng Node test runner hiện có. Browser dùng `envDir:false`, không tải `.env`, không khởi động Backend/worker thật. Nếu không có Chrome thì phải báo SKIP/NOT_RUN. Các payload giả chỉ tồn tại trong RAM test process. Log lần chạy đầy đủ ở TEMP `caresenior-stage3-backend.txt`, `caresenior-stage3-frontend.txt`; ảnh/JSON Chrome ở `C:\Users\Admin\AppData\Local\Temp\caresenior-elderly-web-Mmd6bM` (full suite), `caresenior-elderly-web-BffEub` (actions sau chỉnh cuối).

## Giới hạn và an toàn

- Chưa xác minh tích hợp SQL/thiết bị thật; không coi mock là bằng chứng SQL thật. Một SQL test bị SKIP vì yêu cầu tạo DB nằm ngoài phạm vi.
- Chưa thử bộ lọc khoảng ngày sức khỏe/lịch khám bằng thao tác lịch đầy đủ trên Chrome; adapter truyền đúng tham số và helper lọc ngày Việt Nam đã có unit test. Đã thử đổi loại chỉ số và ngày thuốc trên Chrome.
- Keyboard focus của nút và tương tác form được kiểm tra trong Chrome; chưa nghiệm thu đầy đủ bằng screen reader.
- Endpoint trạng thái thuốc của staff nêu trên cần phê duyệt riêng nếu muốn chống ghi đè ở mọi đường cập nhật.
- Không có SQL patch/schema/role/permission nào được chỉnh. Quá trình kiểm thử không ghi vào database chính hoặc fixture SQL. Không khẳng định database đang hoạt động hoàn toàn bất biến nếu worker độc lập vẫn chạy.
- Giữ nguyên source Mobile, auth/JWT/Google của baseline và các chức năng Người thân/SOS/AI đã có. Dừng Giai đoạn 3.

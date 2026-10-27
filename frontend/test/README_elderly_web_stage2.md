# CareSenior — Web Người cao tuổi, Giai đoạn 2

## Phạm vi đã triển khai

- Mật khẩu: cùng tài khoản `NguoiCaoTuoi` đăng nhập Web bằng tên/email/SĐT với `platform: web`.
- Backend chỉ mở điều kiện role trong password login, giữ nguyên claims/version JWT và login Mobile.
- `/ca-nhan` là workspace riêng; các URL quản trị, người chăm sóc và Người thân vẫn bị guard chặn.
- Năm mục: Trang chủ, Lịch trình (thuốc/khám), SOS, Cảnh báo, Hồ sơ; thêm đường dẫn Sức khỏe và AI riêng.
- Các trang nghiệp vụ chỉ là placeholder rõ ràng, không gọi API sức khỏe/thuốc/lịch khám/SOS/thông báo/AI.
- Chỉ `GET /api/elderly/me` để kiểm tra hồ sơ và `POST /api/elderly/me` khi người dùng chủ động hoàn thiện.
- Chỉ lỗi `404 ELDERLY_PROFILE_NOT_FOUND` mở form. Mạng, lỗi server, 403, 401 và 404 khác không tạo hồ sơ.
- Form dùng lại `ElderlyPersonalFields`, `ElderlyHealthFields` và validation Backend hiện có, gửi whitelist 9 trường.
- Trước submit/retry có GET kiểm tra lại: hồ sơ đã được hoàn thiện trên Mobile được dùng lại. Transaction/idempotency
  và khóa tài khoản khi tạo hồ sơ vẫn do `mobileOnboarding.controller.js` hiện có đảm nhiệm.
- Phiên Web có revision nội bộ để loại response cũ, hủy request, khôi phục danh tính/quyền từ API và xử lý storage event
  giữa các tab. Không đổi/revoke JWT Mobile. Không lưu hồ sơ, dữ liệu sức khỏe hoặc chat vào browser storage.
- Không thay Google, Flutter, schema, seed, SQL patch hoặc nghiệp vụ thuốc/SOS/AI.

## Danh sách file của Giai đoạn 2

Sửa:

```text
frontend/src/App.jsx
frontend/src/components/ProtectedRoute.jsx
frontend/src/components/WorkspaceRoutes.jsx
frontend/src/context/AuthContext.jsx
frontend/src/pages/Login/LoginPage.jsx
frontend/src/services/authService.js
frontend/src/services/axiosClient.js
frontend/src/services/permissionService.js
frontend/src/utils/accessControl.js
frontend/test/relativePortal.test.js
server/src/controllers/auth.controller.js
server/test/login-identifiers.test.js
```

Tạo:

```text
frontend/src/hooks/useElderlyWorkspace.js
frontend/src/pages/ElderlyPortal/ElderlyPortal.css
frontend/src/pages/ElderlyPortal/ElderlyPortalPage.jsx
frontend/src/pages/ElderlyPortal/ElderlyProfileCompletion.jsx
frontend/src/pages/ElderlyPortal/ElderlyWorkspaceScreens.jsx
frontend/src/services/elderlyWorkspaceService.js
frontend/src/utils/elderlyWorkspace.js
frontend/src/utils/webSession.js
frontend/test/elderlyWorkspace.browser.test.js
frontend/test/elderlyWorkspace.test.js
frontend/test/fixtures/elderlyWorkspacePreview.jsx
frontend/test/webSession.test.js
frontend/test/README_elderly_web_stage2.md
server/test/elderly-web-scope.test.js
```

## Kiểm thử không dùng SQL Server

Backend, từ thư mục `server` (PowerShell):

```powershell
$env:CARESENIOR_RELATIVES_SQL_TEST='0'
node --test test/*.test.js
```

Frontend, từ thư mục `frontend`:

```powershell
node --test test/*.test.js
npm run lint
npm run build
```

Test Chrome dùng process headless/profile tạm riêng và HTTP/Socket.IO fixture RAM trên port ngẫu nhiên.
Vite fixture dùng `envDir: false`; không nạp `.env`, SQL, worker, email hoặc server đang chạy ở 5000/5173.
Chrome mặc định ở `C:/Program Files/Google/Chrome/Application/chrome.exe`; có thể đặt `CARESENIOR_TEST_CHROME`.
Không có Chrome thì test browser được SKIP, không được ghi PASS.

Các viewport trong iframe được kiểm tra thực tế bằng `innerWidth` ở 360/768/1024/1440px, chạy React StrictMode.
Frame clock chỉ trong fixture được ánh xạ sang timer để headless virtual time chạy focus/animation ổn định.
Test nhiều cửa sổ dùng hai browsing context cùng origin, browser tự phát storage event khi context thứ hai đổi token.
Đây không phải thử đăng nhập qua profile Chrome của người dùng hoặc trên database chính.

Kết quả lần chạy nghiệm thu:

- Backend: 415 PASS, 0 FAIL, 1 SKIP (SQL opt-in tạo database không chạy).
- Frontend: 174 PASS, 0 FAIL, 0 SKIP; gồm browser suite và hồi quy Người thân/SOS/timezone.
- Browser: 18 ca của workspace NCT PASS (cộng suite cha trong thống kê Node).
- Build/lint PASS; lint còn 10 warning đã có ở shared components; build còn warning bundle lớn.
- Đăng nhập thật, SQL tích hợp, Web/Mobile thật đồng thời và âm thanh qua loa: NOT_RUN.

Không dùng tài khoản/dữ liệu thật để kiểm thử, không chạy SQL, patch, seed hoặc tạo database.
Không commit/push. Dừng sau Giai đoạn 2; chưa mở nghiệp vụ của các màn placeholder.

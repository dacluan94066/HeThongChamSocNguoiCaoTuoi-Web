# Kiểm kê quyền API

Các đường dẫn dưới đây đều có tiền tố `/api`. `—` nghĩa là endpoint xác thực công khai, không thể yêu cầu JWT/quyền trước khi đăng nhập. Những route có JWT đều dùng `checkPermission`, ngoài kiểm tra vai trò/phạm vi dữ liệu vốn có. `:id` là tham số đường dẫn.

| Phương thức | Route | MaChucNang | Hành động |
|---|---|---|---|
| POST | /auth/register, /auth/register-caregiver, /auth/login, /auth/google, /auth/forgot-password, /auth/verify-otp, /auth/reset-password-with-token | — (công khai) | — |
| GET | /auth/me, /auth/login-history | QLHOSONCT | xem |
| PUT | /auth/me | QLHOSONCT | sua |
| POST | /auth/change-password | QLHOSONCT | sua |
| GET | /elderly/me, /elderly/, /elderly/:id | QLHOSONCT | xem |
| PUT | /elderly/me, /elderly/:id, /elderly/:id/caregiver | QLHOSONCT | sua |
| POST | /elderly/ | QLHOSONCT | them |
| DELETE | /elderly/:id | QLHOSONCT | xoa |
| GET | /elderly/me/caregivers | QLNGUOICHAMSOC | xem |
| GET | /elderly/me/alerts, /elderly/:id/alerts | QLCANHBAO | xem |
| GET | /elderly/me/appointments, /elderly/me/appointments/upcoming, /elderly/:id/appointments/upcoming | QLLICHKHAM | xem |
| GET | /elderly/me/health-metrics, /elderly/:id/health-metrics | QLCHISOSK | xem |
| POST | /elderly/me/health-metrics | QLCHISOSK | them |
| GET | /elderly/me/medication-schedule, /elderly/:id/medication-schedule, /elderly/:id/prescriptions | QLLICHUONGTHUOC | xem |
| POST | /elderly/:id/prescriptions | QLLICHUONGTHUOC | them |
| GET | /users/, /users/:id | QLNGUOIDUNG | xem |
| POST | /users/ | QLNGUOIDUNG | them |
| PUT | /users/:id | QLNGUOIDUNG | sua |
| PATCH | /users/:id/toggle-status | QLNGUOIDUNG | sua |
| PUT | /users/me/password | QLHOSONCT | sua |
| GET | /caregivers/me/elderly | QLHOSONCT | xem |
| GET | /caregivers/, /caregivers/:id | QLNGUOICHAMSOC | xem |
| POST | /caregivers/ | QLNGUOICHAMSOC | them |
| PUT | /caregivers/:id | QLNGUOICHAMSOC | sua |
| POST | /caregivers/:id/account | QLNGUOIDUNG | them (chỉ Admin) |
| POST | /caregivers/:id/account/reset-password | QLNGUOIDUNG | sua (chỉ Admin) |
| GET | /medications/, /medications/:id | QLTHUOC | xem |
| POST | /medications/ | QLTHUOC | them |
| PUT | /medications/:id | QLTHUOC | sua |
| DELETE | /medications/:id | QLTHUOC | xoa |
| GET | /medication-schedules/ | QLLICHUONGTHUOC | xem |
| PATCH | /medication-schedules/:id/status, /medication-schedule/:id/confirm | QLLICHUONGTHUOC | sua |
| GET | /appointments/ | QLLICHKHAM | xem |
| POST | /appointments/ | QLLICHKHAM | them |
| PUT | /appointments/:id | QLLICHKHAM | sua |
| PATCH | /appointments/:id/cancel | QLLICHKHAM | xoa |
| PATCH | /appointments/:id/result | QLLICHKHAM | sua |
| GET | /health-metrics/, /health-metric-types/ | QLCHISOSK | xem |
| POST | /health-metrics/ | QLCHISOSK | them |
| GET | /alerts/, /emergency-alerts/ | QLCANHBAO | xem |
| POST | /emergency-alerts/ | QLCANHBAO | them |
| PATCH | /alerts/:id/seen, /alerts/:id/resolve, /emergency-alerts/:id/seen, /emergency-alerts/:id/resolve | QLCANHBAO | sua |
| GET | /emergency-contacts/ | QLLIENHEKC | xem |
| POST | /emergency-contacts/ | QLLIENHEKC | them |
| PATCH | /emergency-contacts/priorities | QLLIENHEKC | sua |
| PUT | /emergency-contacts/:id | QLLIENHEKC | sua |
| DELETE | /emergency-contacts/:id | QLLIENHEKC | xoa |
| GET | /care-notes/, /care-notes/:id/history | QLNHATKY | xem |
| POST | /care-notes/ | QLNHATKY | them |
| PATCH | /care-notes/:id | QLNHATKY | sua |
| DELETE | /care-notes/:id | QLNHATKY | xoa |
| GET | /permissions/me | QLHOSONCT | xem |
| GET | /permissions/matrix | QLNGUOIDUNG | xem |
| PUT | /permissions/matrix | QLNGUOIDUNG | sua |
| GET | /notifications/me | QLCANHBAO | xem |
| PATCH | /notifications/:id/read | QLCANHBAO | xem (đánh dấu thông báo đã đọc) |
| GET | /care-assistant/profiles, /care-assistant/status | QLHOSONCT | xem |
| POST | /care-assistant/query, /care-assistant/chat | QLHOSONCT | xem (truy vấn chỉ-đọc) |
| GET | /reports/health-summary | QLBAOCAO | xem |

`GET /` ngoài `/api` là health check công khai. Quyền không thay thế kiểm tra phạm vi: NCT chỉ hồ sơ mình, NCS chỉ người được phân công; các thao tác phân công/tài khoản quản trị vẫn chỉ Admin.

# Hệ thống quản lý và cảnh báo chăm sóc sức khỏe người cao tuổi

Project gồm Web quản trị React/Vite, backend Node.js/Express và cơ sở dữ liệu SQL Server. Backend được dùng chung cho Web và ứng dụng Mobile.

## Chạy thử project

### 1. Tạo cơ sở dữ liệu

Mở SQL Server Management Studio và chạy file:

```text
QLSucKhoeNguoiCaoTuoi_FINAL.sql
```

Lưu ý: script hiện tại sẽ xóa database `QLSucKhoeNguoiCaoTuoi` nếu database đã tồn tại rồi tạo lại từ đầu. Không chạy trên cơ sở dữ liệu có dữ liệu cần giữ.

### 2. Cấu hình backend

Sao chép `server/.env.example` thành `server/.env`, sau đó điền:

- Thông tin kết nối SQL Server.
- `JWT_SECRET` bằng một chuỗi bí mật đủ dài.
- `SEED_PASSWORD` là mật khẩu dùng chung để tạo các tài khoản chạy thử.

Không commit file `server/.env` lên Git.

### 3. Cài đặt và chạy backend

Mở terminal tại thư mục `server`:

```bash
npm install
npm run dev
```

Backend mặc định chạy tại `http://localhost:5000`.

### 4. Tạo tài khoản chạy thử

Giữ backend hoạt động và mở terminal khác tại thư mục `server`:

```bash
node seed_users.js
```

File SQL đã tạo sẵn 4 vai trò, 11 chức năng và 44 dòng phân quyền. Chỉ chạy
`seed_phanquyen.js` khi cần khởi tạo lại ma trận quyền; không bắt buộc sau khi
chạy file SQL trên.

Các tài khoản được tạo bởi `seed_users.js`:

| Tên đăng nhập | Vai trò |
|---|---|
| `admin` | Quản trị viên |
| `doctor01` | Bác sĩ |
| `nurse01` | Bác sĩ / nhân viên y tế |
| `caregiver01` | Người chăm sóc |

Tất cả tài khoản chạy thử sử dụng giá trị `SEED_PASSWORD` đã cấu hình trong `server/.env`. README không cung cấp hoặc lưu mật khẩu này.

### 5. Cài đặt và chạy frontend

Mở terminal tại thư mục `frontend`:

```bash
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5173` và gọi backend theo `VITE_API_URL`.

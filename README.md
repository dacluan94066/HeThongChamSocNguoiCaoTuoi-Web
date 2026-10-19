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

File SQL đã tạo sẵn 3 vai trò, 11 chức năng và 33 dòng phân quyền. Chỉ chạy
`seed_phanquyen.js` khi cần khởi tạo lại ma trận quyền; không bắt buộc sau khi
chạy file SQL trên.

Các tài khoản được tạo bởi `seed_users.js`:

| Tên đăng nhập | Vai trò |
|---|---|
| `admin` | Quản trị viên |
| `caregiver01` | Người chăm sóc |
| `nct.an`, `nct.binh`, `nct.cuong`, `nct.dung`, `nct.duc` | Người cao tuổi (Mobile) |

Muốn có dữ liệu thử (hồ sơ, toa thuốc, lịch khám, chỉ số), sau khi chạy
`seed_users.js` hãy chạy `DU_LIEU_MAU_DAY_DU.sql` trong SSMS, rồi chạy lại
`node seed_users.js` để liên kết tài khoản Mobile với các hồ sơ người cao tuổi vừa tạo.
Tên bác sĩ
trong dữ liệu này chỉ là thông tin của lần khám bên ngoài, không phải vai trò
hay tài khoản đăng nhập trong hệ thống.

Tất cả tài khoản chạy thử sử dụng giá trị `SEED_PASSWORD` đã cấu hình trong `server/.env`. README không cung cấp hoặc lưu mật khẩu này.

### 5. Cài đặt và chạy frontend

Mở terminal tại thư mục `frontend`:

```bash
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5173` và gọi backend theo `VITE_API_URL`.

Tại trang đăng nhập Web, người chăm sóc có thể chọn **Tạo tài khoản Web**. Tài khoản
mới ở trạng thái **Chờ duyệt**, chưa thể đăng nhập. Quản trị viên vào **Người dùng &
Phân quyền** để kiểm tra và duyệt, sau đó gán người cao tuổi phụ trách trong **Hồ sơ
NCT**. Không cần chạy thêm SQL cho luồng đăng ký này. Nếu email/SĐT đã nằm trong hồ
sơ người chăm sóc được tạo trước đó, quản trị viên cần tạo/liên kết tài khoản qua
giao diện quản trị; đăng ký công khai không tự nhận hồ sơ có sẵn.

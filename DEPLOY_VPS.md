# Hướng dẫn Deploy CareSenior lên Cloud VPS Ubuntu 22.04 với Docker Compose

Tài liệu hướng dẫn triển khai toàn diện hệ thống CareSenior lên Cloud VPS (SuniHost) và gắn tên miền `caresenior.site`.

---

## 1. Thông số hệ thống
- **VPS IP**: `103.211.207.179`
- **Hệ điều hành**: Ubuntu 22.04 LTS (x86_64)
- **Tên miền**: `caresenior.site` & `www.caresenior.site`
- **Mật khẩu SQL Server (sa)**: `CareSenior@2026!`
- **Mật khẩu tài khoản demo**: `CareSenior@2026!`

---

## 2. Quy trình thực hiện nhanh (5 Bước)

### Bước 1: Đăng nhập vào VPS bằng SSH
Mở PowerShell hoặc Command Prompt trên máy tính của bạn và gõ:
```bash
ssh root@103.211.207.179
```
*Nhập mật khẩu VPS do SuniHost cung cấp (khi gõ mật khẩu sẽ không hiện ký tự, cứ gõ đúng rồi Enter).*

---

### Bước 2: Cài đặt Docker & Git trên VPS
Chạy lệnh sau trên terminal VPS:
```bash
apt-get update && apt-get install -y git curl
curl -fsSL https://get.docker.com | sh
```

---

### Bước 3: Tải mã nguồn dự án về VPS
```bash
git clone -b LuanBrandCodeNew https://github.com/dacluan94066/HeThongChamSocNguoiCaoTuoi-Web.git app
cd app
```

---

### Bước 4: Khởi động các container và Khởi tạo CSDL
1. Khởi động 3 container (MSSQL, Node.js Backend, Nginx React Frontend):
```bash
docker compose up -d --build
```

2. Chạy lệnh tự động tạo database và nạp dữ liệu mẫu:
```bash
chmod +x setup_db.sh setup_ssl.sh
./setup_db.sh
```

*Lúc này bạn đã có thể mở trình duyệt truy cập: `http://caresenior.site`.*

---

### Bước 5: Kích hoạt chứng chỉ bảo mật SSL (HTTPS) miễn phí
Chạy lệnh sau:
```bash
./setup_ssl.sh
```

Xong! Giờ bạn truy cập vào `https://caresenior.site` sẽ có ổ khóa xanh bảo mật HTTPS an toàn.

---

## 3. Tài khoản đăng nhập hệ thống
- **Quản trị viên (Admin)**: `admin` / `CareSenior@2026!`
- **Người chăm sóc**: `caregiver01` / `CareSenior@2026!`
- **Người cao tuổi**: `nct.an` / `CareSenior@2026!`

---

## 4. Các lệnh quản lý hữu ích khi vận hành VPS
- Xem trạng thái các container:
  ```bash
  docker compose ps
  ```
- Xem nhật ký hoạt động (logs):
  ```bash
  docker compose logs -f backend
  docker compose logs -f frontend
  docker compose logs -f db
  ```
- Khởi động lại toàn bộ:
  ```bash
  docker compose restart
  ```
- Dừng toàn bộ hệ thống:
  ```bash
  docker compose down
  ```
- Cập nhật code mới nhất từ GitHub:
  ```bash
  git pull
  docker compose up -d --build
  ```


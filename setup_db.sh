#!/bin/bash
set -e

echo "=============================================="
echo "CareSenior - Khoi tao Database SQL Server"
echo "=============================================="

echo "[1/4] Dang kiem tra ket noi SQL Server..."
until docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'CareSenior@2026!' -C -Q "SELECT 1" > /dev/null 2>&1
do
    echo "  > SQL Server dang khoi dong, vui long cho 5 giay..."
    sleep 5
done
echo "  * SQL Server da san sang!"

echo "[2/4] Tao cau truc CSDL va phan quyen (QLSucKhoeNguoiCaoTuoi_FINAL.sql)..."
docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'CareSenior@2026!' -C -f 65001 -i /scripts/01_schema.sql
echo "  * Cau truc CSDL da tao thanh cong!"

echo "[3/4] Tao tai khoan demo bcrypt (admin, caregiver01, nct.an)..."
docker compose exec -T backend node seed_users.js
echo "  * Tai khoan demo da tao thanh cong!"

echo "[4/4] Nap du lieu mau day du (DU_LIEU_MAU_DAY_DU.sql)..."
docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'CareSenior@2026!' -C -f 65001 -i /scripts/03_data.sql
echo "  * Du lieu mau da nap thanh cong!"

echo "=============================================="
echo "HOAN TAT KHOI TAO CSDL CARESENIOR!"
echo "=============================================="

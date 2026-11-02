#!/bin/bash
set -e

echo "=============================================="
echo "CareSenior - Cai dat chung chi SSL Let's Encrypt"
echo "Ten mien: caresenior.site, www.caresenior.site"
echo "=============================================="

mkdir -p certbot/conf certbot/www

docker run -it --rm \
  -v $(pwd)/certbot/conf:/etc/letsencrypt \
  -v $(pwd)/certbot/www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d caresenior.site -d www.caresenior.site \
  --agree-tos --no-eff-email --register-unsafely-without-email

echo "Khoi dong lai frontend de kich hoat HTTPS..."
docker compose restart frontend

echo "=============================================="
echo "SSL da duoc kich hoat thanh cong!"
echo "Truy cap: https://caresenior.site"
echo "=============================================="

#!/bin/sh
if [ -f /etc/letsencrypt/live/caresenior.site/fullchain.pem ]; then
    echo "[NGINX] Found SSL certificate for caresenior.site. Activating HTTPS mode..."
    cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/conf.d/default.conf
else
    echo "[NGINX] No SSL certificate found. Starting in HTTP mode..."
    cp /etc/nginx/conf.d/nginx-http.conf /etc/nginx/conf.d/default.conf
fi
exec nginx -g "daemon off;"

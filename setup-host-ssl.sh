#!/bin/bash
set -e

echo "=== Настройка системного nginx + SSL для testsabc.top ==="

# 1. Установка nginx и certbot
echo "Устанавливаем nginx и certbot..."
apt update
apt install -y nginx certbot python3-certbot-nginx

# 2. Остановка nginx если запущен
systemctl stop nginx 2>/dev/null || true

# 3. Сборка фронтенда
echo "Собираем фронтенд..."
cd frontend
npm install
npm run build
cd ..

# 4. Копирование файлов фронтенда
echo "Копируем файлы фронтенда..."
mkdir -p /var/www/telegram-roulette
cp -r frontend/dist/* /var/www/telegram-roulette/
chown -R www-data:www-data /var/www/telegram-roulette

# 5. Создание временной HTTP конфигурации
echo "Создаем временную HTTP конфигурацию..."
cat > /etc/nginx/sites-available/telegram-roulette << 'EOF'
server {
    listen 80;
    server_name testsabc.top;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }
    
    location / {
        root /var/www/telegram-roulette;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# 6. Включение сайта
ln -sf /etc/nginx/sites-available/telegram-roulette /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 7. Проверка конфигурации nginx
nginx -t

# 8. Запуск nginx
systemctl start nginx
systemctl enable nginx

# 9. Создание директории для certbot
mkdir -p /var/www/certbot

# 10. Получение SSL сертификата
echo "Получаем SSL сертификат..."
certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email ukeukekeuke747@gmail.com \
    --agree-tos \
    --no-eff-email \
    -d testsabc.top

# 11. Обновление конфигурации на HTTPS
echo "Обновляем конфигурацию на HTTPS..."
cp nginx-host.conf /etc/nginx/sites-available/telegram-roulette

# 12. Перезапуск nginx с SSL
nginx -t
systemctl reload nginx

# 13. Запуск Docker контейнеров
echo "Запускаем Docker контейнеры..."
docker-compose up -d

echo "=== Настройка завершена! ==="
echo "Сайт доступен по адресу: https://testsabc.top"
echo "API работает через прокси: https://testsabc.top/api/"
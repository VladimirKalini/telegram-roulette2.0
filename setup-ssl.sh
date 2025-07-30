#!/bin/bash

# Скрипт для настройки SSL сертификатов
# Автоматически переключает между HTTP и HTTPS конфигурациями

# Загрузить переменные из .env файла
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | grep -v '^$' | xargs)
fi

echo "=== Настройка SSL для $DOMAIN_NAME ==="

# Шаг 1: Убедиться что используется HTTP-only конфигурация
echo "Шаг 1: Настройка HTTP-only конфигурации для получения сертификата..."
cp nginx-http-only.conf nginx.conf

# Шаг 2: Запустить контейнеры
echo "Шаг 2: Запуск контейнеров..."
docker-compose down
docker-compose up --build -d

# Шаг 3: Проверить доступность HTTP
echo "Шаг 3: Проверка доступности сайта по HTTP..."
sleep 5
if curl -f -s http://$DOMAIN_NAME > /dev/null; then
    echo "✓ Сайт доступен по HTTP"
else
    echo "✗ Сайт недоступен по HTTP. Проверьте логи: docker-compose logs nginx"
    exit 1
fi

# Шаг 4: Создать тестовый файл для проверки acme-challenge
echo "Шаг 4: Создание тестового файла для проверки acme-challenge..."
mkdir -p ./certbot/www/.well-known/acme-challenge/
echo "test-challenge-file" > ./certbot/www/.well-known/acme-challenge/test

# Проверить доступность challenge файла
if curl -f -s http://$DOMAIN_NAME/.well-known/acme-challenge/test | grep -q "test-challenge-file"; then
    echo "✓ ACME challenge путь работает корректно"
    rm ./certbot/www/.well-known/acme-challenge/test
else
    echo "✗ ACME challenge путь не работает"
    echo "Проверьте: curl http://$DOMAIN_NAME/.well-known/acme-challenge/test"
    echo "Продолжаем получение сертификата..."
fi

# Шаг 5: Получить SSL сертификат
echo "Шаг 5: Получение SSL сертификата..."
docker-compose run --rm certbot certonly --webroot --webroot-path=/var/www/certbot --email $SSL_EMAIL --agree-tos --no-eff-email -d $DOMAIN_NAME --force-renewal

# Проверить что сертификат получен
if [ -f "./certbot/conf/live/$DOMAIN_NAME/fullchain.pem" ]; then
    echo "✓ SSL сертификат успешно получен"
else
    echo "✗ Не удалось получить SSL сертификат"
    exit 1
fi

# Шаг 6: Переключить на HTTPS конфигурацию
echo "Шаг 6: Переключение на HTTPS конфигурацию..."
cp nginx-ssl.conf nginx.conf

# Шаг 7: Перезапустить nginx с SSL
echo "Шаг 7: Перезапуск nginx с SSL..."
docker-compose down
docker-compose up --build -d

# Шаг 8: Проверить HTTPS
echo "Шаг 8: Проверка HTTPS..."
sleep 5
if curl -f -s https://$DOMAIN_NAME > /dev/null; then
    echo "✓ Сайт доступен по HTTPS"
    echo "✓ SSL настройка завершена успешно!"
    echo ""
    echo "Ваш сайт: https://$DOMAIN_NAME"
    echo "API: https://$DOMAIN_NAME/api/store/gifts"
    echo "Манифест: https://$DOMAIN_NAME/tonconnect-manifest.json"
else
    echo "✗ Сайт недоступен по HTTPS"
    echo "Проверьте логи: docker-compose logs nginx"
    exit 1
fi
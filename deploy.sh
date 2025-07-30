#!/bin/bash

# Скрипт для быстрого деплоя изменений

echo "=== Деплой изменений на ВПС ==="

# Остановить контейнеры
echo "Остановка контейнеров..."
docker-compose down

# Пересборка с кешем
echo "Пересборка контейнеров..."
docker-compose build

# Запуск контейнеров
echo "Запуск контейнеров..."
docker-compose up -d

# Ожидание запуска
echo "Ожидание запуска сервисов..."
sleep 10

# Проверка статуса
echo "Статус контейнеров:"
docker-compose ps

# Проверка доступности
echo "Проверка доступности сайта..."
if curl -f -s https://v416113.hosted-by-vdsina.com > /dev/null; then
    echo "✅ Сайт доступен: https://v416113.hosted-by-vdsina.com"
else
    echo "❌ Сайт недоступен"
    echo "Логи nginx:"
    docker-compose logs --tail=20 nginx
fi

echo "=== Деплой завершен ==="
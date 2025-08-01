#!/bin/bash
set -e

echo "=== Пересборка фронтенда с исправленной конфигурацией ==="

# Переходим в папку фронтенда
cd frontend

# Очищаем кэш и зависимости
echo "Очищаем кэш..."
rm -rf node_modules/.vite
rm -rf dist

# Устанавливаем зависимости
echo "Устанавливаем зависимости..."
npm install

# Собираем проект с дополнительными опциями
echo "Собираем проект..."
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Копируем собранные файлы на сервер
echo "Копируем файлы на сервер..."
sudo rm -rf /var/www/telegram-roulette/*
sudo cp -r dist/* /var/www/telegram-roulette/
sudo chown -R www-data:www-data /var/www/telegram-roulette

echo "=== Фронтенд пересобран и обновлен! ==="
echo "Проверьте сайт: https://testsabc.top"
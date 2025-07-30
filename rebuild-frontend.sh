#!/bin/bash
set -e

echo "=== Пересборка фронтенда с исправленным TON Connect ==="

# Переходим в папку фронтенда
cd frontend

# Устанавливаем зависимости (на всякий случай)
echo "Устанавливаем зависимости..."
npm install

# Собираем проект
echo "Собираем проект..."
npm run build

# Копируем собранные файлы на сервер
echo "Копируем файлы на сервер..."
sudo rm -rf /var/www/telegram-roulette/*
sudo cp -r dist/* /var/www/telegram-roulette/
sudo chown -R www-data:www-data /var/www/telegram-roulette

echo "=== Фронтенд пересобран и обновлен! ==="
echo "Проверьте манифест: https://testsabc.top/tonconnect-manifest.json"
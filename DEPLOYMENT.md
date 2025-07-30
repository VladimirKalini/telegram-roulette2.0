# Инструкция по развертыванию на ВПС

## Подготовка файлов

Перед переносом на ВПС **ОБЯЗАТЕЛЬНО** отредактируйте файл `.env`:

```bash
# Замените your-email@example.com на ваш реальный email
nano .env
```

## Команды для развертывания на ВПС

### 1. Установка Docker (если не установлен)

```bash
# Обновить пакеты
sudo apt update

# Установить необходимые пакеты
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y

# Добавить официальный GPG ключ Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Добавить репозиторий Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Обновить пакеты снова
sudo apt update

# Установить Docker
sudo apt install docker-ce docker-ce-cli containerd.io -y

# Установить Docker Compose
sudo apt install docker-compose -y

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER

# Перезагрузить группы
newgrp docker
```

### 2. Остановка внешнего nginx (если установлен)

```bash
# Остановить nginx
sudo systemctl stop nginx
sudo systemctl disable nginx

# Удалить nginx
sudo apt remove nginx nginx-common nginx-full -y
sudo apt autoremove -y
```

### 3. Развертывание приложения

```bash
# Перейти в папку проекта
cd /var/www/telefram-roulette2.0

# Убедиться что email указан в .env
cat .env

# Остановить старые контейнеры
docker-compose down

# Запустить получение SSL сертификатов
./init-letsencrypt.sh
```

### 4. Проверка работы

```bash
# Проверить статус контейнеров
docker-compose ps

# Проверить логи
docker-compose logs nginx

# Проверить HTTP (должен редиректить на HTTPS)
curl -I http://v416113.hosted-by-vdsina.com

# Проверить HTTPS
curl -I https://v416113.hosted-by-vdsina.com

# Проверить API
curl https://v416113.hosted-by-vdsina.com/api/store/gifts

# Проверить манифест
curl https://v416113.hosted-by-vdsina.com/tonconnect-manifest.json
```

### 5. Настройка автоматического обновления сертификатов

```bash
# Добавить в crontab
crontab -e

# Добавить эту строку (обновление каждый месяц 1 числа в 2:30 ночи):
30 2 1 * * /var/www/telefram-roulette2.0/renew-cert.sh >> /var/log/letsencrypt-renew.log 2>&1
```

## Команды для отладки

```bash
# Посмотреть все контейнеры
docker-compose ps

# Посмотреть логи всех сервисов
docker-compose logs

# Посмотреть логи только nginx
docker-compose logs nginx

# Перезапустить все контейнеры
docker-compose restart

# Полностью пересобрать контейнеры
docker-compose down
docker-compose up --build -d

# Проверить сертификаты
ls -la ./certbot/conf/live/v416113.hosted-by-vdsina.com/

# Ручное обновление сертификатов
./renew-cert.sh
```

## Важные файлы

- `.env` - переменные окружения (ОБЯЗАТЕЛЬНО укажите реальный email)
- `init-letsencrypt.sh` - скрипт для первичного получения SSL сертификатов
- `renew-cert.sh` - скрипт для обновления сертификатов
- `docker-compose.yml` - конфигурация всех сервисов
- `nginx.conf` - конфигурация веб-сервера

## После успешного развертывания

Ваше приложение будет доступно по адресу: https://v416113.hosted-by-vdsina.com

TON Connect манифест: https://v416113.hosted-by-vdsina.com/tonconnect-manifest.json
#!/bin/bash

# Скрипт для обновления SSL сертификатов
# Добавьте этот скрипт в crontab для автоматического обновления

# Загрузить переменные из .env файла
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | grep -v '^$' | xargs)
fi

echo "### Renewing SSL certificate for $DOMAIN_NAME ..."
docker-compose run --rm certbot renew

if [ $? -eq 0 ]; then
    echo "### Certificate renewed successfully"
    echo "### Reloading nginx ..."
    docker-compose exec nginx nginx -s reload
    echo "### Certificate renewal completed successfully"
else
    echo "### Certificate renewal failed"
    exit 1
fi

# Логирование
echo "$(date): Certificate renewal completed for $DOMAIN_NAME" >> /var/log/letsencrypt-renew.log
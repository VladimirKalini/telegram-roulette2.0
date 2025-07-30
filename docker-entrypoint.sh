#!/bin/bash
set -e

# Заменяем переменные окружения в nginx.conf
envsubst '${DOMAIN_NAME}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Запускаем nginx
exec "$@"
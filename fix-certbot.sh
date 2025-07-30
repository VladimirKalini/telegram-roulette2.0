#!/bin/bash

echo "Fixing Certbot lock issues..."

# Stop all containers to clear any running certbot processes
docker-compose down

# Remove any stale certbot containers
docker container prune -f

# Remove certbot lock files if they exist
sudo rm -rf /var/lib/letsencrypt/.certbot.lock 2>/dev/null || true
sudo rm -rf /tmp/.certbot.lock 2>/dev/null || true

# Kill any running certbot processes
sudo pkill certbot 2>/dev/null || true

# Clean up any docker volumes that might have locks
docker volume prune -f

echo "Cleaned up certbot locks and processes"

# Start with HTTP-only configuration first
echo "Starting HTTP-only nginx for certificate challenge..."
docker-compose up -d nginx

# Wait for nginx to be ready
sleep 10

# Try to get certificate with explicit cleanup
echo "Attempting to get SSL certificate..."
docker run --rm \
    -v $(pwd)/certbot-data:/etc/letsencrypt \
    -v $(pwd)/nginx/html:/var/www/certbot \
    --network telegram-roulette20_default \
    certbot/certbot:latest \
    certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email ukeukekeuke747@gmail.com \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    --break-my-certs \
    -d testsabc.top

if [ $? -eq 0 ]; then
    echo "Certificate obtained successfully!"
    
    # Stop HTTP-only nginx
    docker-compose down
    
    # Switch to SSL configuration
    echo "Switching to SSL configuration..."
    cp nginx-ssl.conf nginx.conf
    
    # Start with SSL
    docker-compose up -d
    
    echo "Deployment complete with SSL!"
else
    echo "Certificate acquisition failed. Check domain DNS and firewall."
fi
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

# Ensure we have HTTP-only config
cp nginx.conf nginx.conf.backup 2>/dev/null || true
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name testsabc.top;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
            try_files $uri =404;
        }
        
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
        
        location /api/ {
            proxy_pass http://backend:3000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
EOF

# Start with HTTP-only configuration first
echo "Starting HTTP-only nginx for certificate challenge..."
docker-compose up -d nginx

# Wait for nginx to be ready and check status
sleep 10
docker-compose ps nginx
docker-compose logs nginx

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
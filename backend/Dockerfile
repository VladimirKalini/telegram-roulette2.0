# Используем официальный образ Node.js
FROM node:22-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем весь остальной код проекта
COPY . .

# Указываем команду для запуска приложения
CMD ["npx", "tsx", "src/app.ts"] 
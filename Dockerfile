FROM node:20-slim

# Instalar Chromium y dependencias necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Establecer variables de entorno para Puppeteer
# Esto le dice a Puppeteer que use el Chromium del sistema y que no intente descargar su propio Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DISABLE_LOCAL_SCRAPER=true


WORKDIR /app

# Copiar archivos de dependencias
COPY package.json ./

# Instalar dependencias usando npm (en Docker, npm es estándar y directo)
RUN npm install

# Copiar el código fuente
COPY . .

# Crear el volumen para la persistencia de la base de datos de SQLite
VOLUME /app/data
# Configurar el servidor para que lea/escriba la BD en la ruta persistida
ENV DB_PATH=/app/data/onpe_data.db

EXPOSE 3000

CMD ["node", "server.js"]

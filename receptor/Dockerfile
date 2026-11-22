FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 2345
VOLUME ["/data"]

# saudável = a porta DICOM está aceitando conexões
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const s=require('net').connect(process.env.DICOM_PORT||2345,'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]

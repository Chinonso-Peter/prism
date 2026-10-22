FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
USER app

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_FILE=/app/data/store.json

EXPOSE 3000

CMD ["node", "src/server.js"]

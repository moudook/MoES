FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public
COPY tests ./tests
COPY README.md ./

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]

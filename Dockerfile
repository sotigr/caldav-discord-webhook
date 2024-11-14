FROM node:22-slim

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY main.js .

CMD ["node", "main.js"]
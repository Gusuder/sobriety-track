FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=base /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=base /app/dist ./dist
EXPOSE 4000
USER node
CMD ["node", "dist/server.js"]

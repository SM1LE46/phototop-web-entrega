FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend ./

RUN mkdir -p uploads uploads/avatars uploads/posts

COPY --from=frontend-build /frontend/dist/frontend/browser /app/public

EXPOSE 3000

CMD ["npm", "start"]
FROM node:22-alpine AS build
WORKDIR /app
COPY apps/admin/package.json apps/admin/package-lock.json ./
RUN npm ci
COPY apps/admin/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_DRIVER_APP_URL=http://localhost:8081
ARG VITE_ADMIN_APP_URL=http://localhost:8082
ARG VITE_API_URL=/api
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_DRIVER_APP_URL=${VITE_DRIVER_APP_URL}
ENV VITE_ADMIN_APP_URL=${VITE_ADMIN_APP_URL}
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

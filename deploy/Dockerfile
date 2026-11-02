FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prisma.config.ts requires DATABASE_URL, but generating the client and building never connect to it
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build sh -c 'npx prisma generate && npm run build'

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /data/storage && chown -R node:node /data /app/.next
ENV STORAGE_DIR=/data/storage
EXPOSE 3000
# Starts as root only to fix ownership of the mounted disk, then runs the command as "node"
ENTRYPOINT ["sh", "/app/deploy/entrypoint.sh"]
# Web app by default; the worker service in docker-compose.yml overrides this with "npm run worker"
CMD ["npm", "run", "start"]

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    UPLOADS_DIR=/var/data/clinic \
    REQUIRE_HTTPS=true \
    TRUST_PROXY=true
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/shared/data ./src/shared/data
COPY --from=build /app/dist ./dist
RUN mkdir -p /var/data/clinic && chown -R node:node /var/data/clinic /app
USER node
EXPOSE 8787
CMD ["npm", "start"]

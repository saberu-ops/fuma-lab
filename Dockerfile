# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json source.config.ts next.config.mjs ./
RUN npm ci

FROM base AS builder
ARG SITE_URL=http://localhost:3000
ENV SITE_URL=${SITE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run verify && npm run build

FROM base AS runner
ARG SITE_URL=http://localhost:3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV SITE_URL=${SITE_URL}

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 3000

CMD ["node", "server.js"]

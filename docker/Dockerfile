# syntax=docker/dockerfile:1

# --- base -------------------------------------------------------------------
# Node plus installed dependencies. Split out so that changing source code does
# not re-run npm ci. Shared by every stage below that needs node.
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- dev --------------------------------------------------------------------
# Live-reload development server. Source is bind-mounted by compose rather than
# copied, so edits on the host land here immediately: `tsc --watch` rebuilds
# dist/ for the TypeScript page while Vite serves and hot-reloads both pages.
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- build ------------------------------------------------------------------
# Compiles ts/ to dist/. Deliberately does NOT run the test suite: tests belong
# in `npm test` locally and in CI, where the docker job already waits on the js
# and ts jobs. Keeping them out here makes `docker compose up --build` fast.
FROM base AS build
COPY tsconfig.json vite.config.ts index.html styles.css ./
COPY ts ./ts
COPY public ./public
RUN npm run build

# --- prod -------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i -E \
      -e 's|^error_log[[:space:]]+\S+[[:space:]]+notice;|error_log  /var/log/nginx/error.log warn;|' \
      -e 's|^worker_processes[[:space:]]+auto;|worker_processes  2;|' \
      /etc/nginx/nginx.conf \
 && grep -qE '^error_log[[:space:]]+\S+[[:space:]]+warn;' /etc/nginx/nginx.conf \
 && grep -qE '^worker_processes[[:space:]]+2;' /etc/nginx/nginx.conf \
 && nginx -t
WORKDIR /usr/share/nginx/html
# Vite emits the whole site -- index.html, hashed assets and everything from
# public/ -- so dist/ is the web root rather than one folder inside it.
COPY --from=build /app/dist ./
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://localhost/ || exit 1

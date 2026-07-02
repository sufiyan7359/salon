# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app

# `npm ci` against this exact package.json/package-lock.json has failed
# with a bare "npm error Invalid Version" on Render's build infrastructure
# (both their native static-site pipeline and a from-scratch Docker build) -
# but succeeds locally with npm 11.13.0 AND npm 11.18.0 against the same
# lockfile, so it isn't simply a version mismatch. Pin the npm version
# anyway (cheap, doesn't hurt) and, if it still fails, print npm's own
# debug log so the real error (not just the truncated summary) shows up in
# the build output.
RUN npm install -g npm@11.13.0

COPY package*.json ./
RUN npm ci --loglevel verbose || (cat /root/.npm/_logs/*-debug-0.log; exit 1)

COPY . .
RUN npm run build

# --- Production stage ---
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist/salon-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

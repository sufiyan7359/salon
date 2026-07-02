# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app

# Root cause found via the verbose npm log: package-lock.json was generated
# on macOS ARM64 and bakes in platform-specific optional-dependency
# resolutions (lmdb, rollup native binaries) for that platform. `npm ci`
# trusts the lockfile's exact resolution tree as-is, which is a known npm
# bug on cross-platform installs (npm/cli#4828) - it crashed comparing
# @lmdb/lmdb-darwin-arm64's version here, and separately (when optional
# deps were skipped entirely to work around that) failed at runtime unable
# to find @rollup/rollup-darwin-arm64, because that one actually IS needed
# for the *current* platform, just under a different platform-specific
# package name. `npm install` re-resolves optional platform packages
# against whatever platform it's actually running on instead of trusting
# the lockfile blindly, which is the documented fix for this class of bug.
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Production stage ---
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist/salon-frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

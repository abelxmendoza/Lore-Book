FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Google OAuth requires /api/legal/* — fail the image build if docs are missing.
RUN test -f legal/TERMS.md && test -f legal/PRIVACY.md
RUN npm run build
RUN test -f dist/legal/TERMS.md && test -f dist/legal/PRIVACY.md

# Run as the built-in non-root `node` user (the image provides uid/gid 1000).
# The app only reads from /app at runtime, so root-owned build artifacts are fine.
RUN chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "dist/bootstrap.js"]

FROM node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5

WORKDIR /workspace
ENV CI=true \
    NPM_CONFIG_STRICT_ALLOW_SCRIPTS=true

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm exec -- playwright install --with-deps chromium firefox webkit \
  && chmod -R 755 /ms-playwright

COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

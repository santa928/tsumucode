FROM issue261-fixed-source:45fc
ENV BASE_PATH=/
RUN npm run content:compile && npm run build:app \
    && test -d /workspace/node_modules && test ! -L /workspace/node_modules \
    && test ! -L /workspace/node_modules/.vite-temp \
    && mkdir -p /workspace/node_modules/.vite-temp \
    && test -d /workspace/node_modules/.vite-temp \
    && test ! -L /workspace/node_modules/.vite-temp \
    && test "$(readlink -f /workspace/node_modules/.vite-temp)" = /workspace/node_modules/.vite-temp

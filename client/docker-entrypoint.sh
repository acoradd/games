#!/bin/sh
set -e

cat > /usr/share/nginx/html/env.js << EOF
window.__env__ = {
  API_URL: "${API_URL:-localhost:2567}"
};
EOF

exec nginx -g 'daemon off;'

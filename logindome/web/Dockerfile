# Minimal container for the testforlogin static H5 server
# It serves ./public via server.js

FROM node:22-alpine

WORKDIR /app

# Copy only what we need
COPY public ./public
COPY server.js ./server.js

ENV NODE_ENV=production
# Many cloud platforms inject PORT; default to 3000 in container
ENV PORT=3000

EXPOSE 3000

# Run as non-root
USER node

CMD ["node", "server.js"]

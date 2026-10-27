# Image de production de toairport.fr, construite par Coolify sur le VPS à chaque push sur main.
# Un seul processus Node : server/server.mjs sert les pages et reçoit les réservations.
# Pas d'étape de construction : les pages du dépôt partent telles quelles.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Les dépendances d'abord (nodemailer seul en production) : couche réutilisée tant que le lock ne bouge pas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
# Le serveur refuse déjà ces chemins ; ils ne sont de toute façon pas dans l'image.
RUN rm -rf docs scripts README.md Dockerfile .dockerignore .env.example

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:3000/robots.txt || exit 1
CMD ["node", "server/server.mjs"]

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
USER node
ENV CONTROL_CENTER_BIND=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

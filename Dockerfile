# Builder step
FROM node:14.15.0 as builder
WORKDIR /build
COPY . .
RUN yarn install && \
  yarn prisma generate && \
  yarn run build

# Final image step
FROM node:14.15.0
COPY --from=builder /build/node_modules /app/node_modules
COPY --from=builder /build/dist /app/dist
COPY --from=builder /build/package.json /app/package.json
WORKDIR /app
ENV PORT=8080
EXPOSE $PORT
CMD ["yarn", "run:prod"]

FROM public.ecr.aws/docker/library/node:22-slim AS base

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml .npmrc ./

FROM base AS prod-deps

RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm install --frozen-lockfile --prod

FROM base AS builder

RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM public.ecr.aws/docker/library/node:22-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

CMD ["node", "build/index.js"]

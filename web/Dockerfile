FROM public.ecr.aws/docker/library/node:22-slim AS builder

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml .npmrc ./

RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM public.ecr.aws/docker/library/node:22-slim

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter

ENV PORT=8080
ENV AWS_LWA_INVOKE_MODE=response_stream

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

CMD ["node", "build/index.js"]

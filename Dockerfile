FROM node:12-slim

ENV LOG_LEVEL "debug"

RUN apt-get update && apt-get install -y git

RUN yarn global add graphql@^15.0.0
RUN yarn global add @graphql-tools/load@^7.5.1
RUN yarn global add @graphql-tools/graphql-file-loader@^7.3.3
RUN yarn global add @graphql-tools/git-loader@7.1.2
RUN yarn global add @graphql-inspector/core@3.0.2

RUN mkdir /app
WORKDIR /app

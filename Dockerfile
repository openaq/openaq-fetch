FROM node:10-alpine

RUN apk add python make g++
# Install NPM dependencies. Do this first so that if package.json hasn't
# changed we don't have to re-run npm install during `docker build`
COPY package.json /app/package.json
WORKDIR /app
RUN npm install

FROM node:10-alpine

WORKDIR /app
COPY --from=0 /app /app
# Copy the app
COPY ["index.js", ".eslintrc", ".eslintignore", ".babelrc", "knexfile.js", "/app/"]
COPY ["fetch.js", "/app/"]
COPY lib /app/lib/
COPY certs /app/certs/
COPY test /app/test/
COPY sources /app/sources/
COPY adapters /app/adapters/
COPY migrations /app/migrations/

CMD ["npm", "start"]
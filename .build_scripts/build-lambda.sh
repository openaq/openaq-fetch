./node_modules/.bin/babel ./adapters/ --no-babelrc --config-file ./.babelrc-lambda -d ./.dist/adapters/
./node_modules/.bin/babel ./lib/  --no-babelrc --config-file ./.babelrc-lambda -d ./.dist/lib/ --copy-files
./node_modules/.bin/babel ./fetch-lambda.js --no-babelrc --config-file ./.babelrc-lambda -d ./.dist/
cp ./package.json ./.dist/
cp -R ./sources ./.dist/
cp -R ./certs ./.dist/
cp ./knexfile.js ./.dist
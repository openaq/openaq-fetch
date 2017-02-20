#!/bin/bash
set -e

docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"

echo "Pushing image: developmentseed/openaq-fetch:$TRAVIS_COMMIT"
docker tag openaq_fetch flasher/openaq-fetch:$TRAVIS_COMMIT
docker push flasher/openaq-fetch:$TRAVIS_COMMIT

# Only push to latest if this is production branch
if [[ $TRAVIS_BRANCH == ${PRODUCTION_BRANCH} ]]; then
  echo "Also pushing as :latest"
  docker tag openaq_fetch flasher/openaq-fetch:latest
  docker push flasher/openaq-fetch:latest

  # And set some vars for the update_task script
  export ENV_FILE="production.env"
  export TASK_NAME="openaq-fetch"
fi

echo "Installing aws cli"
sudo pip install awscli

echo "Running the update_task script"
sh .build_scripts/update-task.sh

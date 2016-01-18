#!/bin/bash
set -e

docker login -e="$DOCKER_EMAIL" -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"

echo "Pushing image: developmentseed/openaq-fetch:$TRAVIS_COMMIT"
docker tag openaq_fetch flasher/openaq-fetch:$TRAVIS_COMMIT
docker push flasher/openaq-fetch:$TRAVIS_COMMIT
echo "Also pushing as :latest"
docker tag openaq_fetch flasher/openaq-fetch:latest
docker push flasher/openaq-fetch:latest

echo "Installing aws cli"
sudo pip install awscli

echo "Running the update_task script"
sh .build_scripts/update-task.sh

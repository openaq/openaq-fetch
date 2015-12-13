#!/bin/bash
set -e

# Generate the appropriate command to use local env vars or a named AWS profile
# passed like sh .build_scripts/update_task.sh openaq (to be used locally)
aws="aws"
if [ ! -z "$1" ]
    then
        aws="aws --profile $1"
fi

echo "Getting the revision of the old task"
# This should be updated to check for running revision, not necessarily latest revision
OLD_VERSION=$($aws ecs describe-task-definition --task-definition openaq-fetch | sed -n "/revision/p" | grep -o "[0-9]\+")
# Grab this so we're not trying to deploy latest, but rather the last good image
CURRENT_HASH=$($aws ecs describe-task-definition --task-definition openaq-fetch | grep -o "flasher/openaq-fetch:[a-zA-Z_0-9]\+")
export CURRENT_HASH=$CURRENT_HASH
echo "Current revision of ECS task is $OLD_VERSION"
echo "Current Docker image is $CURRENT_HASH"

echo "Stopping the current task revision"
$aws ecs update-service --service openaq-fetch --task-definition openaq-fetch --desired-count 0

echo "Waiting for current task to stop"
$aws ecs wait services-stable --services openaq-fetch

echo "Copying env variables from S3"
$aws s3 cp s3://openaq-env-variables/openaq-fetch/production.env local.env

echo "Building new ECS task"
node .build_scripts/insert-env.js
$aws ecs register-task-definition --cli-input-json file://ecs-task-generated.json

echo "Deploying 1 new ECS task "
$aws ecs update-service --service openaq-fetch --task-definition openaq-fetch --desired-count 1

echo "Waiting for new task to be scaled up"
$aws ecs wait services-stable --services openaq-fetch

#!/bin/bash
set -e

# Generate the appropriate command to use local env vars or a named AWS profile
# passed like sh .build_scripts/update_task.sh openaq (to be used locally)
aws="aws"
if [ ! -z "$1" ]
    then
        aws="aws --profile $1"
fi

# Use defaults if not set elsewhere
[ -z "$ECS_CLUSTER" ] && { ECS_CLUSTER="default"; }

echo "Starting AWS ECS deploy for cluster $ECS_CLUSTER."
# This should be updated to check for running revision, not necessarily latest revision
RUNNING_SERVICE=$($aws ecs describe-services --services openaq-fetch --cluster $ECS_CLUSTER | jq '.services[0].taskDefinition' | grep -o "openaq-fetch:[0-9]\+")
# Grab this so we're not trying to deploy latest, but rather the last good image
# Grab the hash for the running service in case we don't have a new commit hash
# to use later.
CURRENT_HASH=$($aws ecs describe-task-definition --task-definition $RUNNING_SERVICE | jq '.taskDefinition.containerDefinitions[0].image' | tr -d '"')
export CURRENT_HASH=$CURRENT_HASH
echo "Current revision of ECS task is $RUNNING_SERVICE"
echo "Current Docker image is $CURRENT_HASH"

echo "Stopping the current task revision"
$aws ecs update-service --service openaq-fetch --cluster $ECS_CLUSTER --task-definition openaq-fetch --desired-count 0

echo "Waiting for current task to stop"
$aws ecs wait services-stable --services openaq-fetch --cluster $ECS_CLUSTER

echo "Copying env variables from S3"
$aws s3 cp s3://openaq-env-variables/openaq-fetch/production.env local.env

echo "Building new ECS task"
node .build_scripts/insert-env.js
$aws ecs register-task-definition --cli-input-json file://ecs-task-generated.json

echo "Deploying 1 new ECS task "
$aws ecs update-service --service openaq-fetch --cluster $ECS_CLUSTER --task-definition openaq-fetch --desired-count 1

echo "Waiting for new task to be scaled up"
$aws ecs wait services-stable --services openaq-fetch --cluster $ECS_CLUSTER

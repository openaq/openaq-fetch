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
[ -z "$ENV_FILE" ] && { ENV_FILE="staging.env"; }
[ -z "$TASK_NAME" ] && { TASK_NAME="openaq-fetch-staging"; }

echo "Updating task definition for $TASK_NAME."
# Grab the hash for the running service in case we don't have a new commit hash
# in case of a local update.
CURRENT_HASH=$($aws ecs describe-task-definition --task-definition $TASK_NAME | jq '.taskDefinition.containerDefinitions[0].image' | tr -d '"')
export CURRENT_HASH=$CURRENT_HASH
echo "Current Docker image is $CURRENT_HASH"

echo "Copying env variables from S3"
$aws s3 cp s3://openaq-env-variables/openaq-fetch/$ENV_FILE local.env

echo "Building new ECS task"
node .build_scripts/insert-env.js
$aws ecs register-task-definition --cli-input-json file://ecs-task-generated.json

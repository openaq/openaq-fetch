#!/bin/bash
set -e

if [ -f $HOME/docker/openaq_fetch.tar ]
then
  echo "Loading cached worker image"
  docker load < $HOME/docker/openaq_fetch.tar
fi

touch local.env
docker-compose --project openaq build

mkdir -p $HOME/docker
echo "Caching openaq_fetch docker image."
docker save openaq_fetch > $HOME/docker/openaq_fetch.tar

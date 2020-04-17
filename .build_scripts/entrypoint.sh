#!/bin/bash
set -e

# Entrypoint for docker container, basically works as a stand-in for
# bashrc stuff, setting up the env and then executes whatever command is passed
# to it

# Source the nvm script so we have access to npm and node
source $NVM_DIR/nvm.sh
# NOTE: use exec to make sure that npm receives SIGTERM, etc.
exec "$@"

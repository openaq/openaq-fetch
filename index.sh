# !/usr/bin/env bash
# This script intends to run the main fetch data process with timeout to kill the process in case it gets stuck.
echo "Start main fetch process"
timeout 20m npm start

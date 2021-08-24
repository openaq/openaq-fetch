# !/usr/bin/env bash
# This script intends to run the main fetch data process and other processes sequentially.
# The script also has a timeout to kill the process in case it gets stuck.
echo "Start main fetch process"
timeout 5m npm start

echo "Start ccmaq - indian adapter"
timeout 20m node index.js --source="caaqm"

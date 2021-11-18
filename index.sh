# !/usr/bin/env bash
set -ex
# # This script intends to run the main fetch data process with timeout to kill the process in case it gets stuck.
time timeout 10m npm start

# The follow adapters are currently disabled, in sources/ , 
# but actually we are requesting data. We disable because 
# those adapter request huge amount of data, that sometimes made failing the fetch process
time timeout 5m node index.js --source="ARPALAZIO"

 
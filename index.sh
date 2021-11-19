# !/usr/bin/env bash
set -x
# # This script intends to run the main fetch data process with timeout to kill the process in case it gets stuck.
time timeout 30m npm start

# The follow adapters are currently disabled, in "sources/", but actually we are requesting data. We disable because 
# those adapter request huge amount of data, that sometimes made failing the fetch process

# ARPALAZIO adapter requests ~7.5k items 
time timeout 3m node index.js --source="ARPALAZIO"

# # 'London Air Quality Network' adapter requests ~4k items
# time timeout 3m node index.js --source= "London Air Quality Network"

# caaqm adapter requests ~1.5k items 
time timeout 3m node index.js --source="caaqm"

# GIOS adapter requests ~2k items 
time timeout 3m node index.js --source="GIOS"

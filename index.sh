# !/usr/bin/env bash
set -x

###############################################################################
#### Main fetchinf data process
###############################################################################

time timeout 30m npm start

###############################################################################
#### Adapters that consume lot memory and need to be run one by one
#### The follow adapters are currently disabled, in "sources/", but actually we are requesting data. We disable because 
#### those adapter request huge amount of data, that sometimes made failing the fetch process and we are running them one by one.
###############################################################################

# ARPALAZIO adapter requests ~7.5k items
time timeout 3m node index.js --source="ARPALAZIO"

# 'London Air Quality Network' adapter requests ~7.8k items
time timeout 3m node index.js --source="London Air Quality Network"

# GIOS adapter requests ~2k items
time timeout 3m node index.js --source="GIOS"

###############################################################################
#### Adapters that are running in fargate
#### Reasons: 
#### - Because the site response very slow, took more that 5 minutes to complete the fetch process
###############################################################################
# caaqm adapter requests ~1.5k items
# time timeout 3m node index.js --source="caaqm"

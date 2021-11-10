# !/usr/bin/env bash
# Script to fetch data adapter  by adapter
adapters=adapters.list
adapters_lastUpdated=adapters_lastUpdated.csv
rm $adapters
# List active adapters
for file in ./sources/*.json; do
    jq '.[] | select(.active == true ).name' $file | sed -r 's/^"|"$//g' >>$adapters
done

# Get last update for adapters
echo "adapter, lastUpdated, url" >$adapters_lastUpdated
while read adapter; do
    url="https://u50g7n0cbj.execute-api.us-east-1.amazonaws.com/v2/sources?sourceName=$adapter"
    echo $url
    lastUpdated=$(curl -s "$url" | jq '[.results[]][0].lastUpdated')
    echo \"$adapter\",$lastUpdated,\"$url\" >>$adapters_lastUpdated
done <$adapters

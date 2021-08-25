# !/usr/bin/env bash
# Script to fetch data adapter  by adapter
adapters=adapters.list
for file in ./sources/*.json; do
    jq '.[] | select(.active == true ).name' $file | sed -r 's/^"|"$//g' >>$adapters
done

while read adapter; do
    echo "================================> $adapter <================================"
    node index.js --source "$adapter" -b
done <$adapters

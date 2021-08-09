# !/usr/bin/env bash
PROCESS_TIMEOUT=180
adapters=exec.adapters.list
rm $adapters
for file in ./sources/*.json; do
    jq '.[] | select(.active == true ).name' $file | sed -r 's/^"|"$//g' >>$adapters
done

while read adapter; do
    echo "================================> $adapter <================================"
    node index.js --source "$adapter" &
    sleep $PROCESS_TIMEOUT
    kill "$!"
done <$adapters

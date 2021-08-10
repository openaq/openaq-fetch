# !/usr/bin/env bash
PROCESS_TIMEOUT_=2m
adapters=adapters.list
rm $adapters
for file in ./sources/*.json; do
    jq '.[] | select(.active == true ).name' $file | sed -r 's/^"|"$//g' >>$adapters
done

while read adapter; do
    echo "================================> $adapter <================================"
    node index.js --source "$adapter" -vb &
    sleep ${PROCESS_TIMEOUT_}
    kill "$!"
done <$adapters

#!/bin/bash
DEPCHECK_RESULT=$(echo "$1" | tr -d '\n')
MISSING=$(echo "$DEPCHECK_RESULT" | jq '.missing')
MISSING_LENGTH=$(echo "$MISSING" | jq 'length')
DEPENDENCIES=$(echo "$DEPCHECK_RESULT" | jq '.dependencies')
DEPENDENCIES_LENGTH=$(echo "$DEPENDENCIES" | jq 'length')
DEV_DEPENDENCIES=$(echo "$DEPCHECK_RESULT" | jq '.devDependencies')
DEV_DEPENDENCIES_LENGTH=$(echo "$DEV_DEPENDENCIES" | jq 'length')
comment=""
if [ "$MISSING_LENGTH" -gt 0 ]; then
    comment+="The following packages are missing:\n"
    for key in $(echo "$MISSING" | jq 'keys[]'); do
        package=$(echo "$key" | jq -r)
        needed_by=$(echo "$MISSING" | jq -r ".[$package] | join(\", \")")
        comment+="$package is needed by $needed_by\n"
        done
    comment+="\n"
fi
if [ "$DEPENDENCIES_LENGTH" -gt 0 ] || [ "$DEV_DEPENDENCIES_LENGTH" -gt 0 ]; then
    total_unused=$((DEPENDENCIES_LENGTH + DEV_DEPENDENCIES_LENGTH))
    comment+="There are $total_unused unused packages:\n"
if [ "$DEPENDENCIES_LENGTH" -gt 0 ]; then
    comment+="Unused dependencies:\n"
    comment+=$(echo "$DEPENDENCIES" | jq -r 'join(", ")')
    comment+="\n"
fi
if [ "$DEV_DEPENDENCIES_LENGTH" -gt 0 ]; then
    comment+="Unused devDependencies:\n"
    comment+=$(echo "$DEV_DEPENDENCIES" | jq -r 'join(", ")')
fi
fi
echo -n "$comment"
#!/bin/bash

DEPCHECK_RESULT="$1"

MISSING=$(echo "$DEPCHECK_RESULT" | jq '.missing')
MISSING_LENGTH=$(echo "$MISSING" | jq 'length')

DEPENDENCIES=$(echo "$DEPCHECK_RESULT" | jq '.dependencies')
DEPENDENCIES_LENGTH=$(echo "$DEPENDENCIES" | jq 'length')

DEV_DEPENDENCIES=$(echo "$DEPCHECK_RESULT" | jq '.devDependencies')
DEV_DEPENDENCIES_LENGTH=$(echo "$DEV_DEPENDENCIES" | jq 'length')

comment=""

if [ $MISSING_LENGTH -gt 0 ]; then
  comment+="<br/>⛔⛔⛔⛔⛔⛔<br/>The following packages are missing:<br/>"
  for key in $(echo "$MISSING" | jq 'keys[]'); do
    package=$(echo "$key" | jq -r)
    needed_by=$(echo "$MISSING" | jq -r ".[$key] | join(\", \")")
    comment+="- $package is needed by $needed_by<br/>"
  done
  comment+="<br/>"
fi

if [ $DEPENDENCIES_LENGTH -gt 0 ] || [ $DEV_DEPENDENCIES_LENGTH -gt 0 ]; then
  total_unused=$((DEPENDENCIES_LENGTH + DEV_DEPENDENCIES_LENGTH))
  comment+="There are $total_unused unused packages:<br/>"

  if [ $DEPENDENCIES_LENGTH -gt 0 ]; then
    comment+="<br/>⚠⚠⚠⚠⚠⚠⚠⚠⚠<br/>Unused dependencies:<br/> - "
    comment+=$(echo "$DEPENDENCIES" | jq -r 'join("<br/> - ")')
    comment+="<br/>"
  fi

  if [ $DEV_DEPENDENCIES_LENGTH -gt 0 ]; then
    comment+="<br/>⚠⚠⚠⚠⚠⚠⚠⚠⚠<br/>Unused devDependencies:<br/> - "
    comment+=$(echo "$DEV_DEPENDENCIES" | jq -r 'join("<br/> - ")')
  fi
fi

echo -n "$comment"

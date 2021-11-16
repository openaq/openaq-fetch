# Adapters evaluations

## Last updates evaluations

This script checks the API  in order to get the latest updates for the adapters, this will help to check which adapters have been still working correctly in which adapters may need updates to the node.js code. 

```sh
    pip install -r requirements.txt
    cd evaluation/
    # rm ./../sources/intl.json
    python last_updates.py
```

Output: The script will generates a file `data/adapters_locations_last_updates.csv` which can be used to the the evaluations.

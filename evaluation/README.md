# Adapters evaluations

## Last updates evaluations

This script checks the API in order to get the latest updates for the adapters, this will help to check which adapters have been still working correctly in which adapters may need updates to the node.js code.

- Select location id

```sql
    SELECT sensor_nodes_id,site_name,source_name,city FROM sensor_nodes WHERE ismobile=False and source_name !='PurpleAir';
```

The result save at `data/adapters_id.csv`

- Get last updates

```sh
    pip install -r requirements.txt
    cd evaluation/
    # rm ./../sources/intl.json
    python last_updates.py
    # python last_updates.py --source="Australia - Queensland"
```

Output: The script will generates two files `data/adapters_update.csv` and `data/adapters_outdate.csv` which can be used to the the evaluations.

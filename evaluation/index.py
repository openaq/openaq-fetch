"""Script to check last updates for adpaters
"""

import glob
import json
import pandas as pd
import requests
from joblib import Parallel, delayed
from tqdm import tqdm


def load_adapters(sources):
    adapters = []
    for jsonFile in glob.glob(f"{sources}/*.json"):
        with open(jsonFile) as json_file:
            adapters_data = json.load(json_file)
            # adapters_data = [d for d in adapters_data if d['active']]
        adapters = adapters_data + adapters
    return adapters


def fetch_data(adapter, sensor_nodes_id):
    url = f"https://u50g7n0cbj.execute-api.us-east-1.amazonaws.com/v2/measurements?location={sensor_nodes_id}"
    adapter_copy = adapter.copy()
    try:
        r = requests.get(url, timeout=20)
        data = r.json()
        if len(data["results"]) > 0:
            item = data["results"][0]
            adapter_copy.update(
                {
                    "locationId": item["locationId"],
                    "location": item["location"],
                    "last_update": item["date"]["utc"].split("T")[0],
                }
            )
    except requests.exceptions.HTTPError as e:
        print(e.response.text)
    return adapter_copy


def get_location_updates(adapter, df):
    df_adapter = df.loc[df["source_name"] == adapter["name"]]
    # Serial
    # results = []
    # for _, row in df_adapter.iterrows():
    #     adapter = fetch_data(adapter, row['sensor_nodes_id'])
    #     results.append(adapter)
    # Parallel
    adapter_name = adapter["name"]
    results = Parallel(n_jobs=-1)(
        delayed(fetch_data)(adapter, row["sensor_nodes_id"])
        for _, row in tqdm(
            df_adapter.iterrows(),
            desc=f"Fetching data for {adapter_name}...",
            total=df_adapter.shape[0],
        )
    )
    return results


def main():
    source_folder = "./../sources"
    adpters_ids_file = "adapters_id.csv"
    df = pd.read_csv(adpters_ids_file)
    adapters = load_adapters(source_folder)
    keys = [
        "adapter",
        "name",
        "country",
        "sourceURL",
        "active",
        "locationId",
        "location",
        "last_update",
    ]

    with open("adapters_locations_last_updates.csv", "w") as f:
        f.writelines(f'{",".join(keys)}\n')
        for adapter in adapters:
            adapter_locations_lu = get_location_updates(adapter, df)
            for adapter_lu in adapter_locations_lu:
                adapter_simple = dict((k, adapter_lu[k]) for k in adapter_lu.keys() if k in keys)
                vals = ",".join(map(str, adapter_simple.values()))
                f.writelines(f"{vals}\n")


if __name__ == "__main__":
    main()

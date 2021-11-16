"""Script to check last updates for adpaters
"""

import glob
import json
import pandas as pd
import requests
from joblib import Parallel, delayed
from tqdm import tqdm

API_URL = "https://u50g7n0cbj.execute-api.us-east-1.amazonaws.com/v2/measurements?location={id}"
SOURCE_FOLDER = "./../sources"
ADPTERS_IDS_FILE = "data/adapters_id.csv"
ADPTERS_LOCATION_LAST_UPDATES = "data/adapters_locations_last_updates.csv"


def load_adapters(sources):
    """Load data from json files in ../source folder

    Args:
        sources (str): Path to the source json files

    Returns:
        [dict]: Dictionary of all adapters dat
    """
    adapters = []
    for jsonFile in glob.glob(f"{sources}/*.json"):
        with open(jsonFile) as json_file:
            adapters_data = json.load(json_file)
            # adapters_data = [d for d in adapters_data if d['active']]
        adapters = adapters_data + adapters
    return adapters


def fetch_data(adapter, sensor_nodes_id):
    """Fetch data from API

    Args:
        adapter (dict): Adapter data
        sensor_nodes_id (int): Adapter id in the API

    Returns:
        [dict]: Returns datapter data + last updates data
    """
    url = API_URL.format(id=sensor_nodes_id)
    adapter_copy = adapter.copy()
    try:
        r = requests.get(url, timeout=20)
        data = r.json()
        if r.status_code == 200 and 'results' in data.keys() and len(data["results"]) > 0:
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
    """Parrallel function to make request to the API

    Args:
        adapter (dict): Adapter data
        df ([df]): Dataframe of adapters id

    Returns:
        [list]: List of dictinary of adapters with the last update
    """
    df_adapter = df.loc[df["source_name"] == adapter["name"]]
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
    df = pd.read_csv(ADPTERS_IDS_FILE)
    adapters = load_adapters(SOURCE_FOLDER)
    # pd.DataFrame.from_dict(adapters).to_csv("adapters.csv", columns=["name"], index=False)
    keys = [
        "adapter",
        "name",
        "country",
        "url",
        "active",
        "locationId",
        "location",
        "last_update",
    ]

    with open(ADPTERS_LOCATION_LAST_UPDATES, "w") as f:
        f.writelines(f'{"|".join(keys)}\n')
        for adapter in adapters:
            adapter_locations_lu = get_location_updates(adapter, df)
            for adapter_lu in adapter_locations_lu:
                adapter_simple = dict(
                    (k, adapter_lu[k]) for k in adapter_lu.keys() if k in keys)
                vals = "|".join(map(str, adapter_simple.values()))
                f.writelines(f"{vals}\n")


if __name__ == "__main__":
    main()

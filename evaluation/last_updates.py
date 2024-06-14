"""Script to check last updates for adpaters
    python last_updates.py \
        --source="Australia - Queensland"
"""
import os
import glob
import json
import pandas as pd
import requests
from joblib import Parallel, delayed
from tqdm import tqdm
import click
import datetime
import numpy as np

API_URL = "https://u50g7n0cbj.execute-api.us-east-1.amazonaws.com/v2/measurements?location={id}"
DAYS_AGO = 15

# Adapter that's the api are gone
reviewed_adapters = ["Bosnia2", "Andalucia", "Kosovo", "Chile - SINCA", "Umhverfisstofnun"]


def load_adapters(sources):
    """Load data from json files in ../source folder

    Args:
        sources (str): Path to the source json files

    Returns:
        [dict]: Dictionary of all adapters data
    """
    adapters = []
    for jsonFile in glob.glob(f"{sources}/*.json"):
        with open(jsonFile) as json_file:
            adapters_data = json.load(json_file)
            adapters_data = [d for d in adapters_data if d["active"]]
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
    val = {"locationId": "", "location": "", "last_update": ""}
    try:
        r = requests.get(url, timeout=20)
        data = r.json()
        if r.status_code == 200 and "results" in data.keys() and len(data["results"]) > 0:
            item = data["results"][0]

            val["locationId"] = item["locationId"]
            val["location"] = item["location"]
            val["last_update"] = item["date"]["utc"].split("T")[0]

    except requests.exceptions.HTTPError as e:
        print(f"Error requesing {url} . {e.response.text}")
    adapter_copy.update(val)
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


def apply_rules(adapter_locations_lu):
    df = pd.DataFrame.from_dict(adapter_locations_lu)

    # Get data from last 10 days ago
    ten_days_ago = datetime.datetime.now() - datetime.timedelta(days=DAYS_AGO)
    date_limit = ten_days_ago.strftime("%Y-%m-%d")

    df_update = df[(df["last_update"] >= date_limit)]
    df_outdate = df[(df["last_update"] < date_limit)]

    # Check if location has more than one location id and different updates, remove the out date locations
    cond = df_outdate["location"].isin(df_update["location"])
    df_outdate.drop(df_outdate[cond].index, inplace=True)

    return df_outdate, df_update


def save_csv_file(csv_path, df):
    keys = ["name", "last_update", "location", "url", "active", "locationId"]
    if os.path.exists(csv_path):
        df.to_csv(csv_path, mode="a", header=False, columns=keys, index=False)
    else:
        df.to_csv(csv_path, columns=keys, index=False)


def reduce_repeated_values(outdate_file, update_file):
    df_outdate = pd.read_csv(outdate_file)
    df_update = pd.read_csv(update_file)
    updated_adapters = np.unique(df_update["name"].to_numpy())
    updated_adapters = [*updated_adapters, *reviewed_adapters]
    df_outdate_new = df_outdate[~df_outdate.name.isin(updated_adapters)]
    df_outdate_new.to_csv(outdate_file, index=False)


@click.command(short_help="Script to get last updates for adapters")
@click.option("--source_folder", help="Source folder for josn files", default="./../sources")
@click.option(
    "--adpters_ids_file",
    help="A csv files that was exported from the DB, contains the location id for each adapter.",
    default="data/adapters_id.csv",
)
@click.option(
    "--outdate_file",
    help="CSV path for outdate adapters",
    default="data/adapters_outdate.csv",
)
@click.option(
    "--update_file",
    help="CSV path for update adapters",
    default="data/adapters_update.csv",
)
@click.option(
    "--source", help="Use this option to get last update for a particular adapter", default=None
)
@click.option(
    "--source", help="Use this option to get last update for a particular adapter", default=None
)
@click.option("--no_consider", help="List of adapters to do not consider", default="[]")
def main(source_folder, adpters_ids_file, outdate_file, update_file, source, no_consider):
    df = pd.read_csv(adpters_ids_file)
    adapters = load_adapters(source_folder)
    no_consider = json.loads(no_consider)
    if source is not None:
        adapters = [a for a in adapters if a["name"] == source]
    for adapter in adapters:
        if adapter['name'] not in no_consider:
            adapter_locations_lu = get_location_updates(adapter, df)
            if len(adapter_locations_lu) > 0:
                df_outdate, df_update = apply_rules(adapter_locations_lu)
                save_csv_file(outdate_file, df_outdate)
                save_csv_file(update_file, df_update)
    reduce_repeated_values(outdate_file, update_file)


if __name__ == "__main__":
    main()

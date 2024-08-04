# OpenAQ Data Ingest Pipeline

[![Build Status](https://travis-ci.org/openaq/openaq-fetch.svg?branch=master)](https://travis-ci.org/openaq/openaq-fetch)

## Overview

This is the main data ingest pipeline for the [OpenAQ](https://openaq.org) project.

Starting with `index.js`, there is an ingest mechanism to gather global air quality measurements from a variety of sources. This is currently run every 10 minutes and saves all unique measurements to a database.

[openaq-api-v2](https://github.com/openaq/openaq-api-v2) powers the API, and more information on the data format can be found in [openaq-data-format](https://github.com/openaq/openaq-data-format).

For more info, see the [OpenAQ-Fetch documentation index](docs/index.md).

## Installing & Running

To run the API locally, you will need [Node.js](https://nodejs.org) installed.

Install necessary Node.js packages by running

`npm install`

Now you can get started with:

`node index.js --help`

For production deployment, you will need to have certain environment variables set as in the table below:
| Name | Description | Default |
|---|---|---|
| API_URL | URL of openaq-api | http://localhost:3004/v1/webhooks |
| WEBHOOK_KEY | Secret key to interact with openaq-api | '123' |
| EEA_TOKEN | API token for EEA API | not set |
| DATA_GOV_IN_TOKEN | API token for data.gov.in | not set |
| EPA_VICTORIA_TOKEN | API token for portal.api.epa.vic.gov.au | not set |
| EEA_GLOBAL_TIMEOUT | How long to check for EEA async results before quitting in seconds | 360 |
| EEA_ASYNC_RECHECK | How long to wait to recheck for EEA async results in seconds | 60 |
| SAVE_TO_S3 | Does the process save the measurements to an AWS S3 Bucket | not set |

For full list of environment variables and process arguments, see [environment documentation](docs/env.md).

### Pushing to AWS S3

If you want to push results to an S3 bucket as well for further processing, the environment variable `SAVE_TO_S3` should be set to the value `true`. Additionally, you have to set the following environment variables (or be running in a process with a suitable IAM role):

| Name | Description | Default |
|---|---|---|
| AWS_BUCKET_NAME | AWS Bucket to store the results | not set |
| AWS_ACCESS_KEY_ID | AWS Credentials key ID | not set |
| AWS_SECRET_ACCESS_KEY | AWS Credentials secret key | not set |

The measurements will be stored using the structure `bucket_name/fetches/yyyy-mm-dd/unixtime.ndjson` for each fetch.

## Tests

To confirm that everything is working as expected, you can run the tests with

`npm test`

To test an individual adapter, you can use something like:

`node index.js --dryrun --source 'Beijing US Embassy'`

For a more detailed description of the command line options available, use: `node index.js --help`

## Deployment
Deployment is is being built from the lambda-deployment branch. Any development for openaq-fetch should be branched/merged from/to the lambda-deployment branch until further notice.

Deployments rely on a json object that contains the different deployments. The schedular is then used to loop through that object and post a message that will trigger a lambda to run that deployment. A deployment consists of a set of arguments that are passed to the fetch script to limit the sources that are run.

You can test the deployments with the following

Show all deployments but dont submit and dont run the fetcher
`
node index.js --dryrun --deployments all --nofetch
`
Only the japan deployment but dont run the fetcher
`
node index.js --dryrun --deployments japan --nofetch
`

Only the japan deployment, dont submit a file but run the fetcher
`
node index.js --dryrun --deployments japan
`


## Data Source Criteria

This section lists the key criteria for air quality data aggregated onto the platform. A full explanation can be accessed
[here](https://medium.com/@openaq/where-does-openaq-data-come-from-a5cf9f3a5c85#.919hlx2by). OpenAQ is an ever-evolving process that is shaped by its community: your
feedback and questions are actively invited on the criteria listed inthis section.

1. Data must be of one of these pollutant types: PM10, PM2.5, sulfur dioxide (SO2), carbon monoxide (CO), nitrogen dioxide (NO2), ozone (O3), and black carbon (BC).

2. Data must be from an official-level outdoor air quality source, as defined as data produced by a government entity or international organization. We do not, at this stage, include data from low-cost, temporary, and/or indoor sensors.

3. Data must be ‘raw’ and reported in physical concentrations on their originating site. Data cannot be shared in an 'Air Quality Index' or equivalent (e.g. AQI, PSI, API) format.

4. Data must be at the ‘station-level,’ associable with geographic coordinates, not aggregated into a higher (e.g. city) level.

5. Data must be from measurements averaged between 10 minutes and 24 hours.


## Contributing
There are many ways to contribute to this project, more details can be found in the [contributing guide](CONTRIBUTING.md).

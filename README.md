# OpenAQ Data Ingest Pipeline
[![Build Status](https://travis-ci.org/openaq/openaq-fetch.svg?branch=master)](https://travis-ci.org/openaq/openaq-fetch)

## Overview
This is the main data ingest pipeline for the [OpenAQ](https://openaq.org) project.

Starting with `index.js`, there is an ingest mechanism to gather global air quality measurements from a variety of sources. This is currently run every 10 minutes and saves all unique measurements to a database.

[openaq-api](https://github.com/openaq/openaq-api) powers the API and more information on the data format can be found in [openaq-data-format](https://github.com/openaq/openaq-data-format).

## Installing & Running
To run the API locally, you will need both [Node.js](https://nodejs.org) and [PostgreSQL](http://www.postgresql.org/) installed.

Install necessary Node.js packages by running

`npm install`

Make sure you have a PostgreSQL database available (with PostGIS extension) and have the DB settings in `knexfile.js`.

Now you can get started with:

`node index.js --help`

For production deployment, you will need to have certain environment variables set as in the table below

| Name | Description | Default |
|---|---|---|
| SENDGRID_PASSWORD | Email service password | not set |
| SENDGRID_USERNAME | Email service username | not set |
| API_URL | URL of openaq-api | http://localhost:3004/v1/webhooks |
| WEBHOOK_KEY | Secret key to interact with openaq-api | '123' |
| AIRNOW_FTP_USER | User for AirNow FTP | not set |
| AIRNOW_FTP_PASSWORD | Password for AirNow FTP | not set |
| EEA_TOKEN | API token for EEA API | not set |
| DATA_GOV_IN_TOKEN | API token for data.gov.in | not set |
| EEA_GLOBAL_TIMEOUT | How long to check for EEA async results before quitting in seconds | 360 |
| EEA_ASYNC_RECHECK | How long to wait to recheck for EEA async results in seconds | 60 |
| SAVE_TO_S3 | Does the process save the measurements to an AWS S3 Bucket | not set |

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
Deployment is handled automatically via Travis on the `master` branch and is deployed to Amazon's ECS.

## Data Source Criteria

This section lists the key criteria for air quality data aggregated
onto the platform. A full explanation can be accessed
[here](https://medium.com/@openaq/where-does-openaq-data-come-from-a5cf9f3a5c85#.919hlx2by). OpenAQ
is an ever-evolving process that is shaped by its community: your
feedback and questions are actively invited on the criteria listed in
this section.

(1) Data must be of one of these pollutant types: PM10, PM2.5, sulfur dioxide (SO2), carbon monoxide (CO), nitrogen dioxide (NO2), ozone (O3), and black carbon (BC).

(2) Data must be from an official-level outdoor air quality source, as defined as data produced by a government entity or international organization. We do not, at this stage, include data from low-cost, temporary, and/or indoor sensors. 

(3) Data must be ‘raw’ and reported in physical concentrations on their originating site. Data cannot be shared in an 'Air Quality Index' or equivalent (e.g. AQI, PSI, API) format.

(4) Data must be at the ‘station-level,’ associable with geographic coordinates, not aggregated into a higher (e.g. city) level.

(5) Data must be from measurements averaged between 10 minutes and 24 hours.


## Contributing
There are a lot of ways to contribute to this project, more details can be found in the [contributing guide](CONTRIBUTING.md).

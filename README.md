# OpenAQ Platform API [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
[![Build Status](https://travis-ci.org/openaq/openaq-api.svg?branch=master)](https://travis-ci.org/openaq/openaq-api)

## Overview
This is the main API for the [OpenAQ](https://openaq.org) project. The code in this repository serves two purposes.

Starting with `fetch.js`, there is an ingest mechanism to gather global air quality measurements from a variety of sources. This is currently run every 10 minutes and saves all unique measurements to a database.

Starting with `index.js`, there is a web-accessible API that provides endpoints to query the air quality measurements. Documentation can be found at [https://docs.openaq.org/](https://docs.openaq.org/).

## Installing & Running
To run the API locally, you will need both [Node.js](https://nodejs.org) and [MongoDB](https://www.mongodb.org/) installed.

Install necessary Node.js packages by running

`npm install`

Make sure you have MongoDB running locally and then you can start the app with

`npm start`

For the above to work, you will need to have certain environment variables set as in the table below

| Name | Description | Default |
|---|---|---|
INDIA_KIMONO_TOKEN | Token to be used for accessing Kimono API | not set |
MONGOLAB_URI | Database URL | mongodb://localhost:27017/openAQ |
| NEW_RELIC_LICENSE_KEY | New Relic API key for system monitoring | not set |
| SENDGRID_PASSWORD | Email service password | not set |
| SENDGRID_USERNAME | Email service username | not set |

## Tests
To confirm that everything is working as expected, you can run the tests with

`npm test`

## Contributing
There are a lot of ways to contribute to this project, more details can be found in the [contributing guide](CONTRIBUTING.md). 

How to quick start development?
=================================

Environment
-------------

Follow these steps to create a full local development environment (this is probably the quickest way to start from scratch):

1. Install fairly recent [node.js](https://nodejs.org/en/download/) [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) and [Docker](https://docs.docker.com/install/).
2. Start PostgreSQL with PostGIS `docker run --env POSTGRES_PASSWD=pgpassword --name postgis -dit --restart unless-stopped -p 5432:5432 geographica/postgis:quick_quail`
3. Pull the data from repo `git clone git@github.com:openaq/openaq-fetch.git`
4. Install dependencies `cd openaq-fetch && npm install`
5. Create a user and db in postgres in `psql -h localhost -p 5432 -U postgres`
```sql
CREATE ROLE openaq WITH PASSWORD `<enter password here>`;
CREATE DATABASE openaq OWNER openaq;
```
6. Create a local knexfile `cp knexfile.js knexfile.local.js && editor knexfile.local.js`

And you're set.

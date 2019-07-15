exports.up = async function (knex, Promise) {
  await knex.schema.raw(`
    DROP VIEW IF EXISTS latest_locations_metadata
  `);
  return knex.schema.raw(`
    CREATE VIEW latest_locations_metadata AS
    SELECT
      locations_metadata.id,
      locations_metadata."locationId",
      locations_metadata."userId",
      locations_metadata.data,
      locations_metadata.completeness,
      lm."createdAt",
      lm."updatedAt",
      lm.version
    FROM locations_metadata
    INNER JOIN (
      SELECT
        "locationId",
        max("createdAt") as "updatedAt",
        min("createdAt") as "createdAt",
        COUNT("locationId") as version
      FROM locations_metadata
      GROUP BY "locationId"
    ) lm ON locations_metadata."locationId" = lm."locationId" AND locations_metadata."createdAt" = lm."updatedAt"
  `);
};

exports.down = async function (knex, Promise) {
  await knex.schema.raw(`
    DROP VIEW IF EXISTS latest_locations_metadata
  `);

  return knex.schema.raw(`
    CREATE VIEW latest_locations_metadata AS
    SELECT
      locations_metadata.id,
      locations_metadata."locationId",
      locations_metadata."userId",
      locations_metadata.data,
      lm."createdAt",
      lm."updatedAt",
      lm.version
    FROM locations_metadata
    INNER JOIN (
      SELECT
        "locationId",
        max("createdAt") as "updatedAt",
        min("createdAt") as "createdAt",
        COUNT("locationId") as version
      FROM locations_metadata
      GROUP BY "locationId"
    ) lm ON locations_metadata."locationId" = lm."locationId" AND locations_metadata."createdAt" = lm."updatedAt"
  `);
};

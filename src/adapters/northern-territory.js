/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data for the Northern Territory EPA data sources.
 */

"use strict";

import { acceptableParameters } from "../lib/utils.js";
import { DateTime } from "luxon";

export const name = "northern-territory";

export async function fetchData(source, cb) {
  try {
    const sessionId = await getSessionCookie();
    if (!sessionId) {
      return cb({ message: "Failed to obtain session cookie." });
    }

    const rawData = await getMeasurements(sessionId);
    if (!rawData) {
      return cb({ message: "Failed to fetch data from API." });
    }

    const data = await formatData(rawData);
    if (data === undefined) {
      return cb({ message: "Failure to parse data." });
    }
    return cb(null, data);
  } catch (error) {
    return cb(error);
  }
}

async function getSessionCookie() {
  try {
    const response = await fetch(
      "http://ntepa.webhop.net/NTEPA/HomePageNew.aspx",
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OpenAQ-Fetch/1.0)",
        },
      }
    );

    const cookies = response.headers.get("set-cookie");
    if (!cookies) {
      return null;
    }

    const sessionIdMatch = cookies.match(/ASP\.NET_SessionId=([^;]+)/);
    if (!sessionIdMatch) {
      return null;
    }

    return sessionIdMatch[1];
  } catch (error) {
    return null;
  }
}

async function getMeasurements(sessionId) {
  try {
    const response = await fetch(
      "http://ntepa.webhop.net/NTEPA/Services/AirQualityPima.asmx/GetAllStationIndexValuePerPollutant",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Cookie: `ASP.NET_SessionId=${sessionId}`,
          "User-Agent": "Mozilla/5.0 (compatible; OpenAQ-Fetch/1.0)",
        },
        body: JSON.stringify({ stationID: -9999 }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

async function formatData(data) {
  // Handle API error responses
  if (data.Message) {
    return null;
  }

  if (!data.d || !Array.isArray(data.d)) {
    return null;
  }

  let measurements = [];

  data.d.forEach((stationData) => {
    const station = stations.find(
      (s) => s.serialCode === stationData.serialCode
    );
    if (!station) {
      return;
    }

    if (stationData.pollutants && Array.isArray(stationData.pollutants)) {
      stationData.pollutants.forEach((pollutant) => {
        const parameter = mapPollutantToParameter(pollutant.name);
        if (!parameter) {
          return;
        }

        if (
          pollutant.pollutantValue &&
          Array.isArray(pollutant.pollutantValue) &&
          pollutant.pollutantValue.length > 0
        ) {
          const reading = pollutant.pollutantValue[0];
          const value = parseFloat(reading.value);
          if (isNaN(value) || value === -9999) {
            return;
          }

          // Convert .NET JSON date to ISO
          const dateStr = pollutant.Date; // Format: /Date(1766914200000)/
          const timestamp = parseInt(dateStr.match(/\/Date\((\d+)\)\//)[1], 10);
          const date = DateTime.fromMillis(timestamp, {
            zone: "Australia/Darwin",
          });

          if (!date.isValid) {
            return;
          }

          measurements.push({
            location: station.name,
            city: station.city,
            parameter: parameter,
            value: value,
            unit: getUnitForParameter(parameter),
            date: {
              utc: date.toUTC().toISO({ suppressMilliseconds: true }),
              local: date.toISO({ suppressMilliseconds: true }),
            },
            coordinates: {
              latitude: station.location[1],
              longitude: station.location[0],
            },
            attribution: [
              {
                name: "Northern Territory Environment Protection Authority (NTEPA)",
                url: "http://ntepa.webhop.net/",
              },
            ],
            averagingPeriod: {
              unit: "hours",
              value: reading.timebase / 60,
            },
          });
        }
      });
    }
  });

  const filteredMeasurements = measurements.filter((obj) =>
    acceptableParameters.includes(obj.parameter)
  );

  return { name: "unused", measurements: filteredMeasurements };
}

function mapPollutantToParameter(pollutantName) {
  const name = pollutantName.toLowerCase().replace(/\s+/g, "");
  switch (name) {
    case "pm10":
      return "pm10";
    case "pm2.5":
    case "pm25":
      return "pm25";
    case "o3":
      return "o3";
    case "no2":
      return "no2";
    case "so2":
      return "so2";
    case "co":
      return "co";
    default:
      return null;
  }
}

function getUnitForParameter(parameter) {
  switch (parameter) {
    case "pm10":
    case "pm25":
      return "µg/m³";
    case "o3":
    case "no2":
    case "so2":
    case "co":
      return "ppm";
    default:
      return "µg/m³";
  }
}

const stations = [
  {
    name: "Palmerston",
    serialCode: 1,
    location: [130.94853, -12.50779],
    city: "Darwin",
  },
  {
    name: "Winnellie",
    serialCode: 2,
    location: [130.89335024356842, -12.424323299931126],
    city: "Darwin",
  },
  {
    name: "Stokeshill",
    serialCode: 3,
    location: [130.850577, -12.467003],
    city: "Darwin",
  },
  {
    name: "Katherine",
    serialCode: 4,
    location: [132.270787, -14.465331],
    city: "Darwin",
  },
];

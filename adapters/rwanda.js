'use strict';

import { default as moment } from 'moment-timezone';
import log from '../lib/logger';
import { promisePostRequest, unifyMeasurementUnits } from '../lib/utils';

export const name = 'rwanda';

export async function fetchData(source, cb) {

    try {
        const params = ["PM25", "PM10", "O3", "NO2", "SO2", "CO"]
        const data = JSON.parse(await promisePostRequest(source.url, { parameter: params[0] }));
        const base = {
            location: data.location,
            coordinates: data.coordinates,
            city: data.city,
            attribution: data.attribution,
            parameter: data.parameter,
            averagingPeriod: data.averagingPeriod,
            unit: data.unit
        }
        const measurements = data.data.map(d => {
            const values = {
                date: { local: d.date_local, utc: d.date_utc },
                value: Number(d.value)
            }
            var m = { ...base, ...values }
            return unifyMeasurementUnits(m)
        })

        cb(null, { name: 'unused', measurements });
    } catch (e) {
        cb(e);
    }
}

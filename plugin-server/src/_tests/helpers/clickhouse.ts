import ClickHouse from '@posthog/clickhouse'
import { performance } from 'perf_hooks'

import { status } from '../../utils/status'
import { delay } from '../../utils/utils'

const clickhouse = new ClickHouse({
    // We prefer to run queries on the offline cluster.
    host: process.env.CLICKHOUSE_HOST ?? 'localhost',
    port: process.env.CLICKHOUSE_SECURE ? 8443 : 8123,
    protocol: process.env.CLICKHOUSE_SECURE ? 'https:' : 'http:',
    user: process.env.CLICKHOUSE_USER ?? 'default',
    password: process.env.CLICKHOUSE_PASSWORD || undefined,
    dataObjects: true,
    queryOptions: {
        database: process.env.CLICKHOUSE_DATABASE ?? 'posthog_test',
        output_format_json_quote_64bit_integers: false,
    },
})

export async function resetTestDatabaseClickhouse(): Promise<void> {
    await Promise.all([
        clickhouse.querying('TRUNCATE sharded_events'),
        clickhouse.querying('TRUNCATE person'),
        clickhouse.querying('TRUNCATE person_distinct_id'),
        clickhouse.querying('TRUNCATE person_distinct_id2'),
        clickhouse.querying('TRUNCATE person_static_cohort'),
        clickhouse.querying('TRUNCATE sharded_session_recording_events'),
        clickhouse.querying('TRUNCATE plugin_log_entries'),
        clickhouse.querying('TRUNCATE events_dead_letter_queue'),
        clickhouse.querying('TRUNCATE groups'),
        clickhouse.querying('TRUNCATE sharded_ingestion_warnings'),
        clickhouse.querying('TRUNCATE sharded_app_metrics'),
    ])
}

export async function delayUntilEventIngested<T extends any[] | number>(
    fetchData: () => T | Promise<T>,
    minLength = 1,
    delayMs = 100,
    maxDelayCount = 100
): Promise<T> {
    const timer = performance.now()
    let data: T
    let dataLength = 0
    for (let i = 0; i < maxDelayCount; i++) {
        data = await fetchData()
        dataLength = typeof data === 'number' ? data : data.length
        status.debug(
            `Waiting. ${Math.round((performance.now() - timer) / 100) / 10}s since the start. ${dataLength} event${
                dataLength !== 1 ? 's' : ''
            }.`
        )
        if (dataLength >= minLength) {
            return data
        }
        await delay(delayMs)
    }
    throw Error(`Failed to get data in time, got ${JSON.stringify(data)}`)
}

export async function clickhouseQuery<R extends Record<string, any> = Record<string, any>>(
    query: string,
    options?: ClickHouse.QueryOptions
): Promise<ClickHouse.ObjectQueryResult<R>> {
    const queryResult = await clickhouse.querying(query, options)
    // This is annoying to type, because the result depends on contructor and query options provided
    // at runtime. However, with our options we can safely assume ObjectQueryResult<R>
    return queryResult as unknown as ClickHouse.ObjectQueryResult<R>
}

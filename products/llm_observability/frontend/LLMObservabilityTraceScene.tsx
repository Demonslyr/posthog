import classNames from 'classnames'
import clsx from 'clsx'
import { BindLogic, useActions, useValues } from 'kea'
import React, { useEffect, useRef, useState } from 'react'

import { IconAIText, IconChat, IconMessage, IconReceipt, IconSearch } from '@posthog/icons'
import {
    LemonButton,
    LemonDivider,
    LemonInput,
    LemonTable,
    LemonTabs,
    LemonTag,
    LemonTagProps,
    Link,
    SpinnerOverlay,
    Tooltip,
} from '@posthog/lemon-ui'

import { JSONViewer } from 'lib/components/JSONViewer'
import { NotFound } from 'lib/components/NotFound'
import ViewRecordingButton from 'lib/components/ViewRecordingButton/ViewRecordingButton'
import { FEATURE_FLAGS } from 'lib/constants'
import { IconArrowDown, IconArrowUp } from 'lib/lemon-ui/icons'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { identifierToHuman, isObject, pluralize } from 'lib/utils'
import { cn } from 'lib/utils/css-classes'
import { InsightEmptyState, InsightErrorState } from 'scenes/insights/EmptyStates'
import { PersonDisplay } from 'scenes/persons/PersonDisplay'
import { SceneExport } from 'scenes/sceneTypes'
import { urls } from 'scenes/urls'

import { LLMTrace, LLMTraceEvent } from '~/schema'

import { ConversationMessagesDisplay } from './ConversationDisplay/ConversationMessagesDisplay'
import { MetadataHeader } from './ConversationDisplay/MetadataHeader'
import { ParametersHeader } from './ConversationDisplay/ParametersHeader'
import { LLMInputOutput } from './LLMInputOutput'
import { FeedbackTag } from './components/FeedbackTag'
import { MetricTag } from './components/MetricTag'
import { llmObservabilityPlaygroundLogic } from './llmObservabilityPlaygroundLogic'
import { EnrichedTraceTreeNode, llmObservabilityTraceDataLogic } from './llmObservabilityTraceDataLogic'
import { llmObservabilityTraceLogic } from './llmObservabilityTraceLogic'
import {
    formatLLMCost,
    formatLLMEventTitle,
    formatLLMLatency,
    formatLLMUsage,
    getSessionID,
    hasSessionID,
    isLLMTraceEvent,
    removeMilliseconds,
} from './utils'

export const scene: SceneExport = {
    component: LLMObservabilityTraceScene,
    logic: llmObservabilityTraceLogic,
}

export function LLMObservabilityTraceScene(): JSX.Element {
    const { traceId, query } = useValues(llmObservabilityTraceLogic)

    return (
        <BindLogic logic={llmObservabilityTraceDataLogic} props={{ traceId, query }}>
            <TraceSceneWrapper />
        </BindLogic>
    )
}

function TraceSceneWrapper(): JSX.Element {
    const { eventId } = useValues(llmObservabilityTraceLogic)
    const { enrichedTree, trace, event, responseLoading, responseError, feedbackEvents, metricEvents } =
        useValues(llmObservabilityTraceDataLogic)

    return (
        <>
            {responseLoading ? (
                <SpinnerOverlay />
            ) : responseError ? (
                <InsightErrorState />
            ) : !trace ? (
                <NotFound object="trace" />
            ) : (
                <div className="deprecated-space-y-4 relative flex flex-col">
                    <TraceMetadata
                        trace={trace}
                        metricEvents={metricEvents as LLMTraceEvent[]}
                        feedbackEvents={feedbackEvents as LLMTraceEvent[]}
                    />
                    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
                        <TraceSidebar trace={trace} eventId={eventId} tree={enrichedTree} />
                        <EventContent event={event} tree={enrichedTree} />
                    </div>
                </div>
            )}
        </>
    )
}

function Chip({
    title,
    children,
    icon,
}: {
    title: string
    children: React.ReactNode
    icon?: JSX.Element
}): JSX.Element {
    return (
        <Tooltip title={title}>
            <LemonTag size="medium" className="bg-surface-primary" icon={icon}>
                <span className="sr-only">{title}</span>
                {children}
            </LemonTag>
        </Tooltip>
    )
}

function UsageChip({ event }: { event: LLMTraceEvent | LLMTrace }): JSX.Element | null {
    const usage = formatLLMUsage(event)
    return usage ? (
        <Chip title="Usage" icon={<IconAIText />}>
            {usage}
        </Chip>
    ) : null
}

function TraceMetadata({
    trace,
    metricEvents,
    feedbackEvents,
}: {
    trace: LLMTrace
    metricEvents: LLMTraceEvent[]
    feedbackEvents: LLMTraceEvent[]
}): JSX.Element {
    return (
        <header className="flex flex-wrap gap-2">
            {'person' in trace && (
                <Chip title="Person">
                    <PersonDisplay withIcon="sm" person={trace.person} />
                </Chip>
            )}
            <UsageChip event={trace} />
            {typeof trace.inputCost === 'number' && (
                <Chip title="Input cost" icon={<IconArrowUp />}>
                    {formatLLMCost(trace.inputCost)}
                </Chip>
            )}
            {typeof trace.outputCost === 'number' && (
                <Chip title="Output cost" icon={<IconArrowDown />}>
                    {formatLLMCost(trace.outputCost)}
                </Chip>
            )}
            {typeof trace.totalCost === 'number' && (
                <Chip title="Total cost" icon={<IconReceipt />}>
                    {formatLLMCost(trace.totalCost)}
                </Chip>
            )}
            {metricEvents.map((metric) => (
                <MetricTag key={metric.id} properties={metric.properties} />
            ))}
            {feedbackEvents.map((feedback) => (
                <FeedbackTag key={feedback.id} properties={feedback.properties} />
            ))}
        </header>
    )
}

function TraceSidebar({
    trace,
    eventId,
    tree,
}: {
    trace: LLMTrace
    eventId?: string | null
    tree: EnrichedTraceTreeNode[]
}): JSX.Element {
    const ref = useRef<HTMLDivElement | null>(null)
    const { searchQuery, mostRelevantEvent } = useValues(llmObservabilityTraceDataLogic)
    const { setSearchQuery, setEventId } = useActions(llmObservabilityTraceLogic)

    useEffect(() => {
        if (eventId && ref.current) {
            const selectedNode = ref.current.querySelector(`[aria-current=true]`)
            if (selectedNode) {
                selectedNode.scrollIntoView({ block: 'center' })
            }
        }
    }, [eventId])

    useEffect(() => {
        if (mostRelevantEvent && searchQuery.trim()) {
            setEventId(mostRelevantEvent.id)
        }
    }, [mostRelevantEvent, searchQuery, setEventId])

    return (
        <aside
            className="border-primary bg-surface-primary sticky bottom-[var(--scene-padding)] flex max-h-fit w-full flex-col overflow-hidden rounded border md:w-80"
            ref={ref}
        >
            <h3 className="my-2 px-2 text-sm font-medium">Tree</h3>
            <LemonDivider className="m-0" />
            <div className="p-2">
                <LemonInput
                    placeholder="Search trace..."
                    prefix={<IconSearch />}
                    value={searchQuery}
                    onChange={setSearchQuery}
                    size="small"
                />
            </div>
            <ul className="overflow-y-auto overflow-x-hidden p-1 *:first:mt-0">
                <TreeNode
                    topLevelTrace={trace}
                    node={{
                        event: trace,
                        displayTotalCost: trace.totalCost || 0,
                        displayLatency: trace.totalLatency || 0,
                        displayUsage: formatLLMUsage(trace),
                    }}
                    isSelected={!eventId || eventId === trace.id}
                />
                <TreeNodeChildren tree={tree} trace={trace} selectedEventId={eventId} />
            </ul>
        </aside>
    )
}

function NestingGroup({
    onToggle,
    isCollapsed,
    children,
}: {
    onToggle?: () => void
    isCollapsed?: boolean
    children: React.ReactNode
}): JSX.Element {
    return (
        <li className={clsx('flex min-w-0 items-stretch', isCollapsed && 'text-border hover:text-muted')}>
            <div
                className={clsx('mb-1 ml-1 cursor-pointer', !isCollapsed && 'text-border hover:text-muted')}
                onClick={onToggle}
            >
                <div
                    className={clsx(
                        'my-0 ml-1 mr-2 h-full w-0 border-l border-current',
                        isCollapsed && 'border-dashed'
                    )}
                />
            </div>
            <ul className="min-w-0 flex-1">{children}</ul>
        </li>
    )
}

const TreeNode = React.memo(function TraceNode({
    topLevelTrace,
    node,
    isSelected,
}: {
    topLevelTrace: LLMTrace
    node:
        | EnrichedTraceTreeNode
        | { event: LLMTrace; displayTotalCost: number; displayLatency: number; displayUsage: string | null }
    isSelected: boolean
}): JSX.Element {
    const totalCost = node.displayTotalCost
    const latency = node.displayLatency
    const usage = node.displayUsage
    const item = node.event

    const children = [
        isLLMTraceEvent(item) && item.properties.$ai_is_error && (
            <LemonTag key="error-tag" type="danger">
                Error
            </LemonTag>
        ),
        latency >= 0.01 && (
            <LemonTag key="latency-tag" type="muted">
                {formatLLMLatency(latency)}
            </LemonTag>
        ),
        (usage != null || totalCost != null) && (
            <span key="usage-tag">
                {usage}
                {usage != null && totalCost != null && <span>{' / '}</span>}
                {totalCost != null && formatLLMCost(totalCost)}
            </span>
        ),
    ]
    const hasChildren = children.some((child) => !!child)

    return (
        <li key={item.id} className="mt-0.5" aria-current={isSelected /* aria-current used for auto-focus */}>
            <Link
                to={urls.llmObservabilityTrace(topLevelTrace.id, {
                    event: item.id,
                    timestamp: removeMilliseconds(topLevelTrace.createdAt),
                })}
                className={classNames(
                    'hover:!bg-accent-highlight-secondary flex min-h-8 flex-col justify-center gap-1 rounded p-1 text-xs',
                    isSelected && '!bg-accent-highlight-secondary'
                )}
            >
                <div className="flex flex-row items-center gap-1.5">
                    <EventTypeTag event={item} size="small" />
                    <Tooltip title={formatLLMEventTitle(item)}>
                        <span className="flex-1 truncate">{formatLLMEventTitle(item)}</span>
                    </Tooltip>
                </div>
                {renderModelRow(item)}
                {hasChildren && (
                    <div className="text-secondary flex flex-row flex-wrap items-center gap-1.5">{children}</div>
                )}
            </Link>
        </li>
    )
})

export function renderModelRow(event: LLMTrace | LLMTraceEvent): React.ReactNode | null {
    if (isLLMTraceEvent(event)) {
        if (event.event === '$ai_generation') {
            // if we don't have a span name, we don't want to render the model row as its covered by the event title
            if (!event.properties.$ai_span_name) {
                return null
            }
            let model = event.properties.$ai_model
            if (event.properties.$ai_provider) {
                model = `${model} (${event.properties.$ai_provider})`
            }
            return <span className="flex-1 truncate"> {model} </span>
        }
    }
    return null
}

function TreeNodeChildren({
    tree,
    trace,
    selectedEventId,
}: {
    tree: EnrichedTraceTreeNode[]
    trace: LLMTrace
    selectedEventId?: string | null
}): JSX.Element {
    const [isCollapsed, setIsCollapsed] = useState(false)

    return (
        <NestingGroup isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(!isCollapsed)}>
            {!isCollapsed ? (
                tree.map((node) => (
                    <React.Fragment key={node.event.id}>
                        <TreeNode
                            topLevelTrace={trace}
                            node={node}
                            isSelected={!!selectedEventId && selectedEventId === node.event.id}
                        />
                        {node.children && (
                            <TreeNodeChildren tree={node.children} trace={trace} selectedEventId={selectedEventId} />
                        )}
                    </React.Fragment>
                ))
            ) : (
                <div
                    className="text-secondary hover:text-default text-xxs cursor-pointer p-1"
                    onClick={() => setIsCollapsed(false)}
                >
                    Show {pluralize(tree.length, 'collapsed child', 'collapsed children')}
                </div>
            )}
        </NestingGroup>
    )
}

function EventContentDisplay({
    input,
    output,
    raisedError,
}: {
    input: unknown
    output: unknown
    raisedError?: boolean
}): JSX.Element {
    if (!input && !output) {
        // If we have no data here we should not render anything
        // In future plan to point docs to show how to add custom trace events
        return <></>
    }
    return (
        <LLMInputOutput
            inputDisplay={
                <div className="rounded border bg-[var(--bg-fill-secondary)] p-2 text-xs">
                    {isObject(input) ? (
                        <JSONViewer src={input} collapsed={4} />
                    ) : (
                        <span className="font-mono">{JSON.stringify(input ?? null)}</span>
                    )}
                </div>
            }
            outputDisplay={
                <div
                    className={cn(
                        'rounded border p-2 text-xs',
                        !raisedError ? 'bg-[var(--bg-fill-success-tertiary)]' : 'bg-[var(--bg-fill-error-tertiary)]'
                    )}
                >
                    {isObject(output) ? (
                        <JSONViewer src={output} collapsed={4} />
                    ) : (
                        <span className="font-mono">{JSON.stringify(output ?? null)}</span>
                    )}
                </div>
            }
        />
    )
}

function findNodeForEvent(tree: EnrichedTraceTreeNode[], eventId: string): EnrichedTraceTreeNode | null {
    for (const node of tree) {
        if (node.event.id === eventId) {
            return node
        }
        if (node.children) {
            const result = findNodeForEvent(node.children, eventId)
            if (result) {
                return result
            }
        }
    }
    return null
}

const EventContent = React.memo(
    ({ event, tree }: { event: LLMTrace | LLMTraceEvent | null; tree: EnrichedTraceTreeNode[] }): JSX.Element => {
        const { setupPlaygroundFromEvent } = useActions(llmObservabilityPlaygroundLogic)
        const { featureFlags } = useValues(featureFlagLogic)
        const [viewMode, setViewMode] = useState<'conversation' | 'raw'>('conversation')

        const node = event && isLLMTraceEvent(event) ? findNodeForEvent(tree, event.id) : null
        const aggregation = node?.aggregation || null

        const showPlaygroundButton =
            event &&
            isLLMTraceEvent(event) &&
            event.event === '$ai_generation' &&
            featureFlags[FEATURE_FLAGS.LLM_OBSERVABILITY_PLAYGROUND]

        const handleTryInPlayground = (): void => {
            if (!event) {
                return
            }

            let model: string | undefined = undefined
            let input: any = undefined

            if (isLLMTraceEvent(event)) {
                model = event.properties.$ai_model
                // Prefer $ai_input if available, otherwise fallback to $ai_input_state
                input = event.properties.$ai_input ?? event.properties.$ai_input_state
            }

            setupPlaygroundFromEvent({ model, input })
        }

        return (
            <div className="bg-surface-primary border-primary flex max-h-fit flex-1 flex-col overflow-y-auto rounded border p-4">
                {!event ? (
                    <InsightEmptyState heading="Event not found" detail="Check if the event ID is correct." />
                ) : (
                    <>
                        <header className="deprecated-space-y-2">
                            <div className="flex flex-row items-center gap-2">
                                <EventTypeTag event={event} />
                                <h3 className="m-0 flex-1 truncate p-0 text-lg font-semibold">
                                    {formatLLMEventTitle(event)}
                                </h3>
                            </div>
                            {isLLMTraceEvent(event) ? (
                                <MetadataHeader
                                    isError={event.properties.$ai_is_error}
                                    inputTokens={event.properties.$ai_input_tokens}
                                    outputTokens={event.properties.$ai_output_tokens}
                                    cacheReadTokens={event.properties.$ai_cache_read_input_tokens}
                                    cacheWriteTokens={event.properties.$ai_cache_creation_input_tokens}
                                    totalCostUsd={event.properties.$ai_total_cost_usd}
                                    model={event.properties.$ai_model}
                                    latency={event.properties.$ai_latency}
                                />
                            ) : (
                                <MetadataHeader
                                    inputTokens={event.inputTokens}
                                    outputTokens={event.outputTokens}
                                    totalCostUsd={event.totalCost}
                                    latency={event.totalLatency}
                                />
                            )}
                            {isLLMTraceEvent(event) && <ParametersHeader eventProperties={event.properties} />}
                            {aggregation && (
                                <div className="flex flex-row flex-wrap items-center gap-2">
                                    {aggregation.totalCost > 0 && (
                                        <LemonTag type="muted" size="small">
                                            Total Cost: {formatLLMCost(aggregation.totalCost)}
                                        </LemonTag>
                                    )}
                                    {aggregation.totalLatency > 0 && (
                                        <LemonTag type="muted" size="small">
                                            Total Latency: {formatLLMLatency(aggregation.totalLatency)}
                                        </LemonTag>
                                    )}
                                    {(aggregation.inputTokens > 0 || aggregation.outputTokens > 0) && (
                                        <LemonTag type="muted" size="small">
                                            Tokens: {aggregation.inputTokens} → {aggregation.outputTokens} (∑{' '}
                                            {aggregation.inputTokens + aggregation.outputTokens})
                                        </LemonTag>
                                    )}
                                </div>
                            )}
                            {showPlaygroundButton ||
                                (hasSessionID(event) && (
                                    <div className="flex flex-row items-center gap-2">
                                        {showPlaygroundButton && (
                                            <LemonButton
                                                type="secondary"
                                                size="small"
                                                icon={<IconChat />}
                                                onClick={handleTryInPlayground}
                                                tooltip="Try this prompt in the playground"
                                            >
                                                Try in Playground
                                            </LemonButton>
                                        )}
                                        {hasSessionID(event) && (
                                            <ViewRecordingButton
                                                inModal
                                                type="secondary"
                                                size="xsmall"
                                                data-attr="llm-observability"
                                                sessionId={getSessionID(event) || undefined}
                                                timestamp={removeMilliseconds(event.createdAt)}
                                            />
                                        )}
                                    </div>
                                ))}
                        </header>
                        <LemonTabs
                            activeKey={viewMode}
                            onChange={setViewMode}
                            tabs={[
                                {
                                    key: 'conversation',
                                    label: 'Conversation',
                                    content: (
                                        <>
                                            {isLLMTraceEvent(event) ? (
                                                event.event === '$ai_generation' ? (
                                                    <ConversationMessagesDisplay
                                                        tools={event.properties.$ai_tools}
                                                        input={event.properties.$ai_input}
                                                        output={
                                                            event.properties.$ai_is_error
                                                                ? event.properties.$ai_error
                                                                : (event.properties.$ai_output_choices ??
                                                                  event.properties.$ai_output)
                                                        }
                                                        httpStatus={event.properties.$ai_http_status}
                                                        raisedError={event.properties.$ai_is_error}
                                                    />
                                                ) : (
                                                    <EventContentDisplay
                                                        input={event.properties.$ai_input_state}
                                                        output={
                                                            event.properties.$ai_output_state ??
                                                            event.properties.$ai_error
                                                        }
                                                        raisedError={event.properties.$ai_is_error}
                                                    />
                                                )
                                            ) : (
                                                <>
                                                    <TraceMetricsTable />
                                                    <EventContentDisplay
                                                        input={event.inputState}
                                                        output={event.outputState}
                                                    />
                                                </>
                                            )}
                                        </>
                                    ),
                                },
                                {
                                    key: 'raw',
                                    label: 'Raw',
                                    content: (
                                        <div className="p-2">
                                            <JSONViewer src={event} collapsed={2} />
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </>
                )}
            </div>
        )
    }
)
EventContent.displayName = 'EventContent'

function EventTypeTag({ event, size }: { event: LLMTrace | LLMTraceEvent; size?: LemonTagProps['size'] }): JSX.Element {
    let eventType = 'trace'
    if (isLLMTraceEvent(event)) {
        eventType = event.event === '$ai_generation' ? 'generation' : 'span'
    }
    return (
        <LemonTag
            className="uppercase"
            type={eventType === 'trace' ? 'completion' : eventType === 'span' ? 'default' : 'success'}
            size={size}
        >
            {eventType}
        </LemonTag>
    )
}

function TraceMetricsTable(): JSX.Element | null {
    const { metricsAndFeedbackEvents } = useValues(llmObservabilityTraceDataLogic)

    if (!metricsAndFeedbackEvents?.length) {
        return null
    }

    return (
        <div className="mb-3">
            <h4 className="mb-2 flex items-center gap-x-1.5 text-xs font-semibold">
                <IconMessage className="text-base" />
                Metrics and user feedback
            </h4>
            <LemonTable
                columns={[
                    {
                        title: 'Metric',
                        key: 'metric',
                        render: (_, { metric }) => <span>{identifierToHuman(metric)}</span>,
                        width: '40%',
                    },
                    {
                        title: 'Value',
                        key: 'value',
                        render: (_, { value }) => <span>{value ?? '–'}</span>,
                        width: '60%',
                    },
                ]}
                dataSource={metricsAndFeedbackEvents}
            />
        </div>
    )
}

"""
SessionBatchEventsQueryRunner extending EventsQueryRunner for multi-session event queries.

This runner leverages PostHog's existing EventsQueryRunner infrastructure while adding
session-specific capabilities like result grouping.
"""

from typing import Any

from posthog.hogql_queries.events_query_runner import EventsQueryRunner
from .schema import (
    SessionBatchEventsQuery,
    SessionBatchEventsQueryResponse,
    SessionEventsItem,
    SessionEventsResults,
)


class SessionBatchEventsQueryRunner(EventsQueryRunner):
    """
    Extended EventsQueryRunner for batch session event queries.

    This runner extends the standard EventsQueryRunner to handle multiple sessions
    efficiently while maintaining compatibility with all existing EventsQuery features.

    Key additions:
    1. Session-grouped result organization
    2. Session-specific metadata tracking
    3. Optimized query construction for multi-session scenarios
    """

    query: SessionBatchEventsQuery
    response: SessionBatchEventsQueryResponse

    def calculate(self) -> SessionBatchEventsQueryResponse:
        """
        Execute the session batch query and organize results by session.

        This method leverages the parent EventsQueryRunner.calculate() for query execution,
        then post-processes the results to group by session.

        Returns:
            SessionBatchEventsQueryResponse with session-grouped results and metadata
        """
        # Execute the base query using parent EventsQueryRunner
        base_response = super().calculate()

        # If group_by_session is False, return the base response as-is
        if not self.query.group_by_session:
            return SessionBatchEventsQueryResponse(
                **base_response.model_dump(),
                session_events=None,
            )

        # Group results by session and get filtered columns
        session_events_data, filtered_columns = self._group_events_by_session(
            results=base_response.results, columns=base_response.columns or []
        )

        # Create SessionEventsItem list
        session_events: list[SessionEventsItem] = []
        sessions_with_no_events: list[str] = []

        for session_id in self.query.session_ids:
            if session_id in session_events_data:
                events = session_events_data[session_id]
                session_events.append(
                    SessionEventsItem(
                        session_id=session_id,
                        events=events,
                    )
                )
            else:
                sessions_with_no_events.append(session_id)

        # Create the extended response
        return SessionBatchEventsQueryResponse(
            # Base EventsQueryResponse fields
            results=base_response.results,
            columns=filtered_columns,  # Use filtered columns without session_id
            types=base_response.types,
            hogql=base_response.hogql,
            timings=base_response.timings,
            error=base_response.error,
            hasMore=base_response.hasMore,
            limit=base_response.limit,
            offset=base_response.offset,
            modifiers=base_response.modifiers,
            query_status=base_response.query_status,
            # Session-specific fields
            session_events=session_events,
            sessions_with_no_events=sessions_with_no_events,
        )

    def _group_events_by_session(
        self, results: list[list[Any]], columns: list[str]
    ) -> tuple[SessionEventsResults, list[str]]:
        """
        Group query results by session_id.

        Args:
            results: Raw query results from EventsQueryRunner
            columns: Column names for the query results

        Returns:
            Tuple of (dictionary mapping session_id to list of events, filtered column names without session_id)
        """
        if not results or not columns:
            return {}, columns

        # Find the index of the $session_id column
        session_id_index = None
        for i, col in enumerate(columns):
            if col in ["properties.$session_id", "$session_id"]:
                session_id_index = i
                break

        if session_id_index is None:
            # If no session_id column found, we can't group by session
            # This shouldn't happen if the query was constructed properly
            raise ValueError(
                "No session_id column found in query results. Ensure 'properties.$session_id' is included in the select clause."
            )

        # Create filtered columns list without the session_id column
        filtered_columns = columns[:session_id_index] + columns[session_id_index + 1 :]

        # Group events by session_id
        events_by_session: SessionEventsResults = {}

        for row in results:
            if len(row) <= session_id_index:
                continue

            session_id = row[session_id_index]
            if session_id is None:
                continue

            # Convert to string to ensure consistent typing
            session_id = str(session_id)

            if session_id not in events_by_session:
                events_by_session[session_id] = []

            # Remove the session_id from the row since it's used for grouping
            # Keep all other fields for the session's events
            event_row = list(row[:session_id_index]) + list(row[session_id_index + 1 :])
            events_by_session[session_id].append(event_row)

        return events_by_session, filtered_columns


# Convenience functions for common use cases


def query_session_events_batch(
    team,
    session_ids: list[str],
    after: str = "-7d",
    max_total_events: int = 10000,
    events_to_ignore: list[str] | None = None,
    **kwargs,
) -> SessionBatchEventsQueryResponse:
    """
    Convenience function to query events for multiple sessions with sensible defaults.

    Args:
        team: PostHog team instance
        session_ids: List of session IDs to query
        after: Time range start (e.g., "-7d", "2023-01-01")
        max_total_events: Maximum total events across all sessions
        events_to_ignore: Events to exclude from results
        **kwargs: Additional query parameters

    Returns:
        SessionBatchEventsQueryResponse with grouped session events
    """
    from .schema import create_session_batch_query

    query = create_session_batch_query(
        session_ids=session_ids,
        after=after,
        max_total_events=max_total_events,
        events_to_ignore=events_to_ignore,
        **kwargs,
    )

    runner = SessionBatchEventsQueryRunner(team=team, query=query)
    return runner.calculate()

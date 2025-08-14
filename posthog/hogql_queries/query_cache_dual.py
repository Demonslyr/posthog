import structlog
from datetime import datetime
from typing import Optional

from posthog.exceptions_capture import capture_exception
from posthog.hogql_queries.query_cache_base import QueryCacheManagerBase
from posthog.hogql_queries.query_cache import DjangoCacheQueryCacheManager
from posthog.hogql_queries.query_cache_s3 import S3QueryCacheManager

logger = structlog.get_logger(__name__)


class DualCacheManager(QueryCacheManagerBase):
    """
    Dual cache manager that writes to both S3 and Redis but only reads from Redis.

    This is designed for migration scenarios where we want to populate S3 cache
    while still using Redis for fast reads. The dual writing ensures S3 is ready
    when we switch over.

    Instance behavior:
    - set_cache_data: Writes to both Redis (Django cache) and S3
    - get_cache_data: Reads only from Redis (Django cache) for performance

    Class method behavior:
    - get_stale_insights: Reads from both Redis and S3, returns combined results
    - clean_up_stale_insights: Cleans up both Redis and S3
    """

    def __init__(
        self,
        *,
        team_id: int,
        cache_key: str,
        insight_id: Optional[int] = None,
        dashboard_id: Optional[int] = None,
    ):
        super().__init__(
            team_id=team_id,
            cache_key=cache_key,
            insight_id=insight_id,
            dashboard_id=dashboard_id,
        )

        # Create instances of both cache managers
        self.redis_cache = DjangoCacheQueryCacheManager(
            team_id=team_id,
            cache_key=cache_key,
            insight_id=insight_id,
            dashboard_id=dashboard_id,
        )

        self.s3_cache = S3QueryCacheManager(
            team_id=team_id,
            cache_key=cache_key,
            insight_id=insight_id,
            dashboard_id=dashboard_id,
        )

    @classmethod
    def _redis_key_prefix(cls) -> str:
        """Use Redis prefix for dual cache since we read from Redis."""
        return "cache_timestamps"

    def set_cache_data(self, *, response: dict, target_age: Optional[datetime]) -> None:
        """Write to both Redis and S3."""
        redis_success = False
        s3_success = False

        # Write to Redis first (primary cache)
        try:
            self.redis_cache.set_cache_data(response=response, target_age=target_age)
            redis_success = True
            logger.debug(
                "dual_cache.redis_write_success",
                team_id=self.team_id,
                cache_key=self.cache_key,
            )
        except Exception as e:
            logger.warning(
                "dual_cache.redis_write_failed",
                team_id=self.team_id,
                cache_key=self.cache_key,
                error=str(e),
            )
            capture_exception(e)

        # Write to S3 (secondary cache for migration)
        try:
            self.s3_cache.set_cache_data(response=response, target_age=target_age)
            s3_success = True
            logger.debug(
                "dual_cache.s3_write_success",
                team_id=self.team_id,
                cache_key=self.cache_key,
            )
        except Exception as e:
            logger.warning(
                "dual_cache.s3_write_failed",
                team_id=self.team_id,
                cache_key=self.cache_key,
                error=str(e),
            )
            capture_exception(e)

        # At least one write must succeed
        if not redis_success and not s3_success:
            raise Exception("Both Redis and S3 cache writes failed")

    def get_cache_data(self) -> Optional[dict]:
        """Read only from Redis for performance."""
        try:
            result = self.redis_cache.get_cache_data()
            logger.debug(
                "dual_cache.redis_read",
                team_id=self.team_id,
                cache_key=self.cache_key,
                hit=result is not None,
            )
            return result
        except Exception as e:
            logger.warning(
                "dual_cache.redis_read_failed",
                team_id=self.team_id,
                cache_key=self.cache_key,
                error=str(e),
            )
            capture_exception(e)
            return None

    @classmethod
    def get_stale_insights(cls, *, team_id: int, limit: Optional[int] = None) -> list[str]:
        """
        Get stale insights from both Redis and S3, return combined results.

        This ensures we track staleness across both cache systems during migration.
        """
        redis_insights = set()
        s3_insights = set()

        # Get from Redis cache
        try:
            redis_insights = set(DjangoCacheQueryCacheManager.get_stale_insights(team_id=team_id, limit=limit))
            logger.debug(
                "dual_cache.redis_stale_insights",
                team_id=team_id,
                count=len(redis_insights),
            )
        except Exception as e:
            logger.warning(
                "dual_cache.redis_stale_insights_failed",
                team_id=team_id,
                error=str(e),
            )
            capture_exception(e)

        # Get from S3 cache
        try:
            s3_insights = set(S3QueryCacheManager.get_stale_insights(team_id=team_id, limit=limit))
            logger.debug(
                "dual_cache.s3_stale_insights",
                team_id=team_id,
                count=len(s3_insights),
            )
        except Exception as e:
            logger.warning(
                "dual_cache.s3_stale_insights_failed",
                team_id=team_id,
                error=str(e),
            )
            capture_exception(e)

        # Combine and return unique insights
        combined_insights = list(redis_insights.union(s3_insights))

        # Apply limit if specified
        if limit is not None:
            combined_insights = combined_insights[:limit]

        logger.debug(
            "dual_cache.combined_stale_insights",
            team_id=team_id,
            redis_count=len(redis_insights),
            s3_count=len(s3_insights),
            combined_count=len(combined_insights),
        )

        return combined_insights

    @classmethod
    def clean_up_stale_insights(cls, *, team_id: int, threshold: datetime) -> None:
        """
        Clean up stale insights from both Redis and S3.
        """
        # Clean up Redis cache
        try:
            DjangoCacheQueryCacheManager.clean_up_stale_insights(team_id=team_id, threshold=threshold)
            logger.debug(
                "dual_cache.redis_cleanup_success",
                team_id=team_id,
                threshold=threshold.isoformat(),
            )
        except Exception as e:
            logger.warning(
                "dual_cache.redis_cleanup_failed",
                team_id=team_id,
                error=str(e),
            )
            capture_exception(e)

        # Clean up S3 cache
        try:
            S3QueryCacheManager.clean_up_stale_insights(team_id=team_id, threshold=threshold)
            logger.debug(
                "dual_cache.s3_cleanup_success",
                team_id=team_id,
                threshold=threshold.isoformat(),
            )
        except Exception as e:
            logger.warning(
                "dual_cache.s3_cleanup_failed",
                team_id=team_id,
                error=str(e),
            )
            capture_exception(e)

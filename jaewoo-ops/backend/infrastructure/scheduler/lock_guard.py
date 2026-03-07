"""
스케줄러 중복 실행 방지 — SchedulerLockGuard
Phase 1: asyncio.Lock (단일 프로세스)
Phase 2: pg_advisory_lock (다중 인스턴스 분산 환경)
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class SchedulerLockGuard:
    """
    스케줄러 잡 중복 실행 방지.

    Phase 1 (현재): asyncio.Lock 기반 — 단일 워커 프로세스 내 동시 실행 차단.
    Phase 2 (이관 시): PostgreSQL pg_advisory_lock 으로 교체하여
                       다중 컨테이너 환경에서도 잡 중복 실행 방지.

    사용법:
        guard = SchedulerLockGuard()
        async with guard.acquire("morning_alerts"):
            await run_morning_alerts()
    """

    def __init__(self):
        # job_name → asyncio.Lock
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, job_name: str) -> asyncio.Lock:
        if job_name not in self._locks:
            self._locks[job_name] = asyncio.Lock()
        return self._locks[job_name]

    @asynccontextmanager
    async def acquire(self, job_name: str) -> AsyncGenerator[bool, None]:
        """
        잡 이름으로 락 획득을 시도.
        이미 실행 중이면 즉시 포기(non-blocking)하고 False를 yield.
        획득 성공 시 True를 yield하고 완료 후 해제.
        """
        lock = self._get_lock(job_name)
        acquired = lock.locked() is False and not lock.locked()

        # non-blocking 시도
        acquired = lock.acquire  # reference
        got = lock._lock.acquire(blocking=False) if hasattr(lock, '_lock') else None

        # asyncio.Lock은 non-blocking acquire를 직접 지원하지 않으므로
        # locked() 상태를 확인 후 시도
        if lock.locked():
            logger.warning(f"[SchedulerLock] '{job_name}' 이미 실행 중 — 건너뜀")
            yield False
            return

        async with lock:
            logger.debug(f"[SchedulerLock] '{job_name}' 락 획득")
            try:
                yield True
            finally:
                logger.debug(f"[SchedulerLock] '{job_name}' 락 해제")

    def is_running(self, job_name: str) -> bool:
        """잡이 현재 실행 중인지 확인"""
        lock = self._locks.get(job_name)
        return lock is not None and lock.locked()

    def running_jobs(self) -> list[str]:
        """현재 실행 중인 잡 목록"""
        return [name for name, lock in self._locks.items() if lock.locked()]


# ── Phase 2 대체용 인터페이스 (주석 참조) ────────────────────────────
#
# class PgAdvisoryLockGuard:
#     """
#     Phase 2: PostgreSQL advisory lock 기반 분산 락.
#
#     async with PgAdvisoryLockGuard(pool).acquire("morning_alerts"):
#         await run_morning_alerts()
#
#     내부적으로 pg_try_advisory_lock(hashtext(job_name)) 사용.
#     획득 실패 시 즉시 반환(non-blocking).
#     """
#     def __init__(self, pool):  # asyncpg Pool
#         self.pool = pool
#
#     @asynccontextmanager
#     async def acquire(self, job_name: str):
#         import hashlib
#         lock_key = int(hashlib.md5(job_name.encode()).hexdigest()[:8], 16)
#         async with self.pool.acquire() as conn:
#             got = await conn.fetchval(
#                 "SELECT pg_try_advisory_lock($1)", lock_key
#             )
#             try:
#                 yield got
#             finally:
#                 if got:
#                     await conn.execute(
#                         "SELECT pg_advisory_unlock($1)", lock_key
#                     )

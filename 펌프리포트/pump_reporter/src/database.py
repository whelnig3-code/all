"""SQLite 데이터베이스 계층 – 스키마 정의 및 CRUD."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, date
from typing import Optional

from src.config import DB_PATH
from src.logger import system_logger

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS pumps (
    pump_id       TEXT PRIMARY KEY,
    pump_name     TEXT NOT NULL,
    location      TEXT DEFAULT '',
    capacity_m3h  REAL DEFAULT 0,
    install_date  TEXT DEFAULT '',
    inspect_cycle_days INTEGER DEFAULT 365,
    memo          TEXT DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now','localtime')),
    updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS casing_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pump_id         TEXT NOT NULL REFERENCES pumps(pump_id),
    change_date     TEXT NOT NULL,
    reason          TEXT DEFAULT '',
    reset_baseline  INTEGER DEFAULT 1,
    memo            TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS daily_flow (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    pump_id   TEXT NOT NULL REFERENCES pumps(pump_id),
    date      TEXT NOT NULL,
    hour      INTEGER,
    flow_m3h  REAL,
    source_file TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(pump_id, date, hour)
);

CREATE TABLE IF NOT EXISTS baselines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pump_id     TEXT NOT NULL REFERENCES pumps(pump_id),
    baseline_value REAL NOT NULL,
    set_date    TEXT NOT NULL,
    reason      TEXT DEFAULT 'initial',
    created_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS baseline_profiles (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    pump_id               TEXT NOT NULL REFERENCES pumps(pump_id),
    baseline_value        REAL NOT NULL,
    baseline_period_start TEXT NOT NULL,
    baseline_period_end   TEXT NOT NULL,
    created_at            TEXT DEFAULT (datetime('now','localtime')),
    locked                INTEGER DEFAULT 0,
    description           TEXT DEFAULT '',
    cycle_id              INTEGER REFERENCES casing_history(id)
);

CREATE TABLE IF NOT EXISTS analysis_results (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pump_id         TEXT NOT NULL REFERENCES pumps(pump_id),
    analysis_date   TEXT NOT NULL,
    period_start    TEXT,
    period_end      TEXT,
    valid_start     TEXT,
    valid_end       TEXT,
    valid_days      INTEGER DEFAULT 0,
    total_records   INTEGER DEFAULT 0,
    valid_records   INTEGER DEFAULT 0,
    missing_rate    REAL DEFAULT 0,
    avg_flow        REAL,
    min_flow        REAL,
    max_flow        REAL,
    baseline_value  REAL,
    degradation_pct REAL,
    timer_detected  INTEGER DEFAULT 0,
    judgment        TEXT DEFAULT '',
    status_reason   TEXT DEFAULT '',
    days_since_last_casing INTEGER,
    cycle_exceeded  INTEGER DEFAULT 0,
    report_path     TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_daily_flow_pump_date ON daily_flow(pump_id, date);
CREATE INDEX IF NOT EXISTS idx_casing_pump ON casing_history(pump_id, change_date);
CREATE INDEX IF NOT EXISTS idx_analysis_pump ON analysis_results(pump_id, analysis_date);
CREATE INDEX IF NOT EXISTS idx_bp_pump ON baseline_profiles(pump_id);
"""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_session():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as exc:
        conn.rollback()
        try:
            system_logger.info({
                "timestamp": datetime.now().isoformat(),
                "event": "db_exception",
                "error": str(exc),
                "error_type": type(exc).__name__,
            })
        except Exception:
            pass
        raise
    finally:
        conn.close()


def init_db():
    with db_session() as conn:
        conn.executescript(SCHEMA_SQL)
        _migrate(conn)
    try:
        system_logger.info({
            "timestamp": datetime.now().isoformat(),
            "event": "db_init",
            "db_path": str(DB_PATH),
        })
    except Exception:
        pass


def _migrate(conn: sqlite3.Connection):
    """기존 DB에 신규 컬럼이 없으면 추가."""
    _add_column_if_missing(conn, "analysis_results", "status_reason", "TEXT DEFAULT ''")
    _add_column_if_missing(conn, "analysis_results", "valid_start", "TEXT")
    _add_column_if_missing(conn, "analysis_results", "valid_end", "TEXT")
    _add_column_if_missing(conn, "analysis_results", "valid_days", "INTEGER DEFAULT 0")
    _add_column_if_missing(conn, "analysis_results", "valid_records", "INTEGER DEFAULT 0")
    # v2.1: 펌프별 타이머 감지 설정
    _add_column_if_missing(conn, "pumps", "on_threshold", "REAL DEFAULT 0")
    _add_column_if_missing(conn, "pumps", "timer_repeat_window_minutes", "INTEGER DEFAULT 30")
    _add_column_if_missing(conn, "pumps", "timer_repeat_min_days", "INTEGER DEFAULT 3")
    _add_column_if_missing(conn, "pumps", "duty_cycle_timer_max", "REAL DEFAULT 0.75")
    # v2.1: 타이머 분석 상세 결과
    _add_column_if_missing(conn, "analysis_results", "timer_mode", "TEXT DEFAULT ''")
    _add_column_if_missing(conn, "analysis_results", "avg_on_minutes_per_day", "REAL")
    _add_column_if_missing(conn, "analysis_results", "avg_on_events_per_day", "REAL")
    _add_column_if_missing(conn, "analysis_results", "primary_on_window", "TEXT DEFAULT ''")
    # v2.2: 펌프 모델/정격유량
    _add_column_if_missing(conn, "pumps", "model", "TEXT DEFAULT ''")
    _add_column_if_missing(conn, "pumps", "rated_flow", "REAL DEFAULT 0")
    # v3.1: 펌프 운전유형
    _add_column_if_missing(conn, "pumps", "operation_type_manual", "TEXT DEFAULT ''")
    _add_column_if_missing(conn, "pumps", "operation_type_auto", "TEXT DEFAULT ''")
    # v3.2: 정격 가동시간
    _add_column_if_missing(conn, "pumps", "rated_hours", "REAL DEFAULT 0")
    # v3.5: 케이싱 교체 후 기준선
    _add_column_if_missing(conn, "casing_history", "post_casing_baseline", "REAL")
    _add_column_if_missing(conn, "casing_history", "baseline_set_date", "TEXT DEFAULT ''")
    # v4.0.1: 이벤트 유형 (casing / pump_replacement)
    _add_column_if_missing(conn, "casing_history", "event_type",
                           "TEXT DEFAULT 'casing'")
    # v4.6: 수동 기준선
    _add_column_if_missing(conn, "pumps", "manual_baseline_value", "REAL")
    _add_column_if_missing(conn, "pumps", "manual_baseline_set_at", "TEXT")


def _add_column_if_missing(conn: sqlite3.Connection, table: str,
                           column: str, col_type: str):
    cursor = conn.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


# ── Pumps CRUD ──────────────────────────────────────────────
def upsert_pump(pump_id: str, pump_name: str, location: str = "",
                capacity: float = 0, install_date: str = "",
                inspect_cycle: int = 365, memo: str = "",
                on_threshold: float = 0,
                timer_repeat_window_minutes: int = 30,
                timer_repeat_min_days: int = 3,
                duty_cycle_timer_max: float = 0.75,
                model: str = "", rated_flow: float = 0.0,
                rated_hours: float = 0.0):
    with db_session() as conn:
        conn.execute("""
            INSERT INTO pumps (pump_id, pump_name, location, capacity_m3h,
                               install_date, inspect_cycle_days, memo,
                               on_threshold, timer_repeat_window_minutes,
                               timer_repeat_min_days, duty_cycle_timer_max,
                               model, rated_flow, rated_hours)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(pump_id) DO UPDATE SET
                pump_name=excluded.pump_name, location=excluded.location,
                capacity_m3h=excluded.capacity_m3h,
                install_date=excluded.install_date,
                inspect_cycle_days=excluded.inspect_cycle_days,
                memo=excluded.memo,
                on_threshold=excluded.on_threshold,
                timer_repeat_window_minutes=excluded.timer_repeat_window_minutes,
                timer_repeat_min_days=excluded.timer_repeat_min_days,
                duty_cycle_timer_max=excluded.duty_cycle_timer_max,
                model=excluded.model,
                rated_flow=excluded.rated_flow,
                rated_hours=excluded.rated_hours,
                updated_at=datetime('now','localtime')
        """, (pump_id, pump_name, location, capacity, install_date,
              inspect_cycle, memo, on_threshold,
              timer_repeat_window_minutes, timer_repeat_min_days,
              duty_cycle_timer_max, model, rated_flow, rated_hours))


def get_all_pumps() -> list[dict]:
    with db_session() as conn:
        rows = conn.execute("SELECT * FROM pumps ORDER BY pump_id").fetchall()
        return [dict(r) for r in rows]


def delete_pump(pump_id: str):
    with db_session() as conn:
        conn.execute("DELETE FROM daily_flow WHERE pump_id=?", (pump_id,))
        conn.execute("DELETE FROM casing_history WHERE pump_id=?", (pump_id,))
        conn.execute("DELETE FROM baselines WHERE pump_id=?", (pump_id,))
        conn.execute("DELETE FROM baseline_profiles WHERE pump_id=?", (pump_id,))
        conn.execute("DELETE FROM analysis_results WHERE pump_id=?", (pump_id,))
        conn.execute("DELETE FROM pumps WHERE pump_id=?", (pump_id,))


# ── Casing History ──────────────────────────────────────────
def add_casing_event(pump_id: str, change_date: str, reason: str = "",
                     reset_baseline: int = 1, memo: str = "",
                     event_type: str = "casing") -> int:
    with db_session() as conn:
        cur = conn.execute("""
            INSERT INTO casing_history (pump_id, change_date, reason,
                                        reset_baseline, memo, event_type)
            VALUES (?,?,?,?,?,?)
        """, (pump_id, change_date, reason, reset_baseline, memo, event_type))
        return cur.lastrowid


def get_casing_history(pump_id: Optional[str] = None) -> list[dict]:
    with db_session() as conn:
        if pump_id:
            rows = conn.execute(
                "SELECT * FROM casing_history WHERE pump_id=? ORDER BY change_date DESC",
                (pump_id,)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM casing_history ORDER BY change_date DESC"
            ).fetchall()
        return [dict(r) for r in rows]


def update_casing_baseline(event_id: int, baseline_value: float,
                           set_date: str):
    """케이싱 이벤트에 교체 후 기준선 값을 저장."""
    with db_session() as conn:
        conn.execute(
            "UPDATE casing_history SET post_casing_baseline=?, "
            "baseline_set_date=? WHERE id=?",
            (baseline_value, set_date, event_id))


def invalidate_old_casing_baselines(pump_id: str, after_date: str):
    """after_date보다 이전 케이싱 이벤트의 post_casing_baseline을 NULL로 초기화."""
    with db_session() as conn:
        conn.execute(
            "UPDATE casing_history SET post_casing_baseline=NULL, "
            "baseline_set_date='' "
            "WHERE pump_id=? AND change_date < ? "
            "AND post_casing_baseline IS NOT NULL",
            (pump_id, after_date))


def get_latest_casing_with_baseline(pump_id: str) -> Optional[dict]:
    """해당 펌프의 가장 최근 케이싱 이벤트 중
    post_casing_baseline이 설정된 건 반환."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM casing_history "
            "WHERE pump_id=? AND post_casing_baseline IS NOT NULL "
            "ORDER BY change_date DESC LIMIT 1",
            (pump_id,)).fetchone()
        return dict(row) if row else None


def delete_casing_event(event_id: int):
    with db_session() as conn:
        conn.execute("DELETE FROM casing_history WHERE id=?", (event_id,))


# ── Daily Flow ──────────────────────────────────────────────
def insert_daily_flows(records: list[dict]):
    """records: list of {pump_id, date, hour, flow_m3h, source_file}"""
    with db_session() as conn:
        conn.executemany("""
            INSERT OR REPLACE INTO daily_flow
                (pump_id, date, hour, flow_m3h, source_file)
            VALUES (:pump_id, :date, :hour, :flow_m3h, :source_file)
        """, records)


def get_daily_flows(pump_id: str, start_date: str = None,
                    end_date: str = None) -> list[dict]:
    with db_session() as conn:
        query = "SELECT * FROM daily_flow WHERE pump_id=?"
        params = [pump_id]
        if start_date:
            query += " AND date>=?"
            params.append(start_date)
        if end_date:
            query += " AND date<=?"
            params.append(end_date)
        query += " ORDER BY date, hour"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_daily_averages(pump_id: str, start_date: str = None,
                       end_date: str = None) -> list[dict]:
    with db_session() as conn:
        query = """
            SELECT pump_id, date, AVG(flow_m3h) as avg_flow,
                   MIN(flow_m3h) as min_flow, MAX(flow_m3h) as max_flow,
                   COUNT(flow_m3h) as data_count
            FROM daily_flow WHERE pump_id=? AND flow_m3h IS NOT NULL
        """
        params = [pump_id]
        if start_date:
            query += " AND date>=?"
            params.append(start_date)
        if end_date:
            query += " AND date<=?"
            params.append(end_date)
        query += " GROUP BY pump_id, date ORDER BY date"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


# ── Baselines ───────────────────────────────────────────────
def set_baseline(pump_id: str, value: float, set_date: str,
                 reason: str = "initial"):
    with db_session() as conn:
        conn.execute("""
            INSERT INTO baselines (pump_id, baseline_value, set_date, reason)
            VALUES (?,?,?,?)
        """, (pump_id, value, set_date, reason))


def get_latest_baseline(pump_id: str) -> Optional[dict]:
    with db_session() as conn:
        row = conn.execute("""
            SELECT * FROM baselines WHERE pump_id=?
            ORDER BY set_date DESC LIMIT 1
        """, (pump_id,)).fetchone()
        return dict(row) if row else None


# ── Baseline Profiles (v4.0) ─────────────────────────────────
def save_baseline_profile(pump_id: str, baseline_value: float,
                          period_start: str, period_end: str,
                          description: str = "",
                          cycle_id: int = None,
                          locked: bool = False) -> int:
    """기준선 프로필 스냅샷 저장. 신규 ID 반환."""
    with db_session() as conn:
        cur = conn.execute(
            "INSERT INTO baseline_profiles "
            "(pump_id, baseline_value, baseline_period_start, "
            " baseline_period_end, description, cycle_id, locked) "
            "VALUES (?,?,?,?,?,?,?)",
            (pump_id, baseline_value, period_start, period_end,
             description, cycle_id, int(locked)))
        profile_id = cur.lastrowid
    try:
        system_logger.info({
            "timestamp": datetime.now().isoformat(),
            "event": "baseline_profile_saved",
            "pump_id": pump_id,
            "profile_id": profile_id,
            "baseline_value": baseline_value,
            "period": f"{period_start}~{period_end}",
            "cycle_id": cycle_id,
        })
    except Exception:
        pass
    return profile_id


def get_baseline_profiles(pump_id: str) -> list[dict]:
    """해당 펌프의 전체 기준선 프로필 (최신 순)."""
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM baseline_profiles WHERE pump_id=? "
            "ORDER BY created_at DESC",
            (pump_id,)).fetchall()
        return [dict(r) for r in rows]


def get_baseline_profile(profile_id: int) -> Optional[dict]:
    """단일 기준선 프로필 조회."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM baseline_profiles WHERE id=?",
            (profile_id,)).fetchone()
        return dict(row) if row else None


def get_latest_casing_date(pump_id: str) -> tuple:
    """최근 케이싱 교체일 + ID. 없으면 (None, None). (하위 호환용)"""
    date, eid, _ = get_latest_reset_event(pump_id)
    return (date, eid)


def get_latest_reset_event(pump_id: str) -> tuple:
    """최근 리셋 이벤트(케이싱/펌프교체) 조회.

    반환: (change_date, id, event_type) 또는 (None, None, None).
    동일 날짜 이벤트 시 id DESC (나중 입력 우선).
    """
    with db_session() as conn:
        row = conn.execute(
            "SELECT id, change_date, "
            "COALESCE(event_type, 'casing') AS event_type "
            "FROM casing_history "
            "WHERE pump_id=? "
            "AND COALESCE(event_type, 'casing') "
            "    IN ('casing', 'pump_replacement') "
            "ORDER BY change_date DESC, id DESC LIMIT 1",
            (pump_id,)).fetchone()
        if row:
            try:
                system_logger.info({
                    "timestamp": datetime.now().isoformat(),
                    "event": "reset_event_detected",
                    "pump_id": pump_id,
                    "change_date": row["change_date"],
                    "event_type": row["event_type"],
                    "event_id": row["id"],
                })
            except Exception:
                pass
            return (row["change_date"], row["id"], row["event_type"])
        return (None, None, None)


# ── v4.6: 수동 기준선 ─────────────────────────────────────
def get_manual_baseline(pump_id: str):
    """수동 기준선 값 반환. 미설정 시 None."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT manual_baseline_value FROM pumps WHERE pump_id=?",
            (pump_id,)).fetchone()
        if row and row["manual_baseline_value"] is not None:
            return row["manual_baseline_value"]
        return None


def save_manual_baseline(pump_id: str, value: float):
    """수동 기준선 저장."""
    set_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with db_session() as conn:
        conn.execute(
            "UPDATE pumps SET manual_baseline_value=?, "
            "manual_baseline_set_at=? WHERE pump_id=?",
            (value, set_at, pump_id))
    try:
        system_logger.info({
            "timestamp": datetime.now().isoformat(),
            "event": "manual_baseline_set",
            "pump_id": pump_id,
            "value": value,
        })
    except Exception:
        pass


def clear_manual_baseline(pump_id: str):
    """수동 기준선 해제 → 자동 복귀."""
    with db_session() as conn:
        conn.execute(
            "UPDATE pumps SET manual_baseline_value=NULL, "
            "manual_baseline_set_at=NULL WHERE pump_id=?",
            (pump_id,))
    try:
        system_logger.info({
            "timestamp": datetime.now().isoformat(),
            "event": "manual_baseline_cleared",
            "pump_id": pump_id,
        })
    except Exception:
        pass


# ── Analysis Results ────────────────────────────────────────
def save_analysis_result(result: dict):
    # data_rate → missing_rate 컬럼 매핑 (DB 스키마 호환)
    save_data = dict(result)
    if "data_rate" in save_data and "missing_rate" not in save_data:
        save_data["missing_rate"] = save_data.pop("data_rate")
    # v2.1 새 키 기본값 보장
    save_data.setdefault("timer_mode", "")
    save_data.setdefault("avg_on_minutes_per_day", None)
    save_data.setdefault("avg_on_events_per_day", None)
    save_data.setdefault("primary_on_window", "")
    with db_session() as conn:
        conn.execute("""
            INSERT INTO analysis_results
                (pump_id, analysis_date, period_start, period_end,
                 valid_start, valid_end, valid_days,
                 total_records, valid_records, missing_rate,
                 avg_flow, min_flow, max_flow,
                 baseline_value, degradation_pct, timer_detected,
                 judgment, status_reason,
                 days_since_last_casing, cycle_exceeded, report_path,
                 timer_mode, avg_on_minutes_per_day,
                 avg_on_events_per_day, primary_on_window)
            VALUES (:pump_id, :analysis_date, :period_start, :period_end,
                    :valid_start, :valid_end, :valid_days,
                    :total_records, :valid_records, :missing_rate,
                    :avg_flow, :min_flow, :max_flow,
                    :baseline_value, :degradation_pct,
                    :timer_detected, :judgment, :status_reason,
                    :days_since_last_casing,
                    :cycle_exceeded, :report_path,
                    :timer_mode, :avg_on_minutes_per_day,
                    :avg_on_events_per_day, :primary_on_window)
        """, save_data)


def get_data_date_range() -> tuple[str, str] | None:
    """daily_flow 테이블의 유효 데이터(flow_m3h IS NOT NULL) MIN/MAX 날짜."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT MIN(date) as min_d, MAX(date) as max_d "
            "FROM daily_flow WHERE flow_m3h IS NOT NULL"
        ).fetchone()
        if row and row["min_d"] and row["max_d"]:
            return row["min_d"], row["max_d"]
        return None


def get_record_count_in_range(start_date: str, end_date: str) -> int:
    """지정 기간 내 유효 레코드(flow_m3h IS NOT NULL) 수 반환."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM daily_flow "
            "WHERE date >= ? AND date <= ? AND flow_m3h IS NOT NULL",
            (start_date, end_date)).fetchone()
        return row["cnt"] if row else 0


def get_pump_data_range(pump_id: str) -> tuple[str, str] | None:
    """해당 펌프의 유효 데이터(flow_m3h IS NOT NULL) 최소/최대 날짜."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT MIN(date) as min_d, MAX(date) as max_d "
            "FROM daily_flow WHERE pump_id = ? AND flow_m3h IS NOT NULL",
            (pump_id,)).fetchone()
        if row and row["min_d"] and row["max_d"]:
            return row["min_d"], row["max_d"]
        return None


def get_pump_record_count_in_range(pump_id: str, start_date: str,
                                   end_date: str) -> int:
    """특정 펌프의 지정 기간 내 유효 레코드(flow_m3h IS NOT NULL) 수."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM daily_flow "
            "WHERE pump_id = ? AND date >= ? AND date <= ? "
            "AND flow_m3h IS NOT NULL",
            (pump_id, start_date, end_date)).fetchone()
        return row["cnt"] if row else 0


def get_analysis_results(pump_id: Optional[str] = None) -> list[dict]:
    with db_session() as conn:
        if pump_id:
            rows = conn.execute(
                "SELECT * FROM analysis_results WHERE pump_id=? ORDER BY analysis_date DESC",
                (pump_id,)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM analysis_results ORDER BY analysis_date DESC"
            ).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            # DB 컬럼 missing_rate → data_rate 키 매핑
            if "missing_rate" in d:
                d["data_rate"] = d.pop("missing_rate")
            results.append(d)
        return results


# ── v2.2 신규 함수 ────────────────────────────────────────

def save_pump_info(pump_id: str, pump_name: str, install_date: str = "",
                   model: str = "", rated_flow: float = 0,
                   location: str = "", memo: str = ""):
    """pump_master 요건 래퍼. upsert_pump 위임."""
    upsert_pump(pump_id=pump_id, pump_name=pump_name,
                install_date=install_date, model=model,
                rated_flow=rated_flow, location=location, memo=memo)


def get_pump_info(pump_id: str) -> Optional[dict]:
    """단일 펌프 정보 조회."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM pumps WHERE pump_id=?", (pump_id,)
        ).fetchone()
        return dict(row) if row else None


def update_pump_operation_type_auto(pump_id: str, op_type: str):
    """분석기가 자동 추정한 운전유형을 DB에 저장."""
    with db_session() as conn:
        conn.execute(
            "UPDATE pumps SET operation_type_auto=? WHERE pump_id=?",
            (op_type, pump_id))


def save_casing_record(pump_id: str, casing_date: str,
                       reason: str = "", memo: str = "") -> int:
    """케이싱 기록 저장 래퍼. add_casing_event 위임."""
    return add_casing_event(pump_id, casing_date, reason,
                            reset_baseline=1, memo=memo)


def get_casing_history_recent(pump_id: str, limit: int = 5) -> list[dict]:
    """펌프별 최근 N건 케이싱 이력 조회."""
    with db_session() as conn:
        rows = conn.execute(
            "SELECT * FROM casing_history WHERE pump_id=? "
            "ORDER BY change_date DESC LIMIT ?",
            (pump_id, limit)).fetchall()
        return [dict(r) for r in rows]


def get_latest_results_per_pump() -> list[dict]:
    """펌프별 최신 분석 결과 1건씩 반환 (대시보드 KPI용)."""
    with db_session() as conn:
        rows = conn.execute("""
            SELECT * FROM analysis_results
            WHERE id IN (
                SELECT MAX(id) FROM analysis_results GROUP BY pump_id
            )
            ORDER BY pump_id
        """).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            if "missing_rate" in d:
                d["data_rate"] = d.pop("missing_rate")
            results.append(d)
        return results


def get_analysis_results_filtered(
        pump_id: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
        judgment_filter: Optional[str] = None,
        limit: int = 200) -> list[dict]:
    """필터 기반 분석 결과 조회 (분석결과 탭용)."""
    with db_session() as conn:
        query = "SELECT * FROM analysis_results WHERE 1=1"
        params: list = []
        if pump_id:
            query += " AND pump_id=?"
            params.append(pump_id)
        if period_start:
            query += " AND period_start>=?"
            params.append(period_start)
        if period_end:
            query += " AND period_end<=?"
            params.append(period_end)
        if judgment_filter:
            query += " AND judgment LIKE ?"
            params.append(f"%{judgment_filter}%")
        query += " ORDER BY analysis_date DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            if "missing_rate" in d:
                d["data_rate"] = d.pop("missing_rate")
            results.append(d)
        return results

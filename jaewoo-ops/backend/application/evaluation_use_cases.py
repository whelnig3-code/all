"""
Evaluation Use Cases — 인사평가 집계 유스케이스
"""
import logging
from datetime import date, datetime

from domain.evaluation.models import AnnualEvaluation, MonthlyEvaluation
from domain.evaluation.score_calculator import ScoreInput, calculate_monthly_score
from domain.task.models import TaskStatus, TaskType
from infrastructure.excel.employee_excel_repo import EmployeeExcelRepository
from infrastructure.excel.excel_client import ExcelClient, SHEET_EVALUATION
from infrastructure.excel.task_excel_repo import TaskExcelRepository

logger = logging.getLogger(__name__)


class EvaluationUseCases:
    def __init__(
        self,
        task_repo: TaskExcelRepository,
        employee_repo: EmployeeExcelRepository,
        excel_client: ExcelClient,
    ):
        self.task_repo = task_repo
        self.employee_repo = employee_repo
        self.excel_client = excel_client

    async def calculate_previous_month(self) -> list[MonthlyEvaluation]:
        """전월 평가 집계 (매월 1일 실행)"""
        today = date.today()
        if today.month == 1:
            year, month = today.year - 1, 12
        else:
            year, month = today.year, today.month - 1
        year_month = f"{year}-{month:02d}"

        employees = self.employee_repo.get_all()
        all_tasks = self.task_repo.get_all()
        evaluations = []

        for emp in employees:
            eval_result = self._calculate_monthly(emp, all_tasks, year_month)
            evaluations.append(eval_result)
            self._save_monthly_eval(eval_result, emp.name)
            logger.info(f"[EvalUC] 월간 평가: {emp.name} {year_month} → {eval_result.weighted_score}")

        return evaluations

    async def calculate_annual(self) -> list[AnnualEvaluation]:
        """연간 평가 산출 (매년 1/1 실행)"""
        year = date.today().year - 1
        employees = self.employee_repo.get_all()
        results = []

        for emp in employees:
            monthly_rows = self.excel_client.read_sheet(SHEET_EVALUATION)
            monthly_evals = [
                self._row_to_monthly(r)
                for r in monthly_rows
                if str(r.get("이름")) == emp.name
                and str(r.get("월", "")).startswith(str(year))
            ]
            annual = AnnualEvaluation(
                employee_id=emp.employee_id,
                year=year,
            )
            annual.calculate_final_score(monthly_evals)
            results.append(annual)
            logger.info(f"[EvalUC] 연간 평가: {emp.name} {year} → {annual.final_score} ({annual.grade.value})")

        return results

    def get_all_monthly(self, year_month: str) -> list[MonthlyEvaluation]:
        """전 직원 특정 월 평가 목록 (Excel 월간평가 시트에서 조회)"""
        rows = self.excel_client.read_sheet(SHEET_EVALUATION)
        results = []
        for r in rows:
            if str(r.get("월", "")).strip() == year_month.strip():
                obj = self._row_to_monthly(r)
                # employee_name 주입 (Excel의 이름 컬럼)
                obj.employee_name = str(r.get("이름", ""))
                results.append(obj)
        return results

    def get_monthly(self, employee_id: str, year_month: str) -> MonthlyEvaluation | None:
        employee = self.employee_repo.get_by_id(employee_id)
        if not employee:
            return None
        rows = self.excel_client.read_sheet(SHEET_EVALUATION)
        for r in rows:
            if str(r.get("이름")) == employee.name and str(r.get("월")) == year_month:
                return self._row_to_monthly(r)
        return None

    # ── 내부 계산 로직 ────────────────────────────

    def _calculate_monthly(self, employee, all_tasks: list,
                             year_month: str) -> MonthlyEvaluation:
        """직원의 특정 월 평가 지표 계산"""
        year, month = map(int, year_month.split("-"))

        def in_month(d) -> bool:
            return d is not None and d.year == year and d.month == month

        # 해당 월 배정 업무 (완료일 기준)
        assigned = [
            t for t in all_tasks
            if t.assignee_id == employee.employee_id
            and (in_month(t.due_date) or in_month(
                t.completed_at.date() if t.completed_at else None
            ))
            and t.task_type != TaskType.EMERGENCY  # 긴급업무 감점 제외
            and t.original_assignee_id != employee.employee_id  # 재배정 제외
        ]

        total = len(assigned)
        on_time = sum(
            1 for t in assigned
            if t.status == TaskStatus.COMPLETED
            and t.completed_at
            and t.due_date
            and t.completed_at.date() <= t.due_date
        )
        late = sum(
            1 for t in assigned
            if t.status == TaskStatus.COMPLETED
            and t.completed_at
            and t.due_date
            and t.completed_at.date() > t.due_date
        )
        incomplete = sum(
            1 for t in assigned
            if t.status not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)
        )

        delay_days_list = [
            (t.completed_at.date() - t.due_date).days
            for t in assigned
            if t.status == TaskStatus.COMPLETED
            and t.completed_at and t.due_date
            and t.completed_at.date() > t.due_date
        ]
        avg_delay = sum(delay_days_list) / len(delay_days_list) if delay_days_list else 0.0

        recurring = [t for t in assigned if t.task_type == TaskType.RECURRING]
        recurring_miss_rate = (
            sum(1 for t in recurring if t.status != TaskStatus.COMPLETED) / len(recurring)
            if recurring else 0.0
        )

        # 긴급업무 SLA 집계
        emergency_tasks = [
            t for t in all_tasks
            if t.assignee_id == employee.employee_id
            and t.task_type == TaskType.EMERGENCY
            and (in_month(t.due_date) or in_month(
                t.completed_at.date() if t.completed_at else None
            ))
        ]
        emergency_sla_met = sum(
            1 for t in emergency_tasks
            if t.status == TaskStatus.COMPLETED
            and t.completed_at and t.due_date
            and t.completed_at.date() <= t.due_date
        )

        # 개인 과제 집계
        personal_tasks = [
            t for t in assigned
            if t.task_type == TaskType.PERSONAL
        ]

        # v1.3 ScoreCalculator 사용
        score_input = ScoreInput(
            employee_id=employee.employee_id,
            year=year,
            month=month,
            total_tasks=total,
            completed_tasks=on_time + late,
            on_time_tasks=on_time,
            log_quality_score=1.0 - recurring_miss_rate,  # 반복업무 완수율로 근사
            emergency_total=len(emergency_tasks),
            emergency_sla_met=emergency_sla_met,
            personal_task_total=len(personal_tasks),
            personal_task_completed=sum(
                1 for t in personal_tasks if t.status == TaskStatus.COMPLETED
            ),
        )
        score_result = calculate_monthly_score(score_input)

        eval_obj = MonthlyEvaluation(
            employee_id=employee.employee_id,
            year_month=year_month,
            total_assigned=total,
            on_time_completed=on_time,
            late_completed=late,
            incomplete=incomplete,
            average_delay_days=avg_delay,
            recurring_miss_rate=recurring_miss_rate,
            weighted_score=score_result.final_score,
        )
        return eval_obj

    def _save_monthly_eval(self, eval_obj: MonthlyEvaluation, employee_name: str) -> None:
        self.excel_client.append_row(SHEET_EVALUATION, [
            eval_obj.year_month,
            employee_name,
            eval_obj.total_assigned,
            eval_obj.on_time_completed,
            eval_obj.late_completed,
            eval_obj.incomplete,
            "",
            "",
            eval_obj.emergency_avg_response or "",
            eval_obj.weighted_score or "",
            "",
            eval_obj.employee_id,
        ])

    def _row_to_monthly(self, row: dict) -> MonthlyEvaluation:
        return MonthlyEvaluation(
            employee_id=str(row.get("employee_id", "")),
            year_month=str(row.get("월", "")),
            total_assigned=int(row.get("총배정") or 0),
            on_time_completed=int(row.get("정시완료") or 0),
            late_completed=int(row.get("지연완료") or 0),
            incomplete=int(row.get("미완료") or 0),
            weighted_score=float(row.get("종합점수") or 0),
        )

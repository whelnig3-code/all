"""
안평리 숙주 재배 리포트 생성기 v6.0 - GUI 모듈.

CustomTkinter 기반 단일 화면 인터페이스.
계산 로직을 포함하지 않으며, 엔진 파이프라인을 호출만 한다.
"""

import logging
import os
import threading
from tkinter import filedialog, messagebox

import customtkinter as ctk

from engine import run_pipeline, PipelineError

logger = logging.getLogger("anpyeong")


class ReportGeneratorApp(ctk.CTk):
    """메인 애플리케이션 윈도우."""

    APP_TITLE = "안평리 숙주 재배 리포트 생성기 v6.0"
    WINDOW_WIDTH = 640
    WINDOW_HEIGHT = 520

    def __init__(self):
        super().__init__()

        # 테마 설정
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")

        self.title(self.APP_TITLE)
        self.geometry(f"{self.WINDOW_WIDTH}x{self.WINDOW_HEIGHT}")
        self.resizable(False, False)
        self._center_window()

        # 기본 저장 위치
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        self.default_root_dir = os.path.join(desktop, "재배리포트")

        # 상태 변수
        self.selected_files = []
        self.is_running = False

        # UI 구성
        self._build_ui()

    def _center_window(self):
        """윈도우를 화면 중앙에 배치한다."""
        self.update_idletasks()
        x = (self.winfo_screenwidth() - self.WINDOW_WIDTH) // 2
        y = (self.winfo_screenheight() - self.WINDOW_HEIGHT) // 2
        self.geometry(f"+{x}+{y}")

    def _build_ui(self):
        """UI 위젯을 구성한다."""
        # 메인 프레임
        main_frame = ctk.CTkFrame(self, fg_color="transparent")
        main_frame.pack(fill="both", expand=True, padx=30, pady=20)

        # 1. 제목
        title_label = ctk.CTkLabel(
            main_frame,
            text="안평리 숙주 재배 리포트 생성기 v6.0",
            font=ctk.CTkFont(size=22, weight="bold"),
        )
        title_label.pack(pady=(0, 20))

        # 2. 파일 선택 영역
        file_frame = ctk.CTkFrame(main_frame)
        file_frame.pack(fill="x", pady=(0, 12))

        self.file_btn = ctk.CTkButton(
            file_frame,
            text="데이터 파일 선택",
            command=self._on_select_files,
            width=160,
            height=36,
        )
        self.file_btn.pack(side="left", padx=(12, 8), pady=10)

        self.file_label = ctk.CTkLabel(
            file_frame,
            text="선택된 파일 없음",
            text_color="gray",
            anchor="w",
        )
        self.file_label.pack(side="left", fill="x", expand=True, padx=(0, 12))

        # 3. 저장 위치 영역
        save_frame = ctk.CTkFrame(main_frame)
        save_frame.pack(fill="x", pady=(0, 12))

        save_label = ctk.CTkLabel(save_frame, text="저장 위치:", anchor="w")
        save_label.pack(side="left", padx=(12, 8), pady=10)

        self.save_entry = ctk.CTkEntry(save_frame)
        self.save_entry.insert(0, self.default_root_dir)
        self.save_entry.pack(side="left", fill="x", expand=True, padx=(0, 8), pady=10)

        self.save_browse_btn = ctk.CTkButton(
            save_frame,
            text="찾아보기",
            command=self._on_browse_save,
            width=90,
            height=32,
        )
        self.save_browse_btn.pack(side="left", padx=(0, 12), pady=10)

        # 4. 리포트 생성 버튼
        self.gen_btn = ctk.CTkButton(
            main_frame,
            text="리포트 생성",
            command=self._on_generate,
            height=44,
            font=ctk.CTkFont(size=16, weight="bold"),
            fg_color="#2E86C1",
            hover_color="#1B6CA8",
        )
        self.gen_btn.pack(fill="x", pady=(0, 12))

        # 5. 진행바
        self.progress_bar = ctk.CTkProgressBar(main_frame, height=16)
        self.progress_bar.pack(fill="x", pady=(0, 8))
        self.progress_bar.set(0)

        self.progress_label = ctk.CTkLabel(
            main_frame, text="대기 중", text_color="gray",
            font=ctk.CTkFont(size=12),
        )
        self.progress_label.pack(pady=(0, 8))

        # 6. 상태 메시지 영역
        self.status_text = ctk.CTkTextbox(
            main_frame, height=120, font=ctk.CTkFont(size=12),
            state="disabled",
        )
        self.status_text.pack(fill="x", pady=(0, 8))

        # 7. 하단 자산 고지
        asset_label = ctk.CTkLabel(
            main_frame,
            text="※ 본 리포트는 농업회사법인 재우의 자산입니다.",
            font=ctk.CTkFont(size=11),
            text_color="#7F8C8D",
        )
        asset_label.pack(pady=(0, 4))

    # ─── 이벤트 핸들러 ──────────────────────────────────

    def _on_select_files(self):
        """파일 선택 다이얼로그를 열고 결과를 표시한다."""
        files = filedialog.askopenfilenames(
            title="데이터 엑셀 파일을 선택하세요 (다중 선택 가능)",
            filetypes=[
                ("Excel / CSV 파일", "*.xls;*.xlsx;*.csv;*.html"),
                ("모든 파일", "*.*"),
            ],
        )
        if files:
            self.selected_files = list(files)
            count = len(self.selected_files)
            names = ", ".join(os.path.basename(f) for f in self.selected_files[:3])
            if count > 3:
                names += f" 외 {count - 3}개"
            self.file_label.configure(text=f"{count}개 파일: {names}", text_color="black")

    def _on_browse_save(self):
        """저장 위치 선택 다이얼로그."""
        current = self.save_entry.get().strip()
        if not current:
            current = self.default_root_dir
        folder = filedialog.askdirectory(
            title="저장 위치를 선택하세요",
            initialdir=current,
        )
        if folder:
            self.save_entry.delete(0, "end")
            self.save_entry.insert(0, folder)

    def _on_generate(self):
        """리포트 생성을 시작한다."""
        if self.is_running:
            return

        if not self.selected_files:
            messagebox.showwarning("알림", "데이터 파일을 먼저 선택하세요.")
            return

        root_dir = self.save_entry.get().strip()
        if not root_dir:
            root_dir = self.default_root_dir

        os.makedirs(root_dir, exist_ok=True)

        # UI 잠금
        self.is_running = True
        self.gen_btn.configure(state="disabled", text="생성 중...")
        self.file_btn.configure(state="disabled")
        self.save_entry.configure(state="disabled")
        self.save_browse_btn.configure(state="disabled")
        self.progress_bar.set(0)
        self._clear_status()
        self._log("리포트 생성을 시작합니다...")

        # 백그라운드 스레드에서 실행
        thread = threading.Thread(
            target=self._run_generation,
            args=(list(self.selected_files), root_dir),
            daemon=True,
        )
        thread.start()

    def _run_generation(self, files, root_dir):
        """백그라운드 스레드: 파일별 파이프라인 실행."""
        total = len(files)
        success_count = 0

        try:
            for idx, file_path in enumerate(files, 1):
                filename = os.path.basename(file_path)
                self._log(f"\n[{idx}/{total}] 처리 중: {filename}")

                def progress_cb(pct, msg):
                    overall = ((idx - 1) / total + pct / 100 / total) * 100
                    self.after(0, self._update_progress, overall / 100, msg)

                try:
                    success, out_path, message = run_pipeline(
                        file_path, 150, root_dir,
                        progress_callback=progress_cb,
                    )
                    if success:
                        success_count += 1
                        self._log(f"  [성공] {message}")
                    else:
                        self._log(f"  [실패] {message}")

                except PermissionError as e:
                    logger.error(f"PermissionError: {filename} - {e}")
                    self._log(f"  [실패] 파일 접근 오류: 출력 파일이 열려 있습니다.")
                    self._log(f"         파일을 닫고 다시 시도하세요.")
                except PipelineError as e:
                    logger.error(f"PipelineError: {filename} - {e}")
                    self._log(f"  [실패] {e}")
                except MemoryError:
                    logger.critical(f"MemoryError: {filename}")
                    self._log(f"  [실패] 메모리 부족. 다른 프로그램을 종료하세요.")
                except Exception as e:
                    logger.exception(f"예상치 못한 오류: {filename}")
                    self._log(f"  [실패] 예상치 못한 오류: {type(e).__name__}: {e}")

        except Exception as e:
            logger.critical(f"스레드 치명적 오류: {type(e).__name__}: {e}", exc_info=True)
            self._log(f"\n[오류] 예상치 못한 문제가 발생했습니다. 로그를 확인하세요.")
        finally:
            self.after(0, self._on_complete, total, success_count, root_dir)

    # ─── UI 업데이트 (메인 스레드) ─────────────────────────

    def _update_progress(self, value, message):
        """진행바와 상태 라벨을 업데이트한다."""
        self.progress_bar.set(min(value, 1.0))
        self.progress_label.configure(text=message, text_color="black")

    def _log(self, message):
        """상태 텍스트 영역에 메시지를 추가한다."""
        def _append():
            self.status_text.configure(state="normal")
            self.status_text.insert("end", message + "\n")
            self.status_text.see("end")
            self.status_text.configure(state="disabled")
        self.after(0, _append)

    def _clear_status(self):
        """상태 텍스트 영역을 초기화한다."""
        self.status_text.configure(state="normal")
        self.status_text.delete("1.0", "end")
        self.status_text.configure(state="disabled")

    def _on_complete(self, total, success, root_dir):
        """생성 완료 후 UI를 복원한다."""
        self.is_running = False
        self.gen_btn.configure(state="normal", text="리포트 생성")
        self.file_btn.configure(state="normal")
        self.save_entry.configure(state="normal")
        self.save_browse_btn.configure(state="normal")
        self.progress_bar.set(1.0)
        self.progress_label.configure(text="완료!", text_color="#27AE60")

        self._log(f"\n{'='*40}")
        self._log(f"총 {total}개 중 {success}개 성공")
        self._log(f"저장 위치: {root_dir}")

        messagebox.showinfo(
            "작업 완료",
            f"총 {total}개 중 {success}개의 리포트가 생성되었습니다.\n\n"
            f"저장 위치:\n{root_dir}",
        )

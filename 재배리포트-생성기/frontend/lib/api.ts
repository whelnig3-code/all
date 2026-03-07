/**
 * 수남리 리포트 API 클라이언트
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface BatchItem {
  filename: string;
  path: string;
  size_kb: number;
  created_at: number;
}

/** 공장 자동 감지 결과 */
export interface FactoryDetection {
  factory: "anpyeong" | "sunamri" | "unknown";
  confidence: "high" | "medium" | "low";
  score_anpyeong: number;
  score_sunamri: number;
  reasons: string[];
  warning: string | null;
}

/** 빠른 공장 감지 결과 (full pipeline 없이) */
export interface DetectResult {
  factory: "anpyeong" | "sunamri" | "unknown";
  confidence: "high" | "medium" | "low";
  score_anpyeong: number;
  score_sunamri: number;
  reasons: string[];
  limit_prod: number;
  limit_co2: number;
}

/** 파일만 올려서 공장 종류 + 권장 임계값 빠르게 감지 */
export async function detectFactory(file: File): Promise<DetectResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/batches/detect`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    // 감지 실패 시 수남리 기본값 반환 (치명적 오류 아님)
    return { factory: "unknown", confidence: "low", score_anpyeong: 0, score_sunamri: 0, reasons: [], limit_prod: 27.0, limit_co2: 6000.0 };
  }
  return res.json();
}

export interface UploadResult {
  success: boolean;
  message: string;
  output_path: string;
  filename: string;
  n_trays: number;
  progress: { pct: number; msg: string }[];
  factory_detection?: FactoryDetection;
}

export interface BatchListResult {
  batches: BatchItem[];
  total: number;
}

/** 센서 데이터 파일 업로드 및 분석 실행 */
export async function uploadAndAnalyze(
  file: File,
  nTrays: number,
  onProgress?: (pct: number, msg: string) => void,
  factory: "auto" | "sunamri" | "anpyeong" = "auto",
  limitProd: number = 27.0,
  limitCo2: number = 6000.0
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("n_trays", String(nTrays));
  form.append("factory", factory);
  form.append("limit_prod", String(limitProd));
  form.append("limit_co2", String(limitCo2));

  const res = await fetch(`${API_BASE}/api/batches/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "업로드 실패");
  }

  const data: UploadResult = await res.json();

  // 진행 로그 콜백
  if (onProgress && data.progress) {
    for (const p of data.progress) {
      onProgress(p.pct, p.msg);
    }
  }

  return data;
}

/** 완료된 배치 목록 조회 */
export async function listBatches(): Promise<BatchListResult> {
  const res = await fetch(`${API_BASE}/api/batches`);
  if (!res.ok) throw new Error("목록 조회 실패");
  return res.json();
}

/** 리포트 다운로드 URL 반환 */
export function getReportDownloadUrl(filePath: string): string {
  return `${API_BASE}/api/report/download?path=${encodeURIComponent(filePath)}`;
}

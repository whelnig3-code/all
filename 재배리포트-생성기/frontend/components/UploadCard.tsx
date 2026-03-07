"use client";

import { useState, useRef, useEffect } from "react";
import { uploadAndAnalyze, detectFactory } from "@/lib/api";

interface FactoryDetection {
  factory: "anpyeong" | "sunamri" | "unknown";
  confidence: "high" | "medium" | "low";
  score_anpyeong: number;
  score_sunamri: number;
  reasons: string[];
  warning: string | null;
}

interface UploadResult {
  filename: string;
  path: string;
  factory_detection?: FactoryDetection;
}

/** 큐 아이템 — 파일별 독립 설정 포함 */
interface QueueItem {
  file: File;
  status: "waiting" | "detecting" | "running" | "done" | "error";
  factory: "auto" | "sunamri" | "anpyeong";
  detectedFactory?: "anpyeong" | "sunamri" | "unknown";
  detectedConfidence?: "high" | "medium" | "low";
  nTrays: number;
  limitProd: number;
  limitCo2: number;
  result?: UploadResult;
  error?: string;
  progress?: number;
  progressMsg?: string;
  settingsOpen?: boolean;
}

interface UploadCardProps {
  onSuccess?: () => void;
}

const FACTORY_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  sunamri:  { label: "수남리", color: "text-blue-700",   emoji: "🏭" },
  anpyeong: { label: "안평리", color: "text-orange-600", emoji: "🏗️" },
  unknown:  { label: "미확정", color: "text-gray-400",   emoji: "❓" },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high:   "높음",
  medium: "보통",
  low:    "낮음",
};

const FACTORY_DEFAULTS: Record<string, { limitProd: number; limitCo2: number }> = {
  auto:     { limitProd: 27.0, limitCo2: 6000 },
  sunamri:  { limitProd: 27.0, limitCo2: 6000 },
  anpyeong: { limitProd: 28.0, limitCo2: 10000 },
  unknown:  { limitProd: 27.0, limitCo2: 6000 },
};

/** 일괄 설정 패널용 공장 표시 정보 */
const FACTORY_INFO_GLOBAL = {
  sunamri:  { label: "수남리", emoji: "🏭", color: "text-blue-700",   bg: "bg-blue-50",   btnCls: "bg-blue-600 hover:bg-blue-700" },
  anpyeong: { label: "안평리", emoji: "🏗️", color: "text-orange-600", bg: "bg-orange-50", btnCls: "bg-orange-500 hover:bg-orange-600" },
};

const VALID_EXT = /\.(xls|xlsx|csv)$/i;

// ── 폴더 내 파일을 재귀적으로 읽는 헬퍼 ──────────────────────────
async function readDirectoryEntry(
  entry: FileSystemDirectoryEntry
): Promise<File[]> {
  const files: File[] = [];
  const reader = entry.createReader();

  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((res, rej) => reader.readEntries(res, rej));

  // readEntries는 한 번에 최대 100개씩 반환하므로 빈 배열이 올 때까지 반복
  let batch: FileSystemEntry[];
  do {
    batch = await readBatch();
    for (const e of batch) {
      if (e.isFile) {
        const file = await new Promise<File>((res) =>
          (e as FileSystemFileEntry).file(res)
        );
        if (VALID_EXT.test(file.name)) files.push(file);
      } else if (e.isDirectory) {
        const sub = await readDirectoryEntry(e as FileSystemDirectoryEntry);
        files.push(...sub);
      }
    }
  } while (batch.length > 0);

  return files;
}

/** 공장별 전체 일괄 설정 */
interface GlobalSettings {
  nTrays: number;
  limitProd: number;
  limitCo2: number;
}

const GLOBAL_DEFAULTS: Record<"sunamri" | "anpyeong", GlobalSettings> = {
  sunamri:  { nTrays: 20, limitProd: 27.0, limitCo2: 6000 },
  anpyeong: { nTrays: 20, limitProd: 28.0, limitCo2: 10000 },
};

export default function UploadCard({ onSuccess }: UploadCardProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<Record<"sunamri" | "anpyeong", GlobalSettings>>({
    sunamri:  { ...GLOBAL_DEFAULTS.sunamri },
    anpyeong: { ...GLOBAL_DEFAULTS.anpyeong },
  });

  const fileRef   = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // webkitdirectory는 TypeScript 타입에 없으므로 ref로 직접 세팅
  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute("webkitdirectory", "");
      folderRef.current.setAttribute("directory", "");
    }
  }, []);

  /** 파일 배열 → 큐에 추가 + 즉시 공장 자동 감지 */
  const addFiles = async (files: File[]) => {
    const existing = new Set(queue.map((q) => q.file.name));
    const newFiles = files.filter((f) => !existing.has(f.name));
    if (newFiles.length === 0) return;

    const newItems: QueueItem[] = newFiles.map((f) => ({
      file: f,
      status: "detecting" as const,
      factory: "auto",
      nTrays: 20,
      limitProd: 27.0,
      limitCo2: 6000,
    }));
    setQueue((prev) => [...prev, ...newItems]);

    for (const file of newFiles) {
      detectFactory(file)
        .then((res) => {
          const defaults = FACTORY_DEFAULTS[res.factory] ?? FACTORY_DEFAULTS.unknown;
          setQueue((prev) =>
            prev.map((q) =>
              q.file.name === file.name && q.status === "detecting"
                ? {
                    ...q,
                    status: "waiting" as const,
                    detectedFactory: res.factory,
                    detectedConfidence: res.confidence,
                    limitProd: res.limit_prod ?? defaults.limitProd,
                    limitCo2: res.limit_co2 ?? defaults.limitCo2,
                  }
                : q
            )
          );
        })
        .catch(() => {
          setQueue((prev) =>
            prev.map((q) =>
              q.file.name === file.name && q.status === "detecting"
                ? { ...q, status: "waiting" as const, detectedFactory: "unknown" }
                : q
            )
          );
        });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      VALID_EXT.test(f.name)
    );
    if (files.length > 0) addFiles(files);
    e.target.value = "";
  };

  /** 파일 드롭 — 폴더 드롭도 지원 (webkitGetAsEntry 재귀 탐색) */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files: File[] = [];
    const items = Array.from(e.dataTransfer.items);

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        // 📁 폴더 → 재귀적으로 xls/xlsx/csv 수집
        const dirFiles = await readDirectoryEntry(
          entry as FileSystemDirectoryEntry
        );
        files.push(...dirFiles);
      } else if (entry?.isFile) {
        const file = await new Promise<File>((res) =>
          (entry as FileSystemFileEntry).file(res)
        );
        if (VALID_EXT.test(file.name)) files.push(file);
      } else {
        // 폴백: getAsFile()
        const file = item.getAsFile();
        if (file && VALID_EXT.test(file.name)) files.push(file);
      }
    }

    if (files.length > 0) addFiles(files);
  };

  /** 공장별 전체 일괄 적용 */
  const applyGlobalSettings = (factory: "sunamri" | "anpyeong") => {
    const s = globalSettings[factory];
    setQueue((prev) =>
      prev.map((q) => {
        // waiting 상태이고 해당 공장으로 감지된 파일에만 적용
        if (q.status !== "waiting") return q;
        if (q.detectedFactory !== factory) return q;
        return { ...q, nTrays: s.nTrays, limitProd: s.limitProd, limitCo2: s.limitCo2 };
      })
    );
  };

  const updateGlobal = (
    factory: "sunamri" | "anpyeong",
    patch: Partial<GlobalSettings>
  ) => {
    setGlobalSettings((prev) => ({
      ...prev,
      [factory]: { ...prev[factory], ...patch },
    }));
  };

  const removeItem = (idx: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleRunAll = async () => {
    const hasWaiting = queue.some((q) => q.status === "waiting");
    if (!hasWaiting || running) return;

    setRunning(true);

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "detecting") {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (queue[i].status !== "waiting") continue;

      const item = queue[i];
      setQueue((prev) =>
        prev.map((q, idx) =>
          idx === i
            ? { ...q, status: "running" as const, progress: 0, progressMsg: "분석 준비 중...", settingsOpen: false }
            : q
        )
      );

      try {
        const data = await uploadAndAnalyze(
          item.file,
          item.nTrays,
          (pct, msg) => {
            setQueue((prev) =>
              prev.map((q, idx) =>
                idx === i ? { ...q, progress: pct, progressMsg: msg } : q
              )
            );
          },
          item.factory,
          item.limitProd,
          item.limitCo2
        );

        setQueue((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? {
                  ...q,
                  status: "done" as const,
                  result: {
                    filename: data.filename,
                    path: data.output_path,
                    factory_detection: data.factory_detection,
                  },
                }
              : q
          )
        );
        onSuccess?.();
      } catch (err: unknown) {
        setQueue((prev) =>
          prev.map((q, idx) =>
            idx === i
              ? {
                  ...q,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "알 수 없는 오류",
                }
              : q
          )
        );
      }
    }

    setRunning(false);
  };

  const waitingCount = queue.filter((q) => q.status === "waiting").length;

  return (
    <div className="bg-white rounded-2xl shadow-md p-6 w-full max-w-xl">
      <h2 className="text-lg font-bold text-gray-800 mb-4">📂 센서 데이터 업로드</h2>

      <div className="space-y-4">
        {/* 드롭존 */}
        <div
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-blue-300 hover:bg-blue-50"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
        >
          {/* 숨김 input — 파일 선택 */}
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {/* 숨김 input — 폴더 선택 (webkitdirectory는 useEffect로 세팅) */}
          <input
            ref={folderRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <p className="text-sm text-gray-400 mb-3">
            파일 또는 <span className="font-semibold text-blue-500">폴더</span>를 여기에 드래그하세요
            <br />
            <span className="text-xs">.xls / .xlsx / .csv · 폴더 내 하위 폴더까지 자동 탐색</span>
          </p>

          {/* 버튼 2개 나란히 */}
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 font-medium"
            >
              📄 파일 선택
            </button>
            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-lg border border-green-300 text-green-700 hover:bg-green-50 font-medium"
            >
              📁 폴더 선택
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-2">
            파일 추가 후 각 항목의 <span className="font-semibold">⚙ 설정</span> 버튼으로 시루수 · 경고치 변경 가능
          </p>
        </div>

        {/* 공장별 일괄 설정 패널 */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setGlobalPanelOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-600 transition-colors"
          >
            <span>🔧 공장별 일괄 설정</span>
            <span className="text-gray-400 text-xs">{globalPanelOpen ? "▲ 접기" : "▼ 펼치기"}</span>
          </button>

          {globalPanelOpen && (
            <div className="divide-y divide-gray-100">
              {(["sunamri", "anpyeong"] as const).map((factory) => {
                const fi = FACTORY_INFO_GLOBAL[factory];
                const s  = globalSettings[factory];
                const matchCount = queue.filter(
                  (q) => q.status === "waiting" && q.detectedFactory === factory
                ).length;
                return (
                  <div key={factory} className={`px-3 py-2.5 ${fi.bg}`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{fi.emoji}</span>
                      <span className={`text-xs font-bold ${fi.color}`}>{fi.label}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        대기 파일 {matchCount}개
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        시루
                        <input
                          type="number" min={10} max={20}
                          value={s.nTrays}
                          onChange={(e) => updateGlobal(factory, { nTrays: Number(e.target.value) })}
                          className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-gray-400">개</span>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        품온
                        <input
                          type="number" min={20} max={40} step={0.5}
                          value={s.limitProd}
                          onChange={(e) => updateGlobal(factory, { limitProd: Number(e.target.value) })}
                          className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-gray-400">℃</span>
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        CO2
                        <input
                          type="number" min={1000} max={30000} step={100}
                          value={s.limitCo2}
                          onChange={(e) => updateGlobal(factory, { limitCo2: Number(e.target.value) })}
                          className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <span className="text-gray-400">ppm</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => applyGlobalSettings(factory)}
                        disabled={matchCount === 0}
                        className={`ml-auto px-3 py-1 rounded-lg text-xs font-semibold text-white transition-colors ${fi.btnCls} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        전체 적용 ({matchCount})
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 파일 목록 */}
        {queue.length > 0 && (
          <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {queue.map((item, idx) => (
              <li
                key={idx}
                className="border border-gray-200 rounded-xl overflow-hidden text-sm"
              >
                {/* 파일 헤더 행 */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="shrink-0">{statusIcon(item.status)}</span>
                  <span className="font-medium text-gray-700 break-all leading-tight flex-1 min-w-0">
                    {item.file.name}
                  </span>

                  {/* 감지된 공장 배지 */}
                  {item.detectedFactory && item.status !== "detecting" && (
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        FACTORY_LABELS[item.detectedFactory]?.color ?? "text-gray-400"
                      }`}
                    >
                      {FACTORY_LABELS[item.detectedFactory]?.emoji}{" "}
                      {FACTORY_LABELS[item.detectedFactory]?.label}
                      {item.detectedConfidence && (
                        <span className="font-normal text-gray-400 ml-0.5">
                          ({CONFIDENCE_LABELS[item.detectedConfidence]})
                        </span>
                      )}
                    </span>
                  )}

                  {/* 설정 토글 (대기 중만) */}
                  {item.status === "waiting" && !running && (
                    <button
                      onClick={() => updateItem(idx, { settingsOpen: !item.settingsOpen })}
                      className={`shrink-0 text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                        item.settingsOpen
                          ? "bg-blue-100 border-blue-300 text-blue-700"
                          : "bg-gray-100 border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                      }`}
                      title="시루수·경고치 설정"
                    >
                      ⚙ 설정
                    </button>
                  )}

                  {/* 제거 버튼 */}
                  {(item.status === "waiting" || item.status === "detecting") && !running && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="shrink-0 text-gray-300 hover:text-red-500 text-base leading-none"
                      title="제거"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* 대기 중 설정값 요약 */}
                {item.status === "waiting" && !item.settingsOpen && (
                  <div className="px-3 pb-1.5 text-xs text-gray-400">
                    시루 {item.nTrays}개 · 품온 {item.limitProd}℃ · CO2 {item.limitCo2.toLocaleString()}ppm
                  </div>
                )}

                {/* 파일별 설정 패널 */}
                {item.settingsOpen && item.status === "waiting" && (
                  <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20 shrink-0">공장</label>
                      <select
                        value={item.factory}
                        onChange={(e) => {
                          const val = e.target.value as "auto" | "sunamri" | "anpyeong";
                          const d = FACTORY_DEFAULTS[val] ?? FACTORY_DEFAULTS.auto;
                          updateItem(idx, { factory: val, limitProd: d.limitProd, limitCo2: d.limitCo2 });
                        }}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="auto">🔍 자동 감지</option>
                        <option value="sunamri">🏭 수남리</option>
                        <option value="anpyeong">🏗️ 안평리</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20 shrink-0">시루 개수</label>
                      <input
                        type="number" min={10} max={20}
                        value={item.nTrays}
                        onChange={(e) => updateItem(idx, { nTrays: Number(e.target.value) })}
                        className="w-20 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-400">개 (10~20)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20 shrink-0">품온 상한</label>
                      <input
                        type="number" min={20} max={40} step={0.5}
                        value={item.limitProd}
                        onChange={(e) => updateItem(idx, { limitProd: Number(e.target.value) })}
                        className="w-20 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-400">℃</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-20 shrink-0">CO2 상한</label>
                      <input
                        type="number" min={1000} max={30000} step={100}
                        value={item.limitCo2}
                        onChange={(e) => updateItem(idx, { limitCo2: Number(e.target.value) })}
                        className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-400">ppm</span>
                    </div>
                    <p className="text-xs text-blue-500 pt-0.5">
                      적용: 시루 {item.nTrays}개 · 품온 {item.limitProd}℃ · CO2 {item.limitCo2.toLocaleString()}ppm
                    </p>
                  </div>
                )}

                {/* 진행 바 */}
                {item.status === "running" && (
                  <div className="px-3 pb-2 space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{item.progressMsg}</span>
                      <span>{item.progress ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 완료 결과 */}
                {item.status === "done" && item.result && (
                  <div className="px-3 pb-2 text-xs text-green-700">
                    ✅ {item.result.filename} 생성 완료
                    {item.result.factory_detection && (
                      <FactoryBadge detection={item.result.factory_detection} />
                    )}
                  </div>
                )}

                {/* 오류 */}
                {item.status === "error" && (
                  <div className="px-3 pb-2 text-xs text-red-600">❌ {item.error}</div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* 실행 버튼 */}
        <button
          onClick={handleRunAll}
          disabled={waitingCount === 0 || running}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running
            ? "분석 중..."
            : waitingCount > 0
            ? `분석 실행 (${waitingCount}개 파일)`
            : "파일을 추가하세요"}
        </button>
      </div>
    </div>
  );
}

function statusIcon(status: QueueItem["status"]) {
  if (status === "detecting") return "🔍";
  if (status === "waiting")   return "⏳";
  if (status === "running")   return "⚙️";
  if (status === "done")      return "✅";
  return "❌";
}

function FactoryBadge({ detection }: { detection: FactoryDetection }) {
  const info = FACTORY_LABELS[detection.factory];
  if (!info) return null;
  return (
    <span className={`ml-1 font-semibold ${info.color}`}>
      {info.emoji} {info.label} ({CONFIDENCE_LABELS[detection.confidence] ?? detection.confidence})
    </span>
  );
}

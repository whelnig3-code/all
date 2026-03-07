"use client";

import { useEffect, useState } from "react";
import { listBatches, getReportDownloadUrl, BatchItem } from "@/lib/api";

interface BatchListProps {
  refreshKey?: number;
}

/** 경로에서 공장 구분 */
function detectFactoryFromPath(path: string): "anpyeong" | "sunamri" {
  return path.includes("안평리") ? "anpyeong" : "sunamri";
}

const FACTORY_INFO = {
  sunamri:  { label: "수남리",  emoji: "🏭", color: "text-blue-700",   border: "border-blue-200",   bg: "bg-blue-50",   tab: "bg-blue-600 text-white", tabInact: "text-blue-600 hover:bg-blue-50" },
  anpyeong: { label: "안평리",  emoji: "🏗️", color: "text-orange-600", border: "border-orange-200", bg: "bg-orange-50", tab: "bg-orange-500 text-white", tabInact: "text-orange-500 hover:bg-orange-50" },
};

export default function BatchList({ refreshKey }: BatchListProps) {
  const [batches, setBatches]   = useState<BatchItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"sunamri" | "anpyeong">("sunamri");

  useEffect(() => {
    setLoading(true);
    listBatches()
      .then((data) => setBatches(data.batches))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <p className="text-sm text-gray-400 py-4 text-center">목록 불러오는 중...</p>;
  if (error)   return <p className="text-sm text-red-500 py-4 text-center">{error}</p>;

  const sunamriBatches  = batches.filter((b) => detectFactoryFromPath(b.path) === "sunamri");
  const anpyeongBatches = batches.filter((b) => detectFactoryFromPath(b.path) === "anpyeong");

  const counts = { sunamri: sunamriBatches.length, anpyeong: anpyeongBatches.length };
  const activeBatches = activeTab === "sunamri" ? sunamriBatches : anpyeongBatches;
  const info = FACTORY_INFO[activeTab];

  return (
    <div>
      {/* 탭 버튼 */}
      <div className="flex gap-2 mb-3">
        {(["sunamri", "anpyeong"] as const).map((tab) => {
          const fi = FACTORY_INFO[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive ? fi.tab : `bg-white border ${fi.border} ${fi.tabInact}`
              }`}
            >
              <span>{fi.emoji}</span>
              <span>{fi.label}</span>
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-normal ${isActive ? "bg-white/25" : fi.bg + " " + fi.color}`}>
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 리포트 목록 */}
      {activeBatches.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          {info.emoji} {info.label} 리포트가 없습니다.<br />
          <span className="text-xs">파일을 업로드하면 여기에 표시됩니다.</span>
        </p>
      ) : (
        <div className="space-y-2">
          {activeBatches.map((b) => (
            <BatchRow key={b.path} batch={b} factory={activeTab} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRow({ batch, factory }: { batch: BatchItem; factory: "sunamri" | "anpyeong" }) {
  const createdDate = new Date(batch.created_at * 1000).toLocaleString("ko-KR");
  const btnCls = factory === "anpyeong"
    ? "bg-orange-500 hover:bg-orange-600"
    : "bg-blue-600 hover:bg-blue-700";

  return (
    <div className="flex items-center justify-between bg-gray-50 hover:bg-blue-50 rounded-xl px-4 py-3 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{batch.filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {createdDate} · {batch.size_kb} KB
        </p>
      </div>
      <a
        href={getReportDownloadUrl(batch.path)}
        download={batch.filename}
        className={`ml-3 shrink-0 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors ${btnCls}`}
      >
        다운로드
      </a>
    </div>
  );
}

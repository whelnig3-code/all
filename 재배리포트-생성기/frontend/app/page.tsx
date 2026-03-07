"use client";

import { useState } from "react";
import UploadCard from "@/components/UploadCard";
import BatchList from "@/components/BatchList";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      {/* 업로드 섹션 */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          파일 업로드 및 분석
        </h2>
        <UploadCard onSuccess={() => setRefreshKey((k) => k + 1)} />
      </section>

      {/* 리포트 목록 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            생성된 리포트
          </h2>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            새로고침
          </button>
        </div>
        <div className="bg-white rounded-2xl shadow-md p-4">
          <BatchList refreshKey={refreshKey} />
        </div>
      </section>
    </div>
  );
}

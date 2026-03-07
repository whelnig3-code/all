"use client";

import { useState } from "react";
import { T } from "@/lib/ui-tokens";
import type { CustomAgentConfig } from "@/types/custom-agent";

// ─── 프리셋 ───────────────────────────────────────────────────────────────────
const ICON_PRESETS = [
  "🧪", "🔧", "🎯", "🚀", "💡", "🔬", "📊", "🎭",
  "🛡️", "⚙️", "📡", "🧠", "🎪", "🔥", "💎", "🦾",
  "🤖", "📐", "🧩", "🎲",
];

const COLOR_PRESETS = [
  "#EF4444", "#F97316", "#F59E0B", "#22C55E",
  "#10B981", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E",
];

const MODEL_OPTIONS = [
  { value: "sonnet", label: "Sonnet (빠름)" },
  { value: "opus", label: "Opus (정밀)" },
  { value: "haiku", label: "Haiku (경량)" },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface CustomAgentFormProps {
  readonly editAgent?: CustomAgentConfig | null;
  readonly onSave: (data: {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    model: string;
    systemPrompt: string;
  }) => void;
  readonly onCancel: () => void;
}

/** 이름을 kebab-case ID로 변환 */
function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/[가-힣]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export default function CustomAgentForm({
  editAgent,
  onSave,
  onCancel,
}: CustomAgentFormProps) {
  const [id, setId] = useState(editAgent?.id ?? "");
  const [name, setName] = useState(editAgent?.name ?? "");
  const [icon, setIcon] = useState(editAgent?.icon ?? "🤖");
  const [color, setColor] = useState(editAgent?.color ?? "#6366F1");
  const [description, setDescription] = useState(editAgent?.description ?? "");
  const [model, setModel] = useState(editAgent?.model ?? "sonnet");
  const [systemPrompt, setSystemPrompt] = useState(editAgent?.systemPrompt ?? "");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [customIcon, setCustomIcon] = useState("");

  const isEdit = !!editAgent;
  const isValid =
    id.length >= 3 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) &&
    name.trim().length > 0 &&
    icon.length > 0 &&
    description.trim().length > 0 &&
    systemPrompt.length >= 10;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEdit) {
      setId(toKebabCase(value));
    }
  };

  const handleSave = () => {
    if (!isValid) return;
    onSave({ id, name, icon, color, description, model, systemPrompt });
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    padding: "7px 10px",
    color: T.text1,
    fontSize: 12,
    outline: "none",
  };

  return (
    <div style={{
      background: "#111115",
      border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: 10,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, color: "#A5B4FC", fontWeight: 600, marginBottom: 14 }}>
        {isEdit ? "에이전트 수정" : "커스텀 에이전트 생성"}
      </div>

      {/* 이름 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          이름
        </label>
        <input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="예: QA 테스터"
          style={{ ...inputStyle, marginTop: 4 }}
        />
      </div>

      {/* ID */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          ID (kebab-case)
        </label>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="예: qa-tester"
          disabled={isEdit}
          style={{ ...inputStyle, marginTop: 4, opacity: isEdit ? 0.5 : 1 }}
        />
        {id && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) && (
          <div style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>
            소문자, 숫자, 하이픈만 사용 (3자 이상)
          </div>
        )}
      </div>

      {/* 아이콘 + 색상 (가로 배치) */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
        {/* 아이콘 */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            아이콘
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <button
              onClick={() => setShowIconPicker(!showIconPicker)}
              style={{
                width: 36, height: 36, fontSize: 20, border: `1px solid ${T.border}`,
                borderRadius: 8, background: "rgba(255,255,255,0.05)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {icon}
            </button>
            <input
              value={customIcon}
              onChange={(e) => { setCustomIcon(e.target.value); if (e.target.value) setIcon(e.target.value); }}
              placeholder="직접 입력"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          {showIconPicker && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {ICON_PRESETS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => { setIcon(ic); setShowIconPicker(false); }}
                  style={{
                    width: 28, height: 28, fontSize: 14, border: `1px solid ${icon === ic ? color : T.border}`,
                    borderRadius: 6, background: icon === ic ? `${color}22` : "rgba(255,255,255,0.03)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 색상 */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            색상
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: "50%", border: color === c ? "2px solid #fff" : "2px solid transparent",
                  background: c, cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 설명 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          설명
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="이 에이전트의 역할을 설명하세요"
          maxLength={200}
          style={{ ...inputStyle, marginTop: 4 }}
        />
      </div>

      {/* 모델 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          모델
        </label>
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setModel(opt.value)}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: `1px solid ${model === opt.value ? color : T.border}`,
                background: model === opt.value ? `${color}15` : "rgba(255,255,255,0.03)",
                color: model === opt.value ? color : T.text3,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 시스템 프롬프트 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            시스템 프롬프트
          </label>
          <span style={{ fontSize: 10, color: systemPrompt.length > 4500 ? "#EF4444" : T.text3 }}>
            {systemPrompt.length}/5000
          </span>
        </div>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="이 에이전트에게 부여할 역할과 지시사항을 작성하세요 (최소 10자)"
          maxLength={5000}
          rows={5}
          style={{ ...inputStyle, marginTop: 4, resize: "vertical", minHeight: 80, fontFamily: "monospace", lineHeight: 1.5 }}
        />
      </div>

      {/* 미리보기 카드 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, marginBottom: 14,
      }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{name || "이름 미입력"}</div>
          <div style={{ fontSize: 10, color: T.text3 }}>{description || "설명 미입력"}</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 9, color, textTransform: "uppercase" }}>{model}</div>
      </div>

      {/* 버튼 */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={!isValid}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: `1px solid ${isValid ? "rgba(99,102,241,0.4)" : T.border}`,
            background: isValid ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
            color: isValid ? "#A5B4FC" : T.text3,
            cursor: isValid ? "pointer" : "default",
          }}
        >
          {isEdit ? "수정" : "저장"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "8px 16px", borderRadius: 6, fontSize: 12,
            border: `1px solid ${T.border}`, background: "none",
            color: T.text3, cursor: "pointer",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

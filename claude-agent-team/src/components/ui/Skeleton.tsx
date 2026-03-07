"use client";

import React from "react";
import { T } from "@/lib/ui-tokens";

interface SkeletonProps {
  readonly width?: string | number;
  readonly height?: string | number;
  readonly borderRadius?: string;
  readonly className?: string;
  readonly variant?: "text" | "circular" | "rectangular";
  readonly count?: number;
}

export function Skeleton({
  width = "100%",
  height = "1em",
  borderRadius,
  className = "",
  variant = "text",
  count = 1,
}: SkeletonProps) {
  const resolvedRadius =
    borderRadius ??
    (variant === "circular" ? "50%" : variant === "text" ? "4px" : "8px");

  const baseStyle: React.CSSProperties = {
    width,
    height,
    borderRadius: resolvedRadius,
    backgroundColor: T.cardHover,
    animation: "skeleton-pulse 1.5s ease-in-out infinite",
    display: "block",
  };

  if (count === 1) {
    return <div className={`skeleton ${className}`} style={baseStyle} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton ${className}`} style={baseStyle} />
      ))}
    </div>
  );
}

/** Skeleton for a single chat message bubble (avatar + lines) */
export function SkeletonChatMessage() {
  return (
    <div style={{ display: "flex", gap: "12px", padding: "12px 16px" }}>
      <Skeleton variant="circular" width={36} height={36} />
      <div style={{ flex: 1 }}>
        <Skeleton width="30%" height="14px" />
        <div style={{ marginTop: "8px" }}>
          <Skeleton count={2} height="14px" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for a sidebar list item (small avatar + two text lines) */
export function SkeletonListItem() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 8px",
        borderRadius: 6,
        marginBottom: 2,
      }}
    >
      <Skeleton variant="circular" width={20} height={20} />
      <div style={{ flex: 1 }}>
        <Skeleton width="70%" height="12px" />
      </div>
    </div>
  );
}

/** Skeleton for an agent table row */
export function SkeletonAgentRow() {
  return (
    <tr>
      {/* icon */}
      <td
        style={{
          padding: "8px 4px 8px 20px",
          borderBottom: `1px solid ${T.border}22`,
        }}
      >
        <Skeleton variant="circular" width={24} height={24} />
      </td>
      {/* name */}
      <td
        style={{
          padding: "8px",
          borderBottom: `1px solid ${T.border}22`,
        }}
      >
        <Skeleton width="60%" height="12px" />
      </td>
      {/* description */}
      <td
        style={{
          padding: "8px",
          borderBottom: `1px solid ${T.border}22`,
        }}
      >
        <Skeleton width="80%" height="10px" />
      </td>
      {/* status */}
      <td
        style={{
          padding: "8px 12px 8px 8px",
          textAlign: "center",
          borderBottom: `1px solid ${T.border}22`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <Skeleton variant="circular" width={6} height={6} />
          <Skeleton width={28} height="10px" />
        </div>
      </td>
    </tr>
  );
}

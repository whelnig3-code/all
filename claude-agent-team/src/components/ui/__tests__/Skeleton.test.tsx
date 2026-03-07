import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton, SkeletonChatMessage, SkeletonListItem } from "../Skeleton";

describe("Skeleton", () => {
  it("renders a single skeleton element by default", () => {
    const { container } = render(<Skeleton />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons).toHaveLength(1);
  });

  it("renders multiple skeleton elements when count > 1", () => {
    const { container } = render(<Skeleton count={3} />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons).toHaveLength(3);
  });

  it("applies circular border radius for circular variant", () => {
    const { container } = render(<Skeleton variant="circular" width={40} height={40} />);
    expect(container.firstChild).toHaveStyle({ borderRadius: "50%" });
  });

  it("applies rectangular border radius for rectangular variant", () => {
    const { container } = render(<Skeleton variant="rectangular" />);
    expect(container.firstChild).toHaveStyle({ borderRadius: "8px" });
  });

  it("applies text border radius for text variant (default)", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveStyle({ borderRadius: "4px" });
  });

  it("applies custom width and height", () => {
    const { container } = render(<Skeleton width={200} height={16} />);
    expect(container.firstChild).toHaveStyle({ width: "200px", height: "16px" });
  });
});

describe("SkeletonChatMessage", () => {
  it("renders avatar and text skeletons", () => {
    const { container } = render(<SkeletonChatMessage />);
    const skeletons = container.querySelectorAll(".skeleton");
    // circular avatar + 1 header line + 2 body lines = 4
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("SkeletonListItem", () => {
  it("renders avatar and text skeleton", () => {
    const { container } = render(<SkeletonListItem />);
    const skeletons = container.querySelectorAll(".skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });
});

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders default label for each status", () => {
    const { rerender } = render(<Badge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<Badge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    rerender(<Badge status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();

    rerender(<Badge status="disabled" />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("renders custom label when provided", () => {
    render(<Badge status="active" label="Running" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("renders a status indicator dot", () => {
    const { container } = render(<Badge status="error" />);
    // The colored dot is a span with borderRadius 50%
    const dot = container.querySelector("span span");
    expect(dot).toHaveStyle({ borderRadius: "50%" });
  });
});

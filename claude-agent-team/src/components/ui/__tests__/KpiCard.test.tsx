import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "../KpiCard";

describe("KpiCard", () => {
  it("renders label and numeric value", () => {
    render(<KpiCard label="Active" value={5} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<KpiCard label="Status" value="OK" />);
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("renders zero value correctly", () => {
    render(<KpiCard label="Error" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("applies accent color to value", () => {
    render(<KpiCard label="Active" value={3} accent="#22C55E" />);
    const valueEl = screen.getByText("3");
    expect(valueEl).toHaveStyle({ color: "#22C55E" });
  });

  it("renders optional sub text when provided", () => {
    render(<KpiCard label="Done" value={10} sub="last 1h" />);
    expect(screen.getByText("last 1h")).toBeInTheDocument();
  });

  it("does not render sub text when omitted", () => {
    render(<KpiCard label="Idle" value={2} />);
    expect(screen.queryByText("last 1h")).not.toBeInTheDocument();
  });

  it("label has uppercase styling via className", () => {
    render(<KpiCard label="Test" value={1} />);
    const label = screen.getByText("Test");
    expect(label).toHaveClass("kpi-label");
  });
});

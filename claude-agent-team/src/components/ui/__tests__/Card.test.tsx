import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../Card";

describe("Card", () => {
  it("renders children content", () => {
    render(<Card><p>Hello World</p></Card>);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("applies custom padding", () => {
    const { container } = render(<Card padding={32}>Content</Card>);
    expect(container.firstChild).toHaveStyle({ padding: "32px" });
  });

  it("applies custom style prop", () => {
    const { container } = render(
      <Card style={{ marginTop: 10 }}>Content</Card>
    );
    expect(container.firstChild).toHaveStyle({ marginTop: "10px" });
  });
});

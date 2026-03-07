import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CommandPalette from "../CommandPalette";
import type { Agent } from "@/types";

const mockAgents: Agent[] = [
  {
    id: "developer",
    name: "Developer",
    description: "코드 작성",
    icon: "💻",
    systemPrompt: "",
    status: "idle",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "코드 리뷰",
    icon: "🔍",
    systemPrompt: "",
    status: "idle",
  },
  {
    id: "planner",
    name: "Planner",
    description: "계획 수립",
    icon: "📋",
    systemPrompt: "",
    status: "idle",
  },
];

describe("CommandPalette", () => {
  it("renders all agents in the list", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
  });

  it("filters agents by name", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    const input = screen.getByPlaceholderText("에이전트 선택... (Ctrl+K)");
    fireEvent.change(input, { target: { value: "dev" } });

    expect(screen.getByText("Developer")).toBeInTheDocument();
    expect(screen.queryByText("Reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Planner")).not.toBeInTheDocument();
  });

  it("filters agents by id", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    const input = screen.getByPlaceholderText("에이전트 선택... (Ctrl+K)");
    fireEvent.change(input, { target: { value: "planner" } });

    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.queryByText("Developer")).not.toBeInTheDocument();
  });

  it("calls onSelectAgent with agent id when clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    fireEvent.click(screen.getByText("Reviewer"));
    expect(onSelect).toHaveBeenCalledWith("reviewer");
  });

  it("calls onClose when Escape key is pressed", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    const input = screen.getByPlaceholderText("에이전트 선택... (Ctrl+K)");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    // backdrop = 최외곽 fixed div
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when inner dialog is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    // inner dialog = backdrop의 첫 번째 자식
    const dialog = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows agent descriptions", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette agents={mockAgents} onSelectAgent={onSelect} onClose={onClose} />
    );

    expect(screen.getByText("코드 작성")).toBeInTheDocument();
    expect(screen.getByText("코드 리뷰")).toBeInTheDocument();
    expect(screen.getByText("계획 수립")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the BatonFlow setup surface", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    expect(screen.getByText("Stages")).toBeInTheDocument();
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Project Updates")).toBeInTheDocument();
    expect(screen.getByText("GitHub/source control remains authoritative")).toBeInTheDocument();
  });
});

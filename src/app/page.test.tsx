import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the BatonFlow landing surface", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Start with an account" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("heading", { name: "Workflow canvas coming soon" })).toBeInTheDocument();
  });
});

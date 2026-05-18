import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageLayout } from "./PageLayout";

describe("PageLayout", () => {
  it("renders title, breadcrumb, actions, body", () => {
    render(
      <PageLayout
        title="OKR"
        breadcrumb={<span>Portal / OKR</span>}
        actions={<button>New</button>}
      >
        <div>body content</div>
      </PageLayout>,
    );
    expect(screen.getByRole("heading", { name: "OKR" })).toBeInTheDocument();
    expect(screen.getByText("Portal / OKR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });
});

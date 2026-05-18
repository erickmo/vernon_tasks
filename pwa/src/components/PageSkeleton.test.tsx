import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageSkeleton } from "./PageSkeleton";

describe("PageSkeleton", () => {
  it("renders aria-busy region", () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen, act, waitForElementToBeRemoved } from "@testing-library/react";
import OfflineBanner from "./OfflineBanner";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value, writable: true, configurable: true,
  });
  // Browsers dispatch a window-level event; our hook listens for these.
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("OfflineBanner", () => {
  it("renders nothing while the browser reports online", () => {
    setOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe("");
  });

  it("shows the offline notice when the browser flips to offline", () => {
    setOnline(true);
    render(<OfflineBanner />);
    act(() => setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
  });

  it("removes the notice from the DOM when the browser comes back online", async () => {
    setOnline(false);
    render(<OfflineBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    act(() => setOnline(true));
    // AnimatePresence runs an exit animation; wait for the node to be
    // fully removed before asserting the steady state.
    await waitForElementToBeRemoved(() => screen.queryByRole("status"), { timeout: 2000 });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

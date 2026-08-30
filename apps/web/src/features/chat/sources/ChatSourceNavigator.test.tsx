import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatSourceNavigator } from "./ChatSourceNavigator";

describe("ChatSourceNavigator", () => {
  it("opens a photo source in the Photo Album with its navigation id", () => {
    const onNavigateToSurface = vi.fn();
    const onClose = vi.fn();

    render(
      <ChatSourceNavigator
        source={{
          type: "photo",
          id: "episode:photo-1",
          navigationId: "photo-1",
          title: "Beach sunset",
          snippet: "A sunset at the beach with friends.",
        }}
        onClose={onClose}
        onNavigateToSurface={onNavigateToSurface}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open in Photo Album" }));

    expect(onNavigateToSurface).toHaveBeenCalledWith("photos", "photo-1");
    expect(onClose).toHaveBeenCalled();
  });
});

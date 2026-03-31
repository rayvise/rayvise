import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptAppSelector } from "#/pages/prompts/PromptAppSelector";
import { useAppsStore } from "#/stores";

vi.mock("#/hooks/useAppIcons", () => ({
  useAppIcons: () => ({}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("PromptAppSelector", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppsStore.setState({
      apps: [
        { name: "Visible App", bundleId: "com.visible" },
        { name: "Hidden App", bundleId: "com.hidden" },
      ],
      activeApp: null,
      hiddenAppBundleIds: ["com.hidden"],
    });
    vi.spyOn(useAppsStore.persist, "rehydrate").mockResolvedValue(undefined);
  });

  it("does not offer hidden apps in the picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PromptAppSelector assignedAppIds={[]} onChange={onChange} />);

    const region = screen.getByText(/apps using this prompt/i).closest("div");
    expect(region).toBeTruthy();
    const trigger = within(region as HTMLElement).getByRole("button", {
      name: "",
    });
    await user.click(trigger);

    expect(await screen.findByText("Visible App")).toBeInTheDocument();
    expect(screen.queryByText("Hidden App")).not.toBeInTheDocument();
  });

  it("still shows chips for assigned apps that are hidden", () => {
    render(
      <PromptAppSelector assignedAppIds={["com.hidden"]} onChange={() => {}} />,
    );

    expect(screen.getByText("Hidden App")).toBeInTheDocument();
  });
});

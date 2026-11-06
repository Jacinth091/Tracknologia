import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateProviderProfile: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/features/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/providers")>()),
  updateProviderProfile: mocks.updateProviderProfile,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { updateProviderProfileAction } from "./actions";

function formWithDevices(devices: string[]) {
  const form = new FormData();
  form.set("displayName", "River Repair");
  form.set("acceptingRequests", "on");
  for (const device of devices) form.append("supportedDevices", device);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateProviderProfile.mockResolvedValue(undefined);
});
describe("Provider device selection", () => {
  it("saves all selected categories without splitting category names on commas", async () => {
    const result = await updateProviderProfileAction(
      null,
      formWithDevices(["Tablets", "Vintage radios, amplifiers", "Tablets"]),
    );
    expect(result.success).toBeDefined();
    expect(mocks.updateProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        supportedDevices: ["Tablets", "Vintage radios, amplifiers"],
      }),
      expect.anything(),
    );
  });
  it("clears the list when every checkbox is unchecked", async () => {
    await updateProviderProfileAction(null, formWithDevices([]));
    expect(mocks.updateProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({ supportedDevices: [] }),
      expect.anything(),
    );
  });
  it("rejects non-text checkbox values before calling the feature", async () => {
    const form = formWithDevices([]);
    form.append(
      "supportedDevices",
      new Blob(["invalid"], { type: "text/plain" }),
      "devices.txt",
    );
    const result = await updateProviderProfileAction(null, form);
    expect(result.fieldErrors?.supportedDevices).toBeDefined();
    expect(mocks.updateProviderProfile).not.toHaveBeenCalled();
  });
});

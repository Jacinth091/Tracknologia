interface DeviceCategoryFieldsProps {
  selected?: string[];
  disabled?: boolean;
  error?: string;
}

const DEVICE_CATEGORIES = [
  "Smartphones",
  "Laptops & PCs",
  "Tablets",
  "Gaming Consoles",
  "Audio & Wearables",
  "Other Electronics",
];

export function DeviceCategoryFields({
  selected = [],
  disabled = false,
  error,
}: DeviceCategoryFieldsProps) {
  const options = [...new Set([...DEVICE_CATEGORIES, ...selected])];

  return (
    <fieldset
      className="space-y-3"
      aria-invalid={Boolean(error)}
      aria-describedby={error ? "device-categories-error" : undefined}
    >
      <legend className="text-sm font-medium">Supported devices</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((device) => (
          <label
            key={device}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-foreground has-[:checked]:bg-muted has-[:checked]:font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
          >
            <input
              type="checkbox"
              name="supportedDevices"
              value={device}
              defaultChecked={selected.includes(device)}
              disabled={disabled}
              className="size-4 shrink-0 accent-foreground"
            />
            <span>{device}</span>
          </label>
        ))}
      </div>
      {error && (
        <p
          id="device-categories-error"
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

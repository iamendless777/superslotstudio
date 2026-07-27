export interface ReplayLaunchConfiguration {
  readonly game: string;
  readonly version: string;
  readonly mode: string;
  readonly event: string;
  readonly rgsBaseUrl: URL;
  readonly currency?: string;
  readonly amount?: string;
  readonly language: string;
  readonly device: "desktop" | "mobile";
  readonly social: boolean;
}

export interface ParseReplayLaunchOptions {
  readonly allowInsecureHttp?: boolean;
  readonly allowedRgsOrigins?: readonly string[];
}

export class InvalidReplayConfigurationError extends TypeError {
  readonly parameter: string;

  constructor(parameter: string, expectation: string) {
    super(`Invalid replay parameter ${parameter}: expected ${expectation}`);
    this.name = "InvalidReplayConfigurationError";
    this.parameter = parameter;
  }
}

function single(
  params: URLSearchParams,
  key: string,
  required: boolean,
): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1 || (required && values.length !== 1)) {
    throw new InvalidReplayConfigurationError(key, "exactly one value");
  }
  const value = values[0];
  if (value !== undefined && value.length === 0) {
    throw new InvalidReplayConfigurationError(key, "non-empty value");
  }
  return value;
}

function parseRgsOrigin(value: string, options: ParseReplayLaunchOptions): URL {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new InvalidReplayConfigurationError("rgs_url", "valid RGS origin");
  }
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && options.allowInsecureHttp === true)) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new InvalidReplayConfigurationError(
      "rgs_url",
      "HTTPS origin without credentials, path, query, or fragment",
    );
  }
  if (options.allowedRgsOrigins !== undefined) {
    const allowed = new Set(
      options.allowedRgsOrigins.map((origin) => {
        try {
          const allowedUrl = new URL(origin);
          if (
            (allowedUrl.protocol !== "https:" &&
              !(
                allowedUrl.protocol === "http:" &&
                options.allowInsecureHttp === true
              )) ||
            allowedUrl.username !== "" ||
            allowedUrl.password !== "" ||
            allowedUrl.pathname !== "/" ||
            allowedUrl.search !== "" ||
            allowedUrl.hash !== ""
          ) {
            throw new TypeError("not an origin");
          }
          return allowedUrl.origin.toLowerCase();
        } catch {
          throw new InvalidReplayConfigurationError(
            "allowedRgsOrigins",
            "valid origins",
          );
        }
      }),
    );
    if (!allowed.has(url.origin.toLowerCase())) {
      throw new InvalidReplayConfigurationError(
        "rgs_url",
        "origin permitted by the deployment allowlist",
      );
    }
  }
  return url;
}

export function parseReplayLaunchConfiguration(
  launchUrl: string | URL,
  options: ParseReplayLaunchOptions = {},
): ReplayLaunchConfiguration {
  const launch = launchUrl instanceof URL ? launchUrl : new URL(launchUrl);
  if (single(launch.searchParams, "replay", true) !== "true") {
    throw new InvalidReplayConfigurationError("replay", "true");
  }
  const game = single(launch.searchParams, "game", true)!;
  const version = single(launch.searchParams, "version", true)!;
  const mode = single(launch.searchParams, "mode", true)!;
  const event = single(launch.searchParams, "event", true)!;
  const rgsBaseUrl = parseRgsOrigin(
    single(launch.searchParams, "rgs_url", true)!,
    options,
  );
  const currency = single(launch.searchParams, "currency", false);
  const amount = single(launch.searchParams, "amount", false);
  const language = single(launch.searchParams, "lang", false) ?? "en";
  const device = single(launch.searchParams, "device", false) ?? "desktop";
  const socialValue = single(launch.searchParams, "social", false) ?? "false";
  for (const [name, value] of [
    ["game", game],
    ["version", version],
    ["mode", mode],
    ["event", event],
  ] as const) {
    if (!/^[A-Za-z0-9._-]+$/.test(value)) {
      throw new InvalidReplayConfigurationError(
        name,
        "letters, numbers, dots, underscores, or hyphens",
      );
    }
  }
  if (currency !== undefined && !/^[A-Za-z]{3}$/.test(currency)) {
    throw new InvalidReplayConfigurationError("currency", "three-letter code");
  }
  if (amount !== undefined && !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount)) {
    throw new InvalidReplayConfigurationError("amount", "non-negative units");
  }
  if (!/^[A-Za-z]{2}$/.test(language)) {
    throw new InvalidReplayConfigurationError("lang", "two-letter code");
  }
  if (device !== "desktop" && device !== "mobile") {
    throw new InvalidReplayConfigurationError("device", "desktop or mobile");
  }
  if (socialValue !== "true" && socialValue !== "false") {
    throw new InvalidReplayConfigurationError("social", "true or false");
  }
  return {
    game,
    version,
    mode,
    event,
    rgsBaseUrl,
    ...(currency === undefined ? {} : { currency: currency.toUpperCase() }),
    ...(amount === undefined ? {} : { amount }),
    language: language.toLowerCase(),
    device,
    social: socialValue === "true",
  };
}

export interface ReplayResult<TState> {
  readonly payoutMultiplier: number;
  readonly costMultiplier: number;
  readonly state: TState;
}

export interface ReplayPort<TState> {
  load(): Promise<ReplayResult<TState>>;
}

export class InvalidReplayResponseError extends TypeError {
  constructor(expectation: string) {
    super(`Invalid replay response: expected ${expectation}`);
    this.name = "InvalidReplayResponseError";
  }
}

export function parseReplayResult<TState>(
  value: unknown,
  parseState: (value: unknown) => TState,
): ReplayResult<TState> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidReplayResponseError("object");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(",") !==
    "costMultiplier,payoutMultiplier,state"
  ) {
    throw new InvalidReplayResponseError(
      "payoutMultiplier, costMultiplier, and state",
    );
  }
  if (
    typeof input.payoutMultiplier !== "number" ||
    !Number.isFinite(input.payoutMultiplier) ||
    input.payoutMultiplier < 0 ||
    typeof input.costMultiplier !== "number" ||
    !Number.isFinite(input.costMultiplier) ||
    input.costMultiplier < 0
  ) {
    throw new InvalidReplayResponseError("non-negative finite multipliers");
  }
  return {
    payoutMultiplier: input.payoutMultiplier,
    costMultiplier: input.costMultiplier,
    state: parseState(input.state),
  };
}

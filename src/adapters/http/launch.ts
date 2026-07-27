export type DeviceType = "desktop" | "mobile";

export interface LaunchConfiguration {
  readonly sessionID: string;
  readonly language: string;
  readonly device: DeviceType;
  readonly rgsBaseUrl: URL;
}

export interface ParseLaunchOptions {
  readonly protocol?: "https:" | "http:";
  readonly allowInsecureHttp?: boolean;
  /** Canonical host[:port] values permitted to receive the launch session. */
  readonly allowedRgsHosts?: readonly string[];
}

export class InvalidLaunchConfigurationError extends TypeError {
  readonly parameter: string;

  constructor(parameter: string, expectation: string) {
    super(`Invalid launch parameter ${parameter}: expected ${expectation}`);
    this.name = "InvalidLaunchConfigurationError";
    this.parameter = parameter;
  }
}

function required(params: URLSearchParams, key: string): string {
  const values = params.getAll(key);
  if (values.length !== 1 || values[0]?.length === 0) {
    throw new InvalidLaunchConfigurationError(key, "non-empty value");
  }
  return values[0]!;
}

function optional(
  params: URLSearchParams,
  key: string,
  fallback: string,
): string {
  const values = params.getAll(key);
  if (values.length > 1) {
    throw new InvalidLaunchConfigurationError(key, "at most one value");
  }
  return values[0] || fallback;
}

function canonicalAllowedHost(
  host: string,
  protocol: "https:" | "http:",
): string {
  try {
    if (host.includes("://")) throw new TypeError("scheme is not allowed");
    const url = new URL(`${protocol}//${host}`);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new TypeError("only a host and optional port are allowed");
    }
    return url.host.toLowerCase();
  } catch {
    throw new InvalidLaunchConfigurationError(
      "allowedRgsHosts",
      "host values with optional ports",
    );
  }
}

export function parseLaunchConfiguration(
  launchUrl: string | URL,
  options: ParseLaunchOptions = {},
): LaunchConfiguration {
  const launch = launchUrl instanceof URL ? launchUrl : new URL(launchUrl);
  const sessionID = required(launch.searchParams, "sessionID");
  const rgsHost = required(launch.searchParams, "rgs_url");
  const language = optional(launch.searchParams, "lang", "en");
  const deviceValue = optional(launch.searchParams, "device", "desktop");
  if (deviceValue !== "desktop" && deviceValue !== "mobile") {
    throw new InvalidLaunchConfigurationError("device", "desktop or mobile");
  }
  if (!/^[A-Za-z]{2}$/.test(language)) {
    throw new InvalidLaunchConfigurationError(
      "lang",
      "two-letter language code",
    );
  }

  const protocol = options.protocol ?? "https:";
  if (protocol === "http:" && options.allowInsecureHttp !== true) {
    throw new InvalidLaunchConfigurationError("rgs_url", "HTTPS endpoint");
  }
  if (rgsHost.includes("://")) {
    throw new InvalidLaunchConfigurationError(
      "rgs_url",
      "host with optional port, without scheme",
    );
  }

  const rgsBaseUrl = new URL(`${protocol}//${rgsHost}`);
  if (
    rgsBaseUrl.username !== "" ||
    rgsBaseUrl.password !== "" ||
    rgsBaseUrl.pathname !== "/" ||
    rgsBaseUrl.search !== "" ||
    rgsBaseUrl.hash !== ""
  ) {
    throw new InvalidLaunchConfigurationError(
      "rgs_url",
      "host with optional port and no credentials, path, query, or fragment",
    );
  }
  if (options.allowedRgsHosts !== undefined) {
    const allowedHosts = new Set(
      options.allowedRgsHosts.map((host) =>
        canonicalAllowedHost(host, protocol),
      ),
    );
    if (!allowedHosts.has(rgsBaseUrl.host.toLowerCase())) {
      throw new InvalidLaunchConfigurationError(
        "rgs_url",
        "host permitted by the deployment allowlist",
      );
    }
  }

  return {
    sessionID,
    language: language.toLowerCase(),
    device: deviceValue,
    rgsBaseUrl,
  };
}

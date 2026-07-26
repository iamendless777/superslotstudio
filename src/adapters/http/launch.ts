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
  const value = params.get(key);
  if (value === null || value.length === 0) {
    throw new InvalidLaunchConfigurationError(key, "non-empty value");
  }
  return value;
}

export function parseLaunchConfiguration(
  launchUrl: string | URL,
  options: ParseLaunchOptions = {},
): LaunchConfiguration {
  const launch = launchUrl instanceof URL ? launchUrl : new URL(launchUrl);
  const sessionID = required(launch.searchParams, "sessionID");
  const rgsHost = required(launch.searchParams, "rgs_url");
  const language = launch.searchParams.get("lang") || "en";
  const deviceValue = launch.searchParams.get("device") || "desktop";
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

  return {
    sessionID,
    language: language.toLowerCase(),
    device: deviceValue,
    rgsBaseUrl,
  };
}

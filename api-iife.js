class CORSFetch {
  _requestId = 1;
  _config = {
    include: [],
    exclude: [],
    request: {
      proxy: undefined,
      connectTimeout: undefined,
      maxRedirections: undefined,
    },
  };

  constructor() {
    window.fetchNative = window.fetch.bind(window);
    window.fetch = this.fetchCORS.bind(this);
    window.fetchCORS = (input, init) => this.fetchCORS(input, init, true);
  }

  config(config) {
    this._config = {
      ...this._config,
      include: config.include || this._config.include,
      exclude: config.exclude || this._config.exclude,
      request: {
        ...this._config.request,
        ...config.request,
      },
    };
  }

  _matchesPattern(url, patterns) {
    if (!patterns || patterns.length === 0) return false;
    return patterns.some((pattern) => {
      if (typeof pattern === "string") return url.includes(pattern);
      if (pattern instanceof RegExp) return pattern.test(url);
      return false;
    });
  }

  _shouldUseCORSProxy(url) {
    // Exclude Tauri internal protocols (ipc:// or asset://)
    // https://github.com/tauri-apps/tauri/blob/b5c549d1898ecdb712822c02dc665cc6771fbd07/crates/tauri/scripts/core.js#L16
    const isTauriProtocol =
      /^(ipc|asset):\/\/localhost\//i.test(url) ||
      /^http:\/\/(ipc|asset)\.localhost\//i.test(url);
    if (isTauriProtocol) return false;

    const { include, exclude } = this._config;

    // Priority: exclusion list
    if (exclude.length > 0 && this._matchesPattern(url, exclude)) {
      return false;
    }

    // If there is an inclusion list, only proxy URLs in that list
    if (include.length > 0) {
      return this._matchesPattern(url, include);
    }

    // Default: proxy all http(s) requests
    return /^https?:\/\//i.test(url);
  }

  async fetchCORS(input, init, force = false) {
    const urlStr = input instanceof Request ? input.url : String(input);

    if (!force && !this._shouldUseCORSProxy(urlStr)) {
      return window.fetchNative(input, init);
    }

    const {
      maxRedirections = this._config.request.maxRedirections,
      connectTimeout = this._config.request.connectTimeout,
      proxy = this._config.request.proxy,
      ...nativeInit
    } = init || {};

    const requestId = this._requestId++;
    const { signal } = nativeInit;

    // Handle request cancellation logic
    if (signal) {
      signal.addEventListener("abort", () => {
        this._invoke("plugin:cors-fetch|cancel_cors_request", {
          requestId,
        }).catch(() => {});
      });
    }

    // Create a temporary Request object using nativeInit.
    // This automatically handles Header merging and Body conversion
    // without affecting the state of the original 'input' object.
    const tempReq = new Request(input, nativeInit);
    const method = tempReq.method;
    const headers = Array.from(tempReq.headers.entries());

    // Read Body data
    const buffer = await tempReq.arrayBuffer();
    const reqData = buffer.byteLength
      ? Array.from(new Uint8Array(buffer))
      : null;

    // Invoke Tauri plugin
    const response = await this._invoke("plugin:cors-fetch|cors_request", {
      request: {
        requestId,
        method,
        url: urlStr,
        headers,
        data: reqData,
        maxRedirections,
        connectTimeout,
        proxy,
      },
    });

    const {
      status,
      statusText,
      url: resUrl,
      body,
      headers: resHeaders,
    } = response;

    // Assemble the Response
    const responseBody =
      body instanceof ArrayBuffer
        ? body
        : Array.isArray(body)
          ? new Uint8Array(body)
          : null;

    const res = new Response(responseBody, {
      headers: resHeaders,
      status,
      statusText,
    });

    // Correct the Response 'url' property (readonly, so we use defineProperty)
    Object.defineProperty(res, "url", { value: resUrl });

    return res;
  }

  async _invoke(cmd, args) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
}

(function () {
  if (
    typeof window !== "undefined" &&
    window.__TAURI_INTERNALS__ &&
    !window.CORSFetch
  ) {
    window.CORSFetch = new CORSFetch();
  }
})();

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
    window.fetchNative = fetch.bind(window);
    window.fetch = this.fetchCORS.bind(this);
    window.fetchCORS = (input, init) => this.fetchCORS(input, init, true);
  }

  config(config) {
    this._config = {
      include: config.include || [],
      exclude: config.exclude || [],
      request: {
        proxy: config.request?.proxy || this._config.request.proxy,
        connectTimeout:
          config.request?.connectTimeout || this._config.request.connectTimeout,
        maxRedirections:
          config.request?.maxRedirections ||
          this._config.request.maxRedirections,
      },
    };
  }

  _matchesPattern(url, patterns) {
    if (!patterns || patterns.length === 0) {
      return false;
    }

    return patterns.some((pattern) => {
      if (typeof pattern === "string") {
        return url.includes(pattern);
      } else if (pattern instanceof RegExp) {
        return pattern.test(url);
      }
      return false;
    });
  }

  _shouldUseCORSProxy(url) {
    const { include, exclude } = this._config;

    // `ipc://localhost/${path}` and `http://ipc.localhost/${path}` are used for Tauri IPC requests
    // https://github.com/tauri-apps/tauri/blob/b5c549d1898ecdb712822c02dc665cc6771fbd07/crates/tauri/scripts/core.js#L16
    const isTauriProtocol = ["ipc", "asset"].some(
      (protocol) =>
        new RegExp(`^${protocol}://localhost/`).test(url) ||
        new RegExp(`^http://${protocol}.localhost/`).test(url)
    );

    if (isTauriProtocol) {
      return false;
    }

    if (exclude.length > 0 && this._matchesPattern(url, exclude)) {
      return false;
    }

    if (include.length > 0) {
      return this._matchesPattern(url, include);
    }

    return /^https?:\/\//i.test(url);
  }

  async fetchCORS(input, init, force = false) {
    const _url = input instanceof Request ? input.url : input.toString();

    if (!this._shouldUseCORSProxy(_url) && !force) {
      return window.fetchNative(input, init);
    }

    return new Promise(async (resolve, reject) => {
      const requestId = this._requestId++;

      // Use config defaults if not specified in init
      const maxRedirections =
        init?.maxRedirections ?? this._config.request.maxRedirections;
      const connectTimeout =
        init?.connectTimeout ?? this._config.request.connectTimeout;
      const proxy = init?.proxy ?? this._config.request.proxy;

      // Remove these fields before creating the request
      if (init) {
        delete init.maxRedirections;
        delete init.connectTimeout;
        delete init.proxy;
      }

      const signal = init?.signal;

      const headers = !init?.headers
        ? []
        : init.headers instanceof Headers
        ? Array.from(init.headers.entries())
        : Array.isArray(init.headers)
        ? init.headers
        : Object.entries(init.headers);

      const mappedHeaders = headers.map(([name, val]) => [
        name,
        // we need to ensure we have all values as strings
        typeof val === "string" ? val : val.toString(),
      ]);

      const req = new Request(input, init);
      const buffer = await req.arrayBuffer();
      const reqData = buffer.byteLength
        ? Array.from(new Uint8Array(buffer))
        : null;

      signal?.addEventListener("abort", async (e) => {
        const error = e.target.reason;
        this._invoke("plugin:cors-fetch|cancel_cors_request", {
          requestId,
        }).catch(() => {});
        reject(error);
      });

      const {
        status,
        statusText,
        url,
        body,
        headers: responseHeaders,
      } = await this._invoke("plugin:cors-fetch|cors_request", {
        request: {
          requestId,
          method: req.method,
          url: req.url,
          headers: mappedHeaders,
          data: reqData,
          maxRedirections,
          connectTimeout,
          proxy,
        },
      });

      const res = new Response(
        body instanceof ArrayBuffer && body.byteLength
          ? body
          : body instanceof Array && body.length
          ? new Uint8Array(body)
          : null,
        {
          headers: responseHeaders,
          status,
          statusText,
        }
      );

      // url is read only but seems like we can do this
      Object.defineProperty(res, "url", { value: url });

      resolve(res);
    });
  }

  _invoke(cmd, args, options) {
    if ("__TAURI__" in window) {
      return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
    }
  }
}

(function () {
  window.CORSFetch = new CORSFetch();
})();

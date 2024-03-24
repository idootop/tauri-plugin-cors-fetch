class CORSFetch {
  _requestId = 1;

  constructor() {
    window.originalFetch = fetch.bind(window);
    window.hookedFetch = this.hookedFetch.bind(this);
    this.enableCORS(true);
  }

  enableCORS(enable) {
    window.fetch = enable ? window.hookedFetch : window.originalFetch;
  }

  async hookedFetch(input, init) {
    let reqUrl = input instanceof Request ? input.url : input.toString();

    if (!/^https?:\/\//i.test(reqUrl)) {
      return window.originalFetch(input, init);
    }

    return new Promise(async (resolve, reject) => {
      const requestId = this._requestId++;

      const maxRedirections = init?.maxRedirections;
      const connectTimeout = init?.connectTimeout;
      const proxy = init?.proxy;

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
  const cf = new CORSFetch();
  window.enableCORSFetch = cf.enableCORS.bind(cf);
})();

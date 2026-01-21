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

  async fetchCORS(input, init, force = false) {
    const urlStr = input instanceof Request ? input.url : String(input);

    if (!force && !this._shouldUseCORSProxy(urlStr)) {
      return window.fetchNative(input, init);
    }

    const requestId = this._requestId++;

    const {
      maxRedirections = this._config.request.maxRedirections,
      connectTimeout = this._config.request.connectTimeout,
      proxy = this._config.request.proxy,
      ...nativeInit
    } = init || {};

    const tempReq = new Request(input, nativeInit);
    const buffer = await tempReq.arrayBuffer();

    return new Promise((resolve, reject) => {
      let controller;
      let isFinished = false;

      function cleanup(id) {
        isFinished = true;
        const internals = window.__TAURI_INTERNALS__;

        if (nativeInit.signal) {
          nativeInit.signal.removeEventListener("abort", onAbort);
        }

        if (typeof internals.unregisterCallback === "function") {
          // tauri >=2.5.1
          internals.unregisterCallback(id);
        } else if (window[`_${id}`]) {
          // tauri < 2.5.1
          delete window[`_${id}`];
        }
      }

      function cancelBackend() {
        return window.__TAURI_INTERNALS__
          .invoke("plugin:cors-fetch|cancel_cors_request", { requestId })
          .catch(console.error);
      }

      function onAbort() {
        if (isFinished) return;
        cancelBackend();
        const err = "User cancelled the request";
        controller?.error(err);
        reject(err);
        cleanup(handlerId);
      }

      const stream = new ReadableStream({
        start(c) {
          controller = c;
        },
        cancel() {
          onAbort();
        },
      });

      if (nativeInit.signal?.aborted) {
        return reject("User cancelled the request");
      }
      nativeInit.signal?.addEventListener("abort", onAbort);

      let expectedIndex = 0;
      const reorderBuffer = new Map();

      const handlerId = window.__TAURI_INTERNALS__.transformCallback(
        (event) => {
          reorderBuffer.set(event.index, event);
          while (reorderBuffer.has(expectedIndex)) {
            const e = reorderBuffer.get(expectedIndex);
            handleEvent(e);
            reorderBuffer.delete(expectedIndex);
            expectedIndex++;
          }
        },
      );

      function handleEvent(event) {
        // finished
        if (event.end) {
          controller?.close();
          cleanup(handlerId);
          return;
        }

        const { type, payload } = event.message || event;

        switch (type) {
          case "Response":
            resolve(
              new Response(stream, {
                status: payload.status,
                statusText: payload.status_text,
                headers: payload.headers,
              }),
            );
            break;

          case "Data":
            if (payload && !isFinished) {
              controller?.enqueue(new Uint8Array(payload));
            }
            break;

          case "Error": {
            const err = new Error(payload);
            controller?.error(err);
            reject(err);
            cleanup(handlerId);
            break;
          }

          case "Done":
            break;
        }
      }

      window.__TAURI_INTERNALS__
        .invoke("plugin:cors-fetch|cors_request", {
          request: {
            requestId,
            method: tempReq.method,
            url: urlStr,
            headers: Array.from(tempReq.headers.entries()),
            data: buffer.byteLength ? Array.from(new Uint8Array(buffer)) : null,
            maxRedirections,
            connectTimeout,
            proxy,
          },
          onEvent: window.__TAURI_INTERNALS__.unregisterCallback
            ? `__CHANNEL__:${handlerId}` // tauri >= 2.5.1
            : { __TAURI_CHANNEL_MARKER__: true, id: handlerId }, // tauri < 2.5.1
        })
        .catch((err) => {
          if (isFinished) return;
          cleanup(handlerId);
          reject(err);
        });
    });
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

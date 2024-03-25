class CORSFetch {
  _request_id = 1;

  constructor() {
    window.originalFetch = fetch.bind(window);
    window.hookedFetch = this.hookedFetch.bind(this);
    this.enableCORS(true);
  }

  enableCORS(enable) {
    window.fetch = enable ? window.hookedFetch : window.originalFetch;
  }

  async hookedFetch(input, init) {
    let url = input instanceof Request ? input.url : input.toString();
    const isHttpRequests = /^(?:x-)?https?:\/\//i.test(url);
    
    // `ipc://localhost/${path}` and `http://ipc.localhost/${path}` are used for Tauri IPC requests
    // https://github.com/tauri-apps/tauri/blob/7898b601d14ed62053dd24011fabadf31ec1af45/core/tauri/scripts/core.js#L12
    const isTauriIpcRequests =
      /^ipc:\/\/localhost\//i.test(url) ||
      /^http:\/\/ipc.localhost\//i.test(url);

    if (!isHttpRequests || isTauriIpcRequests) {
      return window.originalFetch(input, init);
    }
    if (!url.startsWith("x-")) {
      url = "x-" + url;
    }
    const id = this._request_id++;
    init = {
      ...init,
      headers: {
        ...init?.headers,
        "x-request-id": id.toString(),
      },
    };
    return new Promise(async (resolve, reject) => {
      try {
        const response = await window.originalFetch(url, init);
        resolve(response);
      } catch (error) {
        await this._invoke("plugin:cors-fetch|cancel_cors_request", { id });
        reject(error);
      }
    });
  }

  _invoke(cmd, args, options) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  }
}

(function () {
  const cf = new CORSFetch();
  window.enableCORSFetch = cf.enableCORS.bind(cf);
})();

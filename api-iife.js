class CORSFetch {
  _fetch;
  _request_id = 1;

  constructor() {
    this._fetch = fetch.bind(window);
    window.fetch = this._hookFetch.bind(this);
  }

  _enableCORS = true;
  enableCORS(enable) {
    this._enableCORS = enable;
  }

  async _hookFetch(input, init) {
    return this.corsFetch(input, init, this._enableCORS);
  }

  async corsFetch(input, init, cors = true) {
    let id = 0;
    let url = input instanceof Request ? input.url : input.toString();
    const shouldCORS = cors && /^(?:x-)?https?:\/\//i.test(url);
    if (shouldCORS) {
      if (!url.startsWith("x-")) {
        url = "x-" + url;
      }
      id = this._request_id++;
      init = {
        ...init,
        headers: {
          ...init?.headers,
          "x-request-id": id.toString(),
        },
      };
    }

    try {
      const response = await this._fetch(url, init);
      return response;
    } catch (error) {
      if (id) {
        await this._invoke("plugin:cors-fetch|cancel_cors_request", { id });
      }
      return error;
    }
  }

  _invoke(cmd, args, options) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
  }
}

(function () {
  const cf = new CORSFetch();
  window.corsFetch = cf.corsFetch.bind(cf);
  window.enableCORSFetch = cf.enableCORS.bind(cf);
})();

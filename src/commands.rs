// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

// Source: https://docs.rs/crate/tauri-plugin-http/2.0.0-beta.3

use std::{collections::HashMap, sync::Arc, time::Duration};

use http::{header, HeaderName, HeaderValue, Method};
use reqwest::{redirect::Policy, NoProxy, RequestBuilder};
use serde::{Deserialize, Serialize};
use tauri::command;

use crate::{Error, Result};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConfig {
    request_id: u64,
    method: String,
    url: url::Url,
    headers: Vec<(String, String)>,
    data: Option<Vec<u8>>,
    connect_timeout: Option<u64>,
    max_redirections: Option<usize>,
    proxy: Option<Proxy>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    url: String,
    body: Option<Vec<u8>>,
}

use once_cell::sync::Lazy;
use tokio::sync::oneshot;
type RequestPool = Arc<std::sync::Mutex<HashMap<u64, oneshot::Sender<()>>>>;
static REQUEST_POOL: Lazy<RequestPool> =
    Lazy::new(|| Arc::new(std::sync::Mutex::new(HashMap::new())));

#[command]
pub fn cancel_cors_request(request_id: u64) {
    if let Some(tx) = REQUEST_POOL.lock().unwrap().remove(&request_id) {
        tx.send(()).ok();
    }
}

#[command]
pub async fn cors_request(request: RequestConfig) -> Result<FetchResponse> {
    let request_id = request.request_id;
    let (tx, rx) = oneshot::channel();
    REQUEST_POOL.lock().unwrap().insert(request_id, tx);
    let request_config = build_request(request)?;
    let response = get_response(request_config, rx).await;
    if !REQUEST_POOL.lock().unwrap().contains_key(&request_id) {
        return Err(Error::RequestCanceled);
    }
    REQUEST_POOL.lock().unwrap().remove(&request_id);
    response
}

pub fn build_request(request_config: RequestConfig) -> Result<RequestBuilder> {
    let RequestConfig {
        request_id: _,
        method,
        url,
        headers,
        data,
        connect_timeout,
        max_redirections,
        proxy,
    } = request_config;

    let method = Method::from_bytes(method.as_bytes())?;
    let headers: HashMap<String, String> = HashMap::from_iter(headers);

    let mut builder = reqwest::ClientBuilder::new();

    if let Some(timeout) = connect_timeout {
        builder = builder.connect_timeout(Duration::from_millis(timeout));
    }

    if let Some(max_redirections) = max_redirections {
        builder = builder.redirect(if max_redirections == 0 {
            Policy::none()
        } else {
            Policy::limited(max_redirections)
        });
    }

    if let Some(proxy_config) = proxy {
        builder = attach_proxy(proxy_config, builder)?;
    }

    let mut request = builder.build()?.request(method.clone(), url.clone());

    for (name, value) in &headers {
        let name = HeaderName::from_bytes(name.as_bytes())?;
        let value = HeaderValue::from_bytes(value.as_bytes())?;
        request = request.header(name, value);
    }

    // POST and PUT requests should always have a 0 length content-length,
    // if there is no body. https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
    if data.is_none() && matches!(method, Method::POST | Method::PUT) {
        request = request.header(header::CONTENT_LENGTH, HeaderValue::from(0));
    }

    if headers.contains_key(header::RANGE.as_str()) {
        // https://fetch.spec.whatwg.org/#http-network-or-cache-fetch step 18
        // If httpRequest’s header list contains `Range`, then append (`Accept-Encoding`, `identity`)
        request = request.header(
            header::ACCEPT_ENCODING,
            HeaderValue::from_static("identity"),
        );
    }

    if let Some(data) = data {
        request = request.body(data);
    }

    Ok(request)
}

pub async fn get_response(
    request: RequestBuilder,
    rx: oneshot::Receiver<()>,
) -> Result<FetchResponse> {
    let response_or_none = tokio::select! {
        _ = rx =>None,
        res = request.send() => Some(res),
    };

    if let Some(response) = response_or_none {
        match response {
            Ok(res) => {
                let status = res.status();
                let url = res.url().to_string();
                let mut headers = Vec::new();
                for (key, val) in res.headers().iter() {
                    headers.push((
                        key.as_str().into(),
                        String::from_utf8(val.as_bytes().to_vec())?,
                    ));
                }
                return Ok(FetchResponse {
                    status: status.as_u16(),
                    status_text: status.canonical_reason().unwrap_or_default().to_string(),
                    headers,
                    url,
                    body: Some(res.bytes().await?.to_vec()),
                });
            }
            Err(err) => return Err(Error::Network(err)),
        }
    }
    Err(Error::RequestCanceled)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proxy {
    all: Option<UrlOrConfig>,
    http: Option<UrlOrConfig>,
    https: Option<UrlOrConfig>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum UrlOrConfig {
    Url(String),
    Config(ProxyConfig),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    url: String,
    basic_auth: Option<BasicAuth>,
    no_proxy: Option<String>,
}

#[derive(Deserialize)]
pub struct BasicAuth {
    username: String,
    password: String,
}

#[inline]
fn proxy_creator(
    url_or_config: UrlOrConfig,
    proxy_fn: fn(String) -> reqwest::Result<reqwest::Proxy>,
) -> reqwest::Result<reqwest::Proxy> {
    match url_or_config {
        UrlOrConfig::Url(url) => Ok(proxy_fn(url)?),
        UrlOrConfig::Config(ProxyConfig {
            url,
            basic_auth,
            no_proxy,
        }) => {
            let mut proxy = proxy_fn(url)?;
            if let Some(basic_auth) = basic_auth {
                proxy = proxy.basic_auth(&basic_auth.username, &basic_auth.password);
            }
            if let Some(no_proxy) = no_proxy {
                proxy = proxy.no_proxy(NoProxy::from_string(&no_proxy));
            }
            Ok(proxy)
        }
    }
}

fn attach_proxy(
    proxy: Proxy,
    mut builder: reqwest::ClientBuilder,
) -> crate::Result<reqwest::ClientBuilder> {
    let Proxy { all, http, https } = proxy;

    if let Some(all) = all {
        let proxy = proxy_creator(all, reqwest::Proxy::all)?;
        builder = builder.proxy(proxy);
    }

    if let Some(http) = http {
        let proxy = proxy_creator(http, reqwest::Proxy::http)?;
        builder = builder.proxy(proxy);
    }

    if let Some(https) = https {
        let proxy = proxy_creator(https, reqwest::Proxy::https)?;
        builder = builder.proxy(proxy);
    }

    Ok(builder)
}

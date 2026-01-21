use dashmap::DashMap;
use futures_util::StreamExt;
use http::{header, HeaderName, HeaderValue, Method};
use reqwest::{redirect::Policy, NoProxy, RequestBuilder};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{command, ipc::Channel, Runtime, State};
use tokio::sync::oneshot;

use crate::Result;

pub struct RequestPool(pub Arc<DashMap<u64, oneshot::Sender<()>>>);

impl Default for RequestPool {
    fn default() -> Self {
        Self(Arc::new(DashMap::new()))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConfig {
    pub request_id: u64,
    pub method: String,
    pub url: url::Url,
    pub headers: Vec<(String, String)>,
    pub data: Option<Vec<u8>>,
    pub connect_timeout: Option<u64>,
    pub max_redirections: Option<usize>,
    pub proxy: Option<Proxy>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub url: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum StreamPayload {
    Response(FetchResponse),
    Data(Vec<u8>),
    Error(String),
    Done,
}

#[command]
pub async fn cancel_cors_request(request_id: u64, pool: State<'_, RequestPool>) -> Result<()> {
    if let Some((_, tx)) = pool.0.remove(&request_id) {
        let _ = tx.send(());
    }
    Ok(())
}

#[command]
pub async fn cors_request<R: Runtime>(
    _app: tauri::AppHandle<R>,
    request: RequestConfig,
    on_event: Channel<StreamPayload>,
    pool: State<'_, RequestPool>,
) -> Result<()> {
    let request_id = request.request_id;
    let (cancel_tx, mut cancel_rx) = oneshot::channel();

    pool.0.insert(request_id, cancel_tx);

    let builder = build_request(request)?;

    let pool_inner = pool.0.clone();

    tokio::spawn(async move {
        match builder.send().await {
            Ok(response) => {
                let status = response.status();
                let url = response.url().to_string();
                let headers = response
                    .headers()
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.as_str().to_string(),
                            String::from_utf8_lossy(v.as_bytes()).to_string(),
                        )
                    })
                    .collect();

                let _ = on_event.send(StreamPayload::Response(FetchResponse {
                    status: status.as_u16(),
                    status_text: status.canonical_reason().unwrap_or_default().to_string(),
                    headers,
                    url,
                }));

                let mut stream = response.bytes_stream();
                loop {
                    tokio::select! {
                        _ = &mut cancel_rx => {
                            let _ = on_event.send(StreamPayload::Error("User cancelled the request".into()));
                            break;
                        }
                        chunk_opt = stream.next() => {
                            match chunk_opt {
                                Some(Ok(chunk)) => {
                                    let _ = on_event.send(StreamPayload::Data(chunk.to_vec()));
                                }
                                Some(Err(e)) => {
                                    let _ = on_event.send(StreamPayload::Error(e.to_string()));
                                    break;
                                }
                                None => {
                                    let _ = on_event.send(StreamPayload::Done);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = on_event.send(StreamPayload::Error(e.to_string()));
            }
        }
        pool_inner.remove(&request_id);
    });

    Ok(())
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

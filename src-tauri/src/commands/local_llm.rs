use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use url::{Host, Url};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct LocalLlmState {
    canceled_sessions: Mutex<HashSet<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStreamChunk {
    session_id: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ModelEntry>>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: Option<String>,
}

fn normalize_local_base_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Local base URL is required.".to_string());
    }

    let mut url = Url::parse(trimmed).map_err(|_| "Invalid Local base URL.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Local base URL must use http or https.".to_string());
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err("Local base URL cannot contain credentials.".to_string());
    }

    let is_loopback = match url.host() {
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    };
    if !is_loopback {
        return Err("Local base URL must point to localhost, 127.0.0.1, or ::1.".to_string());
    }

    let path = url.path().trim_end_matches('/');
    match path {
        "" | "/" => url.set_path("/v1/"),
        "/v1" => url.set_path("/v1/"),
        _ => return Err("Local base URL path must be /v1 or empty.".to_string()),
    }
    url.set_query(None);
    url.set_fragment(None);

    Ok(url)
}

fn endpoint(base_url: &Url, path: &str) -> Result<Url, String> {
    base_url
        .join(path)
        .map_err(|_| "Invalid Local endpoint URL.".to_string())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent("Rayvise/0.3")
        .build()
        .map_err(|err| format!("Could not create Local client: {err}"))
}

fn with_auth(builder: reqwest::RequestBuilder, api_key: &str) -> reqwest::RequestBuilder {
    let token = api_key.trim();
    if token.is_empty() {
        builder
    } else {
        builder.bearer_auth(token)
    }
}

fn session_is_canceled(
    state: &State<'_, LocalLlmState>,
    session_id: &str,
) -> Result<bool, String> {
    state
        .canceled_sessions
        .lock()
        .map(|sessions| sessions.contains(session_id))
        .map_err(|_| "Could not read Local provider cancellation state.".to_string())
}

fn cleanup_session(state: &State<'_, LocalLlmState>, session_id: &str) {
    if let Ok(mut sessions) = state.canceled_sessions.lock() {
        sessions.remove(session_id);
    }
}

fn extract_content_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(extract_content_text)
            .collect::<Vec<_>>()
            .join(""),
        Value::Object(record) => ["text", "content", "output_text", "value"]
            .iter()
            .filter_map(|key| record.get(*key))
            .map(extract_content_text)
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn parse_sse_chunk(raw: &str) -> Result<Vec<String>, String> {
    let payload: Value =
        serde_json::from_str(raw).map_err(|_| "Invalid stream JSON.".to_string())?;
    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(message.to_string());
    }

    let mut chunks = Vec::new();
    if let Some(choices) = payload.get("choices").and_then(Value::as_array) {
        for choice in choices {
            if choice
                .get("finish_reason")
                .and_then(Value::as_str)
                .is_some_and(|reason| reason == "error")
            {
                return Err("stream terminated with an error".to_string());
            }

            let content = choice
                .get("delta")
                .and_then(|delta| delta.get("content"))
                .or_else(|| {
                    choice
                        .get("message")
                        .and_then(|message| message.get("content"))
                })
                .map(extract_content_text)
                .unwrap_or_default();

            if !content.is_empty() {
                chunks.push(content);
            }
        }
    }

    Ok(chunks)
}

fn parse_models_response(response: ModelsResponse) -> Vec<String> {
    response
        .data
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.id.map(|id| id.trim().to_string()))
        .filter(|id| !id.is_empty())
        .collect()
}

async fn stream_local_chat_completion_inner(
    app: AppHandle,
    state: State<'_, LocalLlmState>,
    session_id: String,
    base_url: String,
    api_key: String,
    body: Value,
) -> Result<(), String> {
    let base_url = normalize_local_base_url(&base_url)?;
    let url = endpoint(&base_url, "chat/completions")?;
    let client = client()?;
    let body = serde_json::to_vec(&body)
        .map_err(|err| format!("Could not serialize Local request: {err}"))?;
    let request = with_auth(client.post(url), &api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body);
    let mut response = request
        .send()
        .await
        .map_err(|err| format!("Local provider request failed: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Local provider error: {}", response.status()));
    }

    let mut buffer = String::new();
    while let Some(bytes) = response
        .chunk()
        .await
        .map_err(|err| format!("Local provider stream failed: {err}"))?
    {
        if session_is_canceled(&state, &session_id)? {
            return Err("Local provider request canceled.".to_string());
        }

        buffer.push_str(&String::from_utf8_lossy(&bytes));
        let mut lines: Vec<String> = buffer.split('\n').map(str::to_string).collect();
        buffer = lines.pop().unwrap_or_default().to_string();

        for line in lines.drain(..) {
            let line = line.trim_end_matches('\r');
            if line.is_empty() || line.starts_with(':') || !line.starts_with("data:") {
                continue;
            }

            let raw = line.trim_start_matches("data:").trim();
            if raw == "[DONE]" {
                return Ok(());
            }

            for text in parse_sse_chunk(raw)? {
                app.emit(
                    "rayvise://local-llm-stream",
                    LocalStreamChunk {
                        session_id: session_id.clone(),
                        text,
                    },
                )
                .map_err(|err| format!("Could not emit Local stream chunk: {err}"))?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn list_local_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let base_url = normalize_local_base_url(&base_url)?;
    let url = endpoint(&base_url, "models")?;
    let response = with_auth(client()?.get(url), &api_key)
        .send()
        .await
        .map_err(|err| format!("Could not connect to Local provider: {err}"))?;

    if !response.status().is_success() {
        return Err(format!("Local provider error: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Could not read Local models: {err}"))?;
    let models = serde_json::from_slice::<ModelsResponse>(&bytes)
        .map_err(|err| format!("Could not parse Local models: {err}"))?;

    Ok(parse_models_response(models))
}

#[tauri::command]
pub async fn cancel_local_chat_completion(
    state: State<'_, LocalLlmState>,
    session_id: String,
) -> Result<(), String> {
    state
        .canceled_sessions
        .lock()
        .map_err(|_| "Could not cancel Local provider request.".to_string())?
        .insert(session_id);
    Ok(())
}

#[tauri::command]
pub async fn stream_local_chat_completion(
    app: AppHandle,
    state: State<'_, LocalLlmState>,
    session_id: String,
    base_url: String,
    api_key: String,
    body: Value,
) -> Result<(), String> {
    cleanup_session(&state, &session_id);
    let result = stream_local_chat_completion_inner(
        app,
        state.clone(),
        session_id.clone(),
        base_url,
        api_key,
        body,
    )
    .await;
    cleanup_session(&state, &session_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_local_base_url_accepts_loopback_v1() {
        assert_eq!(
            normalize_local_base_url("http://localhost:11434")
                .unwrap()
                .as_str(),
            "http://localhost:11434/v1/"
        );
        assert_eq!(
            normalize_local_base_url("http://127.0.0.1:11434/v1")
                .unwrap()
                .as_str(),
            "http://127.0.0.1:11434/v1/"
        );
        assert_eq!(
            normalize_local_base_url("http://[::1]:11434/v1/")
                .unwrap()
                .as_str(),
            "http://[::1]:11434/v1/"
        );
    }

    #[test]
    fn normalize_local_base_url_rejects_remote_and_credentials() {
        assert!(normalize_local_base_url("https://example.com/v1").is_err());
        assert!(normalize_local_base_url("http://192.168.1.10:11434/v1").is_err());
        assert!(normalize_local_base_url("ftp://localhost:11434/v1").is_err());
        assert!(normalize_local_base_url("http://user:pass@localhost:11434/v1").is_err());
        assert!(normalize_local_base_url("http://localhost:11434/other").is_err());
    }

    #[test]
    fn parse_models_response_extracts_ids() {
        let models = parse_models_response(ModelsResponse {
            data: Some(vec![
                ModelEntry {
                    id: Some("llama3.2".to_string()),
                },
                ModelEntry {
                    id: Some(" ".to_string()),
                },
                ModelEntry { id: None },
            ]),
        });

        assert_eq!(models, vec!["llama3.2"]);
    }

    #[test]
    fn parse_sse_chunk_extracts_content_and_errors() {
        let chunks = parse_sse_chunk(r#"{"choices":[{"delta":{"content":"hello"}}]}"#).unwrap();
        assert_eq!(chunks, vec!["hello"]);

        let done_with_message =
            parse_sse_chunk(r#"{"choices":[{"message":{"content":"done"}}]}"#).unwrap();
        assert_eq!(done_with_message, vec!["done"]);

        assert_eq!(
            parse_sse_chunk(r#"{"error":{"message":"bad model"}}"#).unwrap_err(),
            "bad model"
        );
    }
}

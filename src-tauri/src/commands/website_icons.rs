use base64::{engine::general_purpose::STANDARD, Engine as _};
use regex::Regex;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;
use url::{Host, Url};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_ICON_BYTES: usize = 256 * 1024;
const MAX_HTML_BYTES: usize = 256 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchWebsiteIconRequest {
    pub domain: String,
}

fn href_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r#"(?is)<link\b[^>]*\brel\s*=\s*["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>"#)
            .expect("valid link href regex")
    })
}

fn normalize_domain(raw: &str) -> Option<String> {
    let candidate = raw.trim().to_lowercase();
    if candidate.is_empty()
        || candidate.contains('/')
        || candidate.contains('?')
        || candidate.contains('#')
        || candidate.contains(':')
        || !candidate.contains('.')
    {
        return None;
    }

    match Host::parse(&candidate).ok()? {
        Host::Domain(domain) => {
            if domain.ends_with(".local")
                || domain.ends_with(".internal")
                || domain.ends_with(".arpa")
                || domain.ends_with(".lan")
                || domain.ends_with(".home")
            {
                None
            } else {
                Some(domain.to_string())
            }
        }
        Host::Ipv4(_) | Host::Ipv6(_) => None,
    }
}

fn same_site_or_subdomain(host: &str, requested_domain: &str) -> bool {
    host == requested_domain || host.ends_with(&format!(".{requested_domain}"))
}

fn to_data_url(bytes: &[u8], content_type: &str) -> Option<String> {
    let normalized = content_type
        .split(';')
        .next()
        .map(str::trim)
        .unwrap_or("")
        .to_ascii_lowercase();

    let safe_content_type = match normalized.as_str() {
        "image/png"
        | "image/x-icon"
        | "image/vnd.microsoft.icon"
        | "image/svg+xml"
        | "image/jpeg"
        | "image/gif"
        | "image/webp" => normalized,
        _ => return None,
    };

    Some(format!(
        "data:{};base64,{}",
        safe_content_type,
        STANDARD.encode(bytes)
    ))
}

async fn download_icon(client: &reqwest::Client, url: Url) -> Option<String> {
    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)?
        .to_str()
        .ok()?
        .to_string();
    let bytes = response.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > MAX_ICON_BYTES {
        return None;
    }
    to_data_url(bytes.as_ref(), &content_type)
}

async fn find_icon_href(client: &reqwest::Client, origin: &Url) -> Option<String> {
    let response = client.get(origin.clone()).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let html = response.text().await.ok()?;
    if html.is_empty() {
        return None;
    }

    let truncated = if html.len() > MAX_HTML_BYTES {
        &html[..MAX_HTML_BYTES]
    } else {
        &html
    };

    href_regex()
        .captures(truncated)
        .and_then(|captures| captures.get(1))
        .map(|href| href.as_str().trim().to_string())
}

#[tauri::command]
pub async fn fetch_website_icon(request: FetchWebsiteIconRequest) -> Option<String> {
    let domain = normalize_domain(&request.domain)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .timeout(REQUEST_TIMEOUT)
        .user_agent("Rayvise/0.2")
        .build()
        .ok()?;

    let origin = Url::parse(&format!("https://{domain}")).ok()?;
    let direct_icon = origin.join("/favicon.ico").ok()?;
    if let Some(icon) = download_icon(&client, direct_icon).await {
        return Some(icon);
    }

    let href = find_icon_href(&client, &origin).await?;
    let resolved = origin.join(&href).ok()?;
    if resolved.scheme() != "https" {
        return None;
    }

    let host = resolved.host_str()?.to_ascii_lowercase();
    if !same_site_or_subdomain(&host, &domain) {
        return None;
    }

    download_icon(&client, resolved).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_domain_rejects_privateish_inputs() {
        assert_eq!(
            normalize_domain("github.com"),
            Some("github.com".to_string())
        );
        assert_eq!(normalize_domain("LOCALHOST"), None);
        assert_eq!(normalize_domain("127.0.0.1"), None);
        assert_eq!(normalize_domain("company.internal"), None);
        assert_eq!(normalize_domain("https://github.com"), None);
    }

    #[test]
    fn same_site_match_allows_subdomains_only() {
        assert!(same_site_or_subdomain("docs.github.com", "github.com"));
        assert!(same_site_or_subdomain("github.com", "github.com"));
        assert!(!same_site_or_subdomain(
            "githubusercontent.com",
            "github.com"
        ));
    }
}

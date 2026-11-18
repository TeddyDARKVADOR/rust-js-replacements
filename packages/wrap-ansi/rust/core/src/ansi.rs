//! Escape sequences recognized by wrap-ansi 10.0.2.
//!
//! The grammar reproduces `ANSI_ESCAPE_REGEX` of the original:
//!
//! ```text
//! (?:ESC \[ | U+009B) (?:(?<sgr>[0-9;:]*)m | [0-?]*[ -/]*[@-~])
//! | ESC \] (?:8;(?<parameters>[^;C0 DEL C1]*);(?<uri>[^C0 DEL C1]*)ST | [^C0 DEL C1]*ST)
//! ```
//!
//! where `ST` is BEL or `ESC \`. Every character class is ASCII or a control range, so matching
//! on UTF-8 bytes gives the same result as matching on UTF-16 code units.

pub(crate) const ESC: char = '\u{1B}';
pub(crate) const C1_CSI: char = '\u{9B}';
const BEL: char = '\u{7}';

/// A complete escape sequence found at some position of a string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Escape<'a> {
    /// The whole sequence.
    pub(crate) text: &'a str,
    pub(crate) kind: EscapeKind<'a>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EscapeKind<'a> {
    /// `CSI <parameters> m`, with the parameters (digits, `;`, and `:`).
    Sgr(&'a str),
    /// `OSC 8 ; <parameters> ; <uri> ST`.
    Hyperlink { parameters: &'a str, uri: &'a str },
    /// Any other complete CSI sequence or OSC string, kept as an opaque zero-width unit.
    Other,
}

/// `[^\u0000-\u001F\u007F-\u009F]`.
fn is_osc_payload(character: char) -> bool {
    !matches!(character, '\u{0}'..='\u{1F}' | '\u{7F}'..='\u{9F}')
}

/// Length in bytes of the longest prefix of `text` whose characters satisfy `predicate`.
fn prefix_len(text: &str, predicate: impl Fn(char) -> bool) -> usize {
    text.find(|character| !predicate(character))
        .unwrap_or(text.len())
}

/// Length of the string terminator (BEL or `ESC \`) at the start of `text`.
fn terminator_len(text: &str) -> Option<usize> {
    if text.starts_with(BEL) {
        Some(1)
    } else if text.starts_with("\u{1B}\\") {
        Some(2)
    } else {
        None
    }
}

/// Matches the parameters and final byte of a CSI sequence. `body` starts after the introducer.
fn match_csi(body: &str) -> Option<(usize, Option<&str>)> {
    let sgr_len = prefix_len(body, |c| matches!(c, '0'..='9' | ';' | ':'));
    if body[sgr_len..].starts_with('m') {
        return Some((sgr_len + 1, Some(&body[..sgr_len])));
    }

    // The three classes are disjoint, so greedy matching never needs to backtrack.
    let parameters = prefix_len(body, |c| matches!(c, '0'..='?'));
    let intermediates = prefix_len(&body[parameters..], |c| matches!(c, ' '..='/'));
    let end = parameters + intermediates;
    body[end..]
        .chars()
        .next()
        .is_some_and(|c| matches!(c, '@'..='~'))
        .then_some((end + 1, None))
}

/// Matches an OSC string. `body` starts after `ESC ]`.
fn match_osc(body: &str) -> Option<(usize, EscapeKind<'_>)> {
    if let Some(link) = body.strip_prefix("8;") {
        let parameters_len = prefix_len(link, |c| c != ';' && is_osc_payload(c));
        if let Some(rest) = link[parameters_len..].strip_prefix(';') {
            let uri_len = prefix_len(rest, is_osc_payload);
            if let Some(terminator) = terminator_len(&rest[uri_len..]) {
                let length = 2 + parameters_len + 1 + uri_len + terminator;
                let kind = EscapeKind::Hyperlink {
                    parameters: &link[..parameters_len],
                    uri: &rest[..uri_len],
                };
                return Some((length, kind));
            }
        }
    }

    let payload_len = prefix_len(body, is_osc_payload);
    terminator_len(&body[payload_len..])
        .map(|terminator| (payload_len + terminator, EscapeKind::Other))
}

/// Matches a complete escape sequence starting exactly at byte offset `index` of `text`.
pub(crate) fn match_escape(text: &str, index: usize) -> Option<Escape<'_>> {
    let rest = &text[index..];
    let (introducer, csi) = if rest.starts_with("\u{1B}[") {
        (2, true)
    } else if rest.starts_with(C1_CSI) {
        (C1_CSI.len_utf8(), true)
    } else if rest.starts_with("\u{1B}]") {
        (2, false)
    } else {
        return None;
    };

    let body = &rest[introducer..];
    let (body_len, kind) = if csi {
        let (length, sgr) = match_csi(body)?;
        (length, sgr.map_or(EscapeKind::Other, EscapeKind::Sgr))
    } else {
        match_osc(body)?
    };

    Some(Escape {
        text: &rest[..introducer + body_len],
        kind,
    })
}

/// A piece of a string: plain text, or a complete escape sequence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Segment<'a> {
    Text(&'a str),
    Escape(Escape<'a>),
}

/// Walks `text` as alternating runs of plain text and complete escape sequences
/// (`forEachSegment` in the original). An introducer that does not start a valid sequence stays
/// plain text. Runs of plain text are never empty.
pub(crate) fn segments(text: &str) -> impl Iterator<Item = Segment<'_>> {
    let mut plain_start = 0;
    let mut search_from = 0;
    let mut pending_escape: Option<Escape<'_>> = None;

    std::iter::from_fn(move || {
        if let Some(escape) = pending_escape.take() {
            return Some(Segment::Escape(escape));
        }

        while let Some(offset) = text[search_from..].find([ESC, C1_CSI]) {
            let index = search_from + offset;
            let Some(escape) = match_escape(text, index) else {
                search_from = index + text[index..].chars().next().map_or(1, char::len_utf8);
                continue;
            };

            let plain = &text[plain_start..index];
            search_from = index + escape.text.len();
            plain_start = search_from;
            if plain.is_empty() {
                return Some(Segment::Escape(escape));
            }

            pending_escape = Some(escape);
            return Some(Segment::Text(plain));
        }

        search_from = text.len();
        let plain = &text[plain_start..];
        plain_start = text.len();
        (!plain.is_empty()).then_some(Segment::Text(plain))
    })
}

/// The text without its escape sequences.
pub(crate) fn plain_text(text: &str) -> String {
    segments(text)
        .filter_map(|segment| match segment {
            Segment::Text(plain) => Some(plain),
            Segment::Escape(_) => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{Escape, EscapeKind, Segment, match_escape, plain_text, segments};

    fn kind(text: &str) -> Option<EscapeKind<'_>> {
        match_escape(text, 0).map(|escape| escape.kind)
    }

    #[test]
    fn sgr_sequences() {
        assert_eq!(kind("\u{1B}[31m"), Some(EscapeKind::Sgr("31")));
        assert_eq!(kind("\u{1B}[m"), Some(EscapeKind::Sgr("")));
        assert_eq!(
            kind("\u{9B}38:2::1:2:3m"),
            Some(EscapeKind::Sgr("38:2::1:2:3"))
        );
        // Private parameters make it an ordinary CSI sequence.
        assert_eq!(kind("\u{1B}[?25m"), Some(EscapeKind::Other));
        assert_eq!(kind("\u{1B}[2J"), Some(EscapeKind::Other));
    }

    #[test]
    fn incomplete_sequences_are_not_matched() {
        assert_eq!(kind("\u{1B}[31"), None);
        assert_eq!(kind("\u{1B}x"), None);
        assert_eq!(kind("\u{1B}]8;;https://example.com"), None);
    }

    #[test]
    fn osc_sequences() {
        assert_eq!(
            kind("\u{1B}]8;id=1;https://example.com\u{7}"),
            Some(EscapeKind::Hyperlink {
                parameters: "id=1",
                uri: "https://example.com"
            })
        );
        assert_eq!(
            kind("\u{1B}]8;;\u{1B}\\"),
            Some(EscapeKind::Hyperlink {
                parameters: "",
                uri: ""
            })
        );
        assert_eq!(kind("\u{1B}]0;title\u{7}"), Some(EscapeKind::Other));
        // A link without its second `;` is still a complete OSC string.
        assert_eq!(kind("\u{1B}]8;x\u{7}"), Some(EscapeKind::Other));
    }

    #[test]
    fn segments_alternate_text_and_escapes() {
        let text = "a\u{1B}[1mb\u{1B}c\u{1B}[22m";
        let parts: Vec<Segment<'_>> = segments(text).collect();
        assert_eq!(
            parts,
            vec![
                Segment::Text("a"),
                Segment::Escape(Escape {
                    text: "\u{1B}[1m",
                    kind: EscapeKind::Sgr("1")
                }),
                Segment::Text("b\u{1B}c"),
                Segment::Escape(Escape {
                    text: "\u{1B}[22m",
                    kind: EscapeKind::Sgr("22")
                }),
            ]
        );
        assert_eq!(plain_text(text), "ab\u{1B}c");
    }
}

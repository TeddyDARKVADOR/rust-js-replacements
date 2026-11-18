//! Word wrapping of strings that contain ANSI escape codes.
//!
//! This crate reproduces the behavior of the [`wrap-ansi`](https://github.com/chalk/wrap-ansi) npm
//! package, version 10.0.2, including the widths of its `string-width` 8.3.0 dependency (see
//! [`string_width`]). It is the platform-independent core of the Node.js binding.
//!
//! ```
//! use wrap_ansi_core::{wrap_ansi, Options};
//!
//! assert_eq!(wrap_ansi("The quick brown fox", 10.0, Options::default()), "The quick\nbrown fox");
//! assert_eq!(
//!     wrap_ansi("\u{1B}[31mred text here\u{1B}[39m", 8.0, Options::default()),
//!     "\u{1B}[31mred text\u{1B}[39m\n\u{1B}[31mhere\u{1B}[39m",
//! );
//! ```
//!
//! # Algorithm
//!
//! Each function follows the function of the same role in the original `index.js`:
//!
//! 1. Plain text (not the escape sequences) is normalized to NFC, `\r\n` becomes `\n`, and every
//!    line is wrapped separately after expanding tabs to 8-column stops.
//! 2. A line is split into words on spaces and the words are placed on rows; long words are broken
//!    between grapheme clusters in hard mode or when `word_wrap` is off.
//! 3. Rows are trimmed, joined, and every row break closes the active styles and hyperlink, which
//!    are reopened on the next row.
//!
//! Column counts are `f64` because the original compares JavaScript numbers: fractional, zero,
//! negative, infinite, and NaN values behave as they do there.

#![forbid(unsafe_code)]

mod ansi;
mod js;
mod sgr;
mod tables;
mod width;

use std::borrow::Cow;

use unicode_normalization::{IsNormalized, UnicodeNormalization, is_nfc_quick};
use unicode_segmentation::UnicodeSegmentation;

use ansi::{EscapeKind, Segment, match_escape, plain_text, segments};
use sgr::ActiveStyles;

pub use width::string_width;

const TAB_SIZE: usize = 8;

/// Options of [`wrap_ansi`], with the same defaults as the original.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    /// Break words longer than the column count, so that no row is wider. Defaults to `false`.
    pub hard: bool,
    /// Break rows at spaces. When `false`, rows are filled completely and words are split.
    /// Defaults to `true`.
    pub word_wrap: bool,
    /// Remove the whitespace around rows. Defaults to `true`.
    pub trim: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            hard: false,
            word_wrap: true,
            trim: true,
        }
    }
}

/// Converts a width to the JavaScript number it is compared with. Widths are far below 2^53.
#[allow(clippy::cast_precision_loss)]
fn number(width: usize) -> f64 {
    width as f64
}

/// The visible width of a string, ignoring its escape sequences (`getWidth`).
fn visible_width(text: &str) -> usize {
    if text.contains([ansi::ESC, ansi::C1_CSI]) {
        string_width(&plain_text(text))
    } else {
        string_width(text)
    }
}

/// Normalizes plain text to NFC, but not the escape sequences: a combining mark that follows a
/// sequence would otherwise compose with its last character (`normalizeText`).
fn normalize_text(input: &str) -> Cow<'_, str> {
    if is_nfc_quick(input.chars()) == IsNormalized::Yes {
        return Cow::Borrowed(input);
    }

    let mut normalized = String::with_capacity(input.len());
    for segment in segments(input) {
        match segment {
            Segment::Text(text) => normalized.extend(text.nfc()),
            Segment::Escape(escape) => normalized.push_str(escape.text),
        }
    }

    Cow::Owned(normalized)
}

/// Expands tabs to spaces with 8-column tab stops (`expandTabs`).
fn expand_tabs(line: &str) -> Cow<'_, str> {
    if !line.contains('\t') {
        return Cow::Borrowed(line);
    }

    let mut visible = 0;
    let mut expanded = String::with_capacity(line.len() + TAB_SIZE);
    let mut plain_since_tab = String::new();

    for segment in segments(line) {
        let text = match segment {
            Segment::Text(text) => text,
            Segment::Escape(escape) => {
                expanded.push_str(escape.text);
                continue;
            }
        };

        let mut parts = text.split('\t').peekable();
        while let Some(part) = parts.next() {
            expanded.push_str(part);
            plain_since_tab.push_str(part);

            if parts.peek().is_some() {
                visible += string_width(&plain_since_tab);
                plain_since_tab.clear();
                let spaces = TAB_SIZE - visible % TAB_SIZE;
                expanded.extend(std::iter::repeat_n(' ', spaces));
                visible += spaces;
            }
        }
    }

    Cow::Owned(expanded)
}

/// A word: the text between two spaces, escape sequences included.
struct Word<'a> {
    value: &'a str,
    width: usize,
}

/// Splits a line on spaces, ignoring spaces inside escape sequences (`splitWords`). The width of
/// a word is measured once on its plain text, so a cluster split by a sequence counts once.
fn split_words(line: &str) -> Vec<Word<'_>> {
    let mut words = Vec::new();
    let mut word_start = 0;
    let mut offset = 0;

    for segment in segments(line) {
        let length = match segment {
            Segment::Text(text) => {
                for (index, _) in text.match_indices(' ') {
                    words.push(&line[word_start..offset + index]);
                    word_start = offset + index + 1;
                }
                text.len()
            }
            Segment::Escape(escape) => escape.text.len(),
        };
        offset += length;
    }
    words.push(&line[word_start..]);

    words
        .into_iter()
        .map(|value| Word {
            value,
            width: visible_width(value),
        })
        .collect()
}

/// Splits a word into escape sequences, which are zero-width and never split, and grapheme
/// clusters with their widths (`getTokens`).
fn tokens(word: &str) -> Vec<(&str, usize)> {
    let mut tokens = Vec::new();
    for segment in segments(word) {
        match segment {
            Segment::Escape(escape) => tokens.push((escape.text, 0)),
            Segment::Text(text) if text.bytes().all(|byte| matches!(byte, 0x20..=0x7E)) => {
                tokens.extend((0..text.len()).map(|index| (&text[index..=index], 1)));
            }
            Segment::Text(text) => {
                tokens.extend(
                    text.graphemes(true)
                        .map(|cluster| (cluster, string_width(cluster))),
                );
            }
        }
    }

    tokens
}

fn last_row(rows: &mut [String]) -> &mut String {
    rows.last_mut().expect("there is always at least one row")
}

/// Breaks a long word across rows, starting on a row of width `row_width` (`wrapWord`). Returns
/// the width of the row the word ends on.
#[allow(
    clippy::float_cmp,
    reason = "a row is complete when its width is exactly `columns`, as with JavaScript's ==="
)]
fn wrap_word(rows: &mut Vec<String>, word: &str, columns: f64, row_width: usize) -> usize {
    let tokens = tokens(word);
    let mut visible = row_width;

    for (index, &(token, token_width)) in tokens.iter().enumerate() {
        // Escape sequences and combining marks are zero-width and stay on the current row.
        if token_width > 0 && visible > 0 && number(visible + token_width) > columns {
            rows.push(String::new());
            visible = 0;
        }

        last_row(rows).push_str(token);
        visible += token_width;

        if number(visible) == columns && index < tokens.len() - 1 {
            rows.push(String::new());
            visible = 0;
        }
    }

    // The last row may hold only escape sequences: move them to the previous row.
    if visible == 0 && rows.len() > 1 && rows.last().is_some_and(|row| !row.is_empty()) {
        let row = rows.pop().unwrap_or_default();
        last_row(rows).push_str(&row);
    }

    // Tokens are measured one by one, so only the finished row tells the true width.
    rows.last().map_or(0, |row| visible_width(row))
}

/// Removes the spaces after the last visible character, keeping the escape sequences among them
/// (`stringVisibleTrimSpacesRight`).
fn trim_spaces_right(row: &str) -> Cow<'_, str> {
    if !row.contains(' ') {
        return Cow::Borrowed(row);
    }

    let mut parts: Vec<(&str, bool)> = segments(row)
        .map(|segment| match segment {
            Segment::Text(text) => (text, false),
            Segment::Escape(escape) => (escape.text, true),
        })
        .collect();

    for (text, is_escape) in parts.iter_mut().rev() {
        if *is_escape {
            continue;
        }

        *text = text.trim_end_matches(' ');
        if string_width(text) > 0 {
            break;
        }
    }

    Cow::Owned(parts.into_iter().map(|(text, _)| text).collect())
}

/// Wraps one line without newlines (`exec`).
fn wrap_line(line: &str, columns: f64, options: Options) -> String {
    if options.trim && js::is_blank(line) {
        return String::new();
    }

    let mut rows = vec![String::new()];
    let mut row_width: usize = 0;
    // A row that starts with content can never become trimmable again.
    let mut trimmed_row = None;

    for (word_index, word) in split_words(line).into_iter().enumerate() {
        let row_index = rows.len() - 1;
        if options.trim && trimmed_row != Some(row_index) {
            let row = &rows[row_index];
            let leading_whitespace = row.len() - js::trim_start(row).len();
            if leading_whitespace > 0 {
                rows[row_index].drain(..leading_whitespace);
                row_width = visible_width(&rows[row_index]);
            }

            if !rows[row_index].is_empty() {
                trimmed_row = Some(row_index);
            }
        }

        if word_index > 0 {
            if number(row_width) >= columns && (!options.word_wrap || !options.trim) {
                rows.push(String::new());
                row_width = 0;
            }

            if row_width > 0 || !options.trim {
                last_row(&mut rows).push(' ');
                row_width += 1;
            }
        }

        let word_width = number(word.width);

        // In hard mode, no row may be wider than `columns`.
        if options.hard && options.word_wrap && word_width > columns {
            let remaining_columns = columns - number(row_width);
            let breaks_starting_this_row =
                1.0 + ((word_width - remaining_columns - 1.0) / columns).floor();
            let breaks_starting_next_row = ((word_width - 1.0) / columns).floor();
            if breaks_starting_next_row < breaks_starting_this_row {
                rows.push(String::new());
                row_width = 0;
            }

            row_width = wrap_word(&mut rows, word.value, columns, row_width);
            continue;
        }

        if number(row_width) + word_width > columns && row_width > 0 && word.width > 0 {
            if !options.word_wrap && number(row_width) < columns {
                row_width = wrap_word(&mut rows, word.value, columns, row_width);
                continue;
            }

            rows.push(String::new());
            row_width = 0;
        }

        if number(row_width) + word_width > columns && !options.word_wrap {
            row_width = wrap_word(&mut rows, word.value, columns, row_width);
            continue;
        }

        last_row(&mut rows).push_str(word.value);
        row_width += word.width;
    }

    let rows: Vec<Cow<'_, str>> = if options.trim {
        rows.iter().map(|row| trim_spaces_right(row)).collect()
    } else {
        rows.iter().map(|row| Cow::Borrowed(row.as_str())).collect()
    };

    restore_styles_across_rows(&rows.join("\n"))
}

/// Appends `OSC 8 ; parameters ; uri BEL`.
fn push_hyperlink(output: &mut String, parameters: &str, uri: &str) {
    output.push_str("\u{1B}]8;");
    output.push_str(parameters);
    output.push(';');
    output.push_str(uri);
    output.push('\u{7}');
}

/// Closes the active styles and hyperlink before every row break and reopens them after, so that
/// each row stands on its own (`restoreStylesAcrossRows`).
fn restore_styles_across_rows(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut styles = ActiveStyles::default();
    let mut hyperlink: Option<(&str, &str)> = None;
    let mut index = 0;
    let mut copied = 0;

    while let Some(offset) = text[index..].find(['\n', ansi::ESC, ansi::C1_CSI]) {
        index += offset;

        if !text[index..].starts_with('\n') {
            let Some(escape) = match_escape(text, index) else {
                index += text[index..].chars().next().map_or(1, char::len_utf8);
                continue;
            };

            match escape.kind {
                EscapeKind::Sgr(parameters) => styles.apply(parameters),
                EscapeKind::Hyperlink { parameters, uri } => {
                    hyperlink = (!uri.is_empty()).then_some((parameters, uri));
                }
                EscapeKind::Other => {}
            }

            index += escape.text.len();
            continue;
        }

        // Everything up to the row break is copied verbatim, sequences included.
        output.push_str(&text[copied..index]);

        // An empty row never reopened anything, so there is nothing to close.
        if index > copied {
            if hyperlink.is_some() {
                push_hyperlink(&mut output, "", "");
            }
            styles.push_closing(&mut output);
        }

        output.push('\n');
        index += 1;
        copied = index;

        // An empty row stays unstyled until the next row with content.
        if index < text.len() && !text[index..].starts_with('\n') {
            let mut opening = styles.clone();
            let mut position = index;
            while let Some(escape) = match_escape(text, position) {
                if let EscapeKind::Sgr(parameters) = escape.kind {
                    opening.apply_resets(parameters);
                }
                position += escape.text.len();
            }

            opening.push_opening(&mut output);
            if let Some((parameters, uri)) = hyperlink {
                push_hyperlink(&mut output, parameters, uri);
            }
        }
    }

    output.push_str(&text[copied..]);
    output
}

/// Wraps `input` to `columns` terminal columns, preserving ANSI escape codes, as wrap-ansi 10.0.2
/// does.
pub fn wrap_ansi(input: &str, columns: f64, options: Options) -> String {
    let normalized = normalize_text(input);
    let text = if normalized.contains("\r\n") {
        Cow::Owned(normalized.replace("\r\n", "\n"))
    } else {
        normalized
    };

    text.split('\n')
        .map(|line| wrap_line(&expand_tabs(line), columns, options))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::{Options, wrap_ansi};

    const HARD: Options = Options {
        hard: true,
        word_wrap: true,
        trim: true,
    };

    #[test]
    fn soft_wrap_keeps_long_words() {
        assert_eq!(
            wrap_ansi("a supercalifragilistic word", 10.0, Options::default()),
            "a\nsupercalifragilistic\nword"
        );
    }

    #[test]
    fn hard_wrap_breaks_long_words() {
        assert_eq!(wrap_ansi("abcdefghij", 4.0, HARD), "abcd\nefgh\nij");
        assert_eq!(
            wrap_ansi("\u{53E4}\u{6C60}\u{3084}", 4.0, HARD),
            "\u{53E4}\u{6C60}\n\u{3084}"
        );
    }

    #[test]
    fn styles_and_hyperlinks_are_reopened_on_each_row() {
        assert_eq!(
            wrap_ansi("\u{1B}[1mbold words\u{1B}[22m", 5.0, Options::default()),
            "\u{1B}[1mbold\u{1B}[22m\n\u{1B}[1mwords\u{1B}[22m"
        );
        assert_eq!(
            wrap_ansi(
                "\u{1B}]8;;https://x.y\u{7}two words\u{1B}]8;;\u{7}",
                5.0,
                Options::default()
            ),
            "\u{1B}]8;;https://x.y\u{7}two\u{1B}]8;;\u{7}\n\u{1B}]8;;https://x.y\u{7}words\u{1B}]8;;\u{7}"
        );
    }

    #[test]
    fn trim_and_newlines() {
        assert_eq!(wrap_ansi("   ", 10.0, Options::default()), "");
        assert_eq!(wrap_ansi("  a  b  ", 10.0, Options::default()), "a  b");
        assert_eq!(wrap_ansi("a\r\nb", 10.0, Options::default()), "a\nb");
        let no_trim = Options {
            trim: false,
            ..Options::default()
        };
        assert_eq!(wrap_ansi("  a  ", 10.0, no_trim), "  a  ");
    }

    #[test]
    fn tabs_expand_to_eight_columns() {
        assert_eq!(wrap_ansi("a\tb", 20.0, Options::default()), "a       b");
    }

    #[test]
    fn word_wrap_off_fills_rows() {
        let fill = Options {
            word_wrap: false,
            ..Options::default()
        };
        assert_eq!(wrap_ansi("abc defgh", 4.0, fill), "abc\ndefg\nh");
    }
}

//! Visual width of strings in terminal columns.
//!
//! This crate reproduces the behavior of the [`string-width`](https://github.com/sindresorhus/string-width)
//! npm package, version 9.0.0, running on Node.js with Unicode 17 (see [`UNICODE_VERSION`]).
//! It is the platform-independent core shared by the Node.js and WebAssembly bindings.
//!
//! ```
//! use string_width_core::{string_width, Options};
//!
//! assert_eq!(string_width("hello", Options::default()), 5);
//! assert_eq!(string_width("\u{53E4}", Options::default()), 2);
//! assert_eq!(string_width("\u{1B}[1m\u{53E4}\u{1B}[22m", Options::default()), 2);
//! ```
//!
//! # Algorithm
//!
//! The input is split into extended grapheme clusters and each cluster is measured with the same
//! rules as string-width 9.0.0:
//!
//! 1. Non-printing clusters (default ignorable, control, format, nonspacing and enclosing marks)
//!    are zero-width. Tabs are ignored.
//! 2. Clusters starting with an RGI emoji, regional indicators, or a keycap base with VS16 are two
//!    columns wide, plus two columns for each stray emoji modifier. A wide BMP emoji followed by
//!    VS15 is one column wide.
//! 3. Minimally-qualified emoji ZWJ sequences are two columns wide.
//! 4. A cluster starting with Hangul takes the width of its first code point.
//! 5. Otherwise the East Asian Width of every visible code point before the first ZWJ is summed.
//! 6. Spacing prepended concatenation marks take one column each unless the following glyph is
//!    wide.

#![forbid(unsafe_code)]

mod ansi;
mod properties;
mod tables;

use std::borrow::Cow;

use unicode_segmentation::UnicodeSegmentation;

pub use ansi::strip_ansi;
use properties::{
    east_asian_width, is_emoji_presentation, is_regional_indicator, is_visible,
    rgi_emoji_prefix_len, stray_emoji_modifier_count, zwj_pictographic_end,
};

/// Unicode version of the character tables.
pub const UNICODE_VERSION: &str = tables::UNICODE_VERSION;

/// Options controlling how the width is computed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    /// Count East Asian Ambiguous characters as one column instead of two. Defaults to `true`.
    pub ambiguous_is_narrow: bool,
    /// Count the characters of ANSI escape sequences instead of removing the sequences first.
    /// Defaults to `false`.
    pub count_ansi_escape_codes: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            ambiguous_is_narrow: true,
            count_ansi_escape_codes: false,
        }
    }
}

/// Returns the number of terminal columns required to display `input`.
pub fn string_width(input: &str, options: Options) -> usize {
    if input.is_empty() {
        return 0;
    }

    let text = if !options.count_ansi_escape_codes && input.contains(['\u{1B}', '\u{9B}']) {
        strip_ansi(input)
    } else {
        Cow::Borrowed(input)
    };

    if text.bytes().all(is_printable_ascii) {
        return text.len();
    }

    unicode_width(&text, !options.ambiguous_is_narrow)
}

const fn is_printable_ascii(byte: u8) -> bool {
    matches!(byte, 0x20..=0x7E)
}

fn unicode_width(text: &str, ambiguous_as_wide: bool) -> usize {
    let mut width = 0;
    let mut text = text;

    // Count the leading printable ASCII directly, keeping its last character as a possible
    // grapheme base for what follows.
    let first_other = text
        .bytes()
        .position(|byte| !is_printable_ascii(byte))
        .unwrap_or(text.len());
    if first_other > 1 {
        width = first_other - 1;
        text = &text[width..];
    }

    // Count the trailing printable ASCII directly, keeping its first character with the rest.
    let suffix_start = text.len()
        - text
            .bytes()
            .rev()
            .take_while(|&byte| is_printable_ascii(byte))
            .count();
    if suffix_start + 1 < text.len() {
        width += text.len() - suffix_start - 1;
        text = &text[..=suffix_start];
    }

    // Printable ASCII, common Han, and precomposed Hangul have fixed widths and never form
    // multi-character clusters together.
    if let Some(fixed_width) = fixed_width(text) {
        return width + fixed_width;
    }

    let text = collapse_kirat_rai_vowels(text);
    for cluster in text.graphemes(true) {
        width += single_code_unit_width(cluster, ambiguous_as_wide)
            .unwrap_or_else(|| cluster_width(cluster, ambiguous_as_wide));
    }

    width
}

fn fixed_width(text: &str) -> Option<usize> {
    text.chars()
        .try_fold(0, |width, character| match character {
            '\u{20}'..='\u{7E}' => Some(width + 1),
            '\u{4E00}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7A3}' => Some(width + 2),
            _ => None,
        })
}

fn is_kirat_rai_vowel(character: char) -> bool {
    matches!(character, '\u{16D63}'..='\u{16D6A}')
}

/// Kirat Rai vowel runs form one glyph, including canonically decomposed vowels. Keeps only the
/// first vowel of each run so that every spelling gets the same width.
fn collapse_kirat_rai_vowels(text: &str) -> Cow<'_, str> {
    if !text.contains(is_kirat_rai_vowel) {
        return Cow::Borrowed(text);
    }

    let mut previous_is_vowel = false;
    let collapsed = text
        .chars()
        .filter(|&character| {
            let is_vowel = is_kirat_rai_vowel(character);
            let keep = !(is_vowel && previous_is_vowel);
            previous_is_vowel = is_vowel;
            keep
        })
        .collect();
    Cow::Owned(collapsed)
}

/// Width of a cluster that is a single UTF-16 code unit, which always equals the East Asian Width
/// of its code point when visible. Returns `None` for any other cluster.
fn single_code_unit_width(cluster: &str, ambiguous_as_wide: bool) -> Option<usize> {
    let mut characters = cluster.chars();
    let character = characters.next()?;
    if characters.next().is_some() || u32::from(character) > 0xFFFF {
        return None;
    }

    Some(if is_visible(character) {
        east_asian_width(character, ambiguous_as_wide)
    } else {
        0
    })
}

fn is_prepended_concatenation_mark(character: char) -> bool {
    matches!(
        character,
        '\u{600}'
            ..='\u{605}'
                | '\u{6DD}'
                | '\u{890}'
                | '\u{891}'
                | '\u{8E2}'
                | '\u{110BD}'
                | '\u{110CD}'
    )
}

fn is_hangul(character: char) -> bool {
    matches!(
        character,
        '\u{1100}'..='\u{11FF}'
            | '\u{A960}'..='\u{A97C}'
            | '\u{AC00}'..='\u{D7A3}'
            | '\u{D7B0}'..='\u{D7C6}'
            | '\u{D7CB}'..='\u{D7FB}'
    )
}

/// The cluster starting at its first visible character, or `None` if it is entirely zero-width.
fn base_visible(cluster: &str) -> Option<&str> {
    cluster.find(is_visible).map(|index| &cluster[index..])
}

/// `^(?:\p{RGI_Emoji}|\p{Regional_Indicator}{1,2}|[\d#*]\u{FE0F})`: byte length of the match.
fn emoji_prefix_len(text: &str) -> Option<usize> {
    if let Some(length) = rgi_emoji_prefix_len(text) {
        return Some(length);
    }

    let mut characters = text.chars();
    let first = characters.next()?;
    let second = characters.next();

    if is_regional_indicator(first) {
        let pair = second.is_some_and(is_regional_indicator);
        return Some(first.len_utf8() * if pair { 2 } else { 1 });
    }

    (matches!(first, '0'..='9' | '#' | '*') && second == Some('\u{FE0F}'))
        .then(|| 1 + '\u{FE0F}'.len_utf8())
}

/// A wide BMP emoji followed by VS15 asks for its narrow text style.
fn is_text_presentation_emoji(text: &str) -> bool {
    let mut characters = text.chars();
    characters
        .next()
        .is_some_and(|first| u32::from(first) <= 0xFFFF && is_emoji_presentation(first))
        && characters.next() == Some('\u{FE0E}')
}

fn cluster_width(cluster: &str, ambiguous_as_wide: bool) -> usize {
    let Some(first) = cluster.chars().next() else {
        return 0;
    };

    // Spacing prepended concatenation marks are one column each, unless a wide glyph follows and
    // takes them into its own cell.
    let marks_end = cluster
        .find(|character| !is_prepended_concatenation_mark(character))
        .unwrap_or(cluster.len());
    if marks_end > 0 {
        let rest = &cluster[marks_end..];
        let rest_width = cluster_width(rest, ambiguous_as_wide);
        let is_wide_glyph =
            rest_width >= 2
                && base_visible(rest).is_some_and(|visible_rest| {
                    visible_rest.chars().next().is_some_and(|character| {
                        east_asian_width(character, ambiguous_as_wide) == 2
                    }) || emoji_prefix_len(visible_rest).is_some()
                        || zwj_pictographic_end(visible_rest).is_some()
                });
        let mark_count = cluster[..marks_end].chars().count();
        return if is_wide_glyph {
            rest_width
        } else {
            mark_count + rest_width
        };
    }

    let Some(visible) = base_visible(cluster) else {
        return 0;
    };

    // Checked on the raw cluster, since it can start with a default ignorable Hangul filler.
    if is_hangul(first) {
        return east_asian_width(first, ambiguous_as_wide)
            + 2 * stray_emoji_modifier_count(cluster, first.len_utf8());
    }

    if is_text_presentation_emoji(visible) {
        return 1;
    }

    if let Some(length) = emoji_prefix_len(visible) {
        return 2 + 2 * stray_emoji_modifier_count(visible, length);
    }

    if let Some(end) = zwj_pictographic_end(visible) {
        return 2 + 2 * stray_emoji_modifier_count(visible, end);
    }

    visible_code_points_width(visible, ambiguous_as_wide)
}

/// Sums the East Asian Width of the visible code points before the first ZWJ.
fn visible_code_points_width(visible: &str, ambiguous_as_wide: bool) -> usize {
    visible
        .chars()
        .take_while(|&character| character != '\u{200D}')
        .filter(|&character| is_visible(character))
        .map(|character| east_asian_width(character, ambiguous_as_wide))
        .sum()
}

#[cfg(test)]
mod tests {
    use super::{Options, string_width};

    fn width(input: &str) -> usize {
        string_width(input, Options::default())
    }

    #[test]
    fn measures_ascii() {
        assert_eq!(width(""), 0);
        assert_eq!(width("hello world"), 11);
    }

    #[test]
    fn measures_east_asian_text() {
        assert_eq!(width("\u{4F60}\u{597D}"), 4);
        assert_eq!(width("hello\u{4E16}\u{754C}"), 9);
    }

    #[test]
    fn honors_ambiguous_option() {
        let wide = Options {
            ambiguous_is_narrow: false,
            ..Options::default()
        };
        assert_eq!(width("\u{B1}"), 1);
        assert_eq!(string_width("\u{B1}", wide), 2);
    }

    #[test]
    fn handles_ansi_codes() {
        let colored = "\u{1B}[31mred\u{1B}[39m";
        assert_eq!(width(colored), 3);
        let counted = Options {
            count_ansi_escape_codes: true,
            ..Options::default()
        };
        assert_eq!(string_width(colored, counted), 11);
    }

    #[test]
    fn measures_emoji() {
        assert_eq!(width("\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"), 2);
        assert_eq!(width("\u{1F1FA}\u{1F1F8}"), 2);
        assert_eq!(width("1\u{FE0F}\u{20E3}"), 2);
        assert_eq!(width("1\u{20E3}"), 1);
        assert_eq!(width("\u{2614}\u{FE0E}"), 1);
    }

    #[test]
    fn ignores_zero_width_characters() {
        assert_eq!(width("a\u{200B}b"), 2);
        assert_eq!(width("e\u{301}"), 1);
        assert_eq!(width("\t"), 0);
    }

    #[test]
    fn measures_prepended_concatenation_marks() {
        assert_eq!(width("\u{600}abc"), 4);
    }
}

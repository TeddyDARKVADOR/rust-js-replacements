//! Width rules of string-width **8.3.0**, the version wrap-ansi 10.0.2 depends on.
//!
//! wrap-ansi always calls `stringWidth(text, {countAnsiEscapeCodes: true})` on text whose escape
//! sequences were already removed, so only that configuration is implemented: no ANSI stripping,
//! and East Asian Ambiguous characters are narrow.
//!
//! The rules differ from string-width 9.0.0 (implemented by `string-width-core`) for Hangul jamo,
//! prepended concatenation marks, regional indicators, keycaps, and the code points that follow the
//! base of a cluster. Only the Unicode property tables are shared.

use string_width_core::unicode::{
    east_asian_width, is_extended_pictographic, is_prepended_concatenation_mark, is_visible,
    rgi_emoji_prefix_len,
};
use unicode_segmentation::UnicodeSegmentation;

use crate::tables;

const ZERO_WIDTH_JOINER: char = '\u{200D}';
const COMBINING_ENCLOSING_KEYCAP: char = '\u{20E3}';

/// Clusters longer than this many UTF-16 code units are never treated as emoji sequences.
const MAX_EMOJI_SEQUENCE_LENGTH: usize = 50;

fn in_ranges(ranges: &[(u32, u32)], character: char) -> bool {
    let code_point = u32::from(character);
    ranges
        .binary_search_by(|&(start, end)| {
            if end < code_point {
                std::cmp::Ordering::Less
            } else if start > code_point {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

/// `[^\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Nonspacing_Mark}\p{Enclosing_Mark}]`.
///
/// string-width 9.0.0 counts spacing prepended concatenation marks (which are `Format`) as visible;
/// 8.3.0 does not.
fn is_visible_character(character: char) -> bool {
    is_visible(character) && !is_prepended_concatenation_mark(character)
}

fn is_spacing_mark(character: char) -> bool {
    in_ranges(tables::SPACING_MARK, character)
}

fn ambiguous_narrow_width(character: char) -> usize {
    east_asian_width(character, false)
}

/// `^\p{RGI_Emoji}$`.
fn is_rgi_emoji(cluster: &str) -> bool {
    rgi_emoji_prefix_len(cluster) == Some(cluster.len())
}

/// Unqualified keycaps (`^[\d#*]\u{20E3}$`) and ZWJ sequences with at least two
/// `Extended_Pictographic` code points.
fn is_double_width_non_rgi_emoji_sequence(cluster: &str) -> bool {
    if cluster.encode_utf16().count() > MAX_EMOJI_SEQUENCE_LENGTH {
        return false;
    }

    let mut characters = cluster.chars();
    if let (Some('0'..='9' | '#' | '*'), Some(COMBINING_ENCLOSING_KEYCAP), None) =
        (characters.next(), characters.next(), characters.next())
    {
        return true;
    }

    cluster.contains(ZERO_WIDTH_JOINER)
        && cluster
            .chars()
            .filter(|&character| is_extended_pictographic(character))
            .count()
            >= 2
}

fn is_hangul_leading_jamo(character: char) -> bool {
    matches!(character, '\u{1100}'..='\u{115F}' | '\u{A960}'..='\u{A97C}')
}

fn is_hangul_vowel_jamo(character: char) -> bool {
    matches!(character, '\u{1160}'..='\u{11A7}' | '\u{D7B0}'..='\u{D7C6}')
}

fn is_hangul_trailing_jamo(character: char) -> bool {
    matches!(character, '\u{11A8}'..='\u{11FF}' | '\u{D7CB}'..='\u{D7FB}')
}

fn is_hangul_jamo(character: char) -> bool {
    is_hangul_leading_jamo(character)
        || is_hangul_vowel_jamo(character)
        || is_hangul_trailing_jamo(character)
}

/// Modern Hangul L+V(+T) jamo shape as one two-column syllable block; unmatched jamo stay additive.
/// Returns `None` when the cluster does not start with a jamo.
fn hangul_cluster_width(visible: &str) -> Option<usize> {
    let characters: Vec<char> = visible
        .chars()
        .filter(|&c| is_visible_character(c))
        .collect();
    let mut width = 0;
    let mut index = 0;

    while let Some(&character) = characters.get(index) {
        if !is_hangul_jamo(character) {
            if width == 0 {
                return None;
            }

            // Mixed cluster (a jamo followed by something else): East Asian Width of the rest.
            return Some(
                width
                    + characters[index..]
                        .iter()
                        .map(|&rest| ambiguous_narrow_width(rest))
                        .sum::<usize>(),
            );
        }

        if is_hangul_leading_jamo(character)
            && characters
                .get(index + 1)
                .is_some_and(|&next| is_hangul_vowel_jamo(next))
        {
            width += 2;
            let has_trailing = characters
                .get(index + 2)
                .is_some_and(|&next| is_hangul_trailing_jamo(next));
            index += if has_trailing { 3 } else { 2 };
            continue;
        }

        width += ambiguous_narrow_width(character);
        index += 1;
    }

    (!characters.is_empty()).then_some(width)
}

/// Width of the spacing marks and Halfwidth and Fullwidth Forms after the first code point.
fn trailing_width(visible: &str) -> usize {
    visible
        .chars()
        .skip(1)
        .filter(|&character| {
            is_spacing_mark(character) || matches!(character, '\u{FF00}'..='\u{FFEF}')
        })
        .map(ambiguous_narrow_width)
        .sum()
}

fn cluster_width(cluster: &str) -> usize {
    let Some(start) = cluster.find(is_visible_character) else {
        return 0;
    };
    let visible = &cluster[start..];

    if is_rgi_emoji(cluster) || is_double_width_non_rgi_emoji_sequence(cluster) {
        return 2;
    }

    if let Some(width) = hangul_cluster_width(visible) {
        return width;
    }

    visible.chars().next().map_or(0, ambiguous_narrow_width) + trailing_width(visible)
}

/// Returns the width of `text` as `stringWidth(text, {countAnsiEscapeCodes: true})` from
/// string-width 8.3.0 does.
pub fn string_width(text: &str) -> usize {
    if text.bytes().all(|byte| matches!(byte, 0x20..=0x7E)) {
        return text.len();
    }

    text.graphemes(true).map(cluster_width).sum()
}

#[cfg(test)]
mod tests {
    use super::string_width;

    #[test]
    fn printable_ascii_is_one_column_per_character() {
        assert_eq!(string_width(""), 0);
        assert_eq!(string_width("hello world"), 11);
    }

    #[test]
    fn wide_and_zero_width_characters() {
        assert_eq!(string_width("\u{53E4}\u{6C60}"), 4);
        assert_eq!(string_width("e\u{301}"), 1);
        assert_eq!(string_width("\u{200B}"), 0);
        assert_eq!(string_width("\u{1B}"), 0);
    }

    #[test]
    fn emoji() {
        assert_eq!(string_width("\u{1F44D}\u{1F3FD}"), 2);
        assert_eq!(string_width("\u{1F1EB}\u{1F1F7}"), 2);
        assert_eq!(string_width("1\u{20E3}"), 2);
        assert_eq!(
            string_width("\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"),
            2
        );
    }

    #[test]
    fn differences_from_string_width_9() {
        // Lone regional indicator: 1 column in 8.3.0, 2 in 9.0.0.
        assert_eq!(string_width("\u{1F1EB}"), 1);
        // ARABIC NUMBER SIGN is invisible in 8.3.0, one column in 9.0.0.
        assert_eq!(string_width("\u{600}"), 0);
        assert_eq!(string_width("\u{600}1"), 1);
    }

    #[test]
    fn hangul_jamo() {
        // L+V is one syllable block; an unmatched leading jamo stays additive.
        assert_eq!(string_width("\u{1100}\u{1161}"), 2);
        assert_eq!(string_width("\u{1100}\u{1100}\u{1161}"), 4);
    }

    #[test]
    fn halfwidth_forms_after_the_base() {
        // HALFWIDTH KATAKANA LETTER KA + HALFWIDTH KATAKANA VOICED SOUND MARK.
        assert_eq!(string_width("\u{FF76}\u{FF9E}"), 2);
    }
}

//! Lookups into the generated Unicode tables.

use crate::tables;

const ZERO_WIDTH_JOINER: char = '\u{200D}';

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

/// Whether string-width treats the character as visible (printing).
pub fn is_visible(character: char) -> bool {
    matches!(character, '\u{20}'..='\u{7E}') || !in_ranges(tables::INVISIBLE, character)
}

/// East Asian Width as computed by `get-east-asian-width`: 2 for Wide and Fullwidth, 2 for
/// Ambiguous when `ambiguous_as_wide` is set, and 1 otherwise.
pub fn east_asian_width(character: char, ambiguous_as_wide: bool) -> usize {
    if character.is_ascii() {
        return 1;
    }

    if in_ranges(tables::EAST_ASIAN_WIDE, character)
        || (ambiguous_as_wide && in_ranges(tables::EAST_ASIAN_AMBIGUOUS, character))
    {
        2
    } else {
        1
    }
}

pub(crate) fn is_emoji_presentation(character: char) -> bool {
    in_ranges(tables::EMOJI_PRESENTATION, character)
}

pub(crate) fn is_emoji_modifier(character: char) -> bool {
    in_ranges(tables::EMOJI_MODIFIER, character)
}

pub(crate) fn is_emoji_modifier_base(character: char) -> bool {
    in_ranges(tables::EMOJI_MODIFIER_BASE, character)
}

/// Whether the character has the `Extended_Pictographic` property.
pub fn is_extended_pictographic(character: char) -> bool {
    in_ranges(tables::EXTENDED_PICTOGRAPHIC, character)
}

pub(crate) fn is_regional_indicator(character: char) -> bool {
    in_ranges(tables::REGIONAL_INDICATOR, character)
}

/// Byte length of the longest `\p{RGI_Emoji}` match at the start of `text`.
pub fn rgi_emoji_prefix_len(text: &str) -> Option<usize> {
    // Byte offsets of the end of the first 2..=MAX code points.
    let mut ends = [0_usize; tables::RGI_EMOJI_SEQUENCE_MAX_CHARS];
    let mut count = 0;
    for (index, character) in text
        .char_indices()
        .take(tables::RGI_EMOJI_SEQUENCE_MAX_CHARS)
    {
        ends[count] = index + character.len_utf8();
        count += 1;
    }

    // Like V8, prefer the longest sequence, then fall back to a single code point.
    for &end in ends[1..count.max(1)].iter().rev() {
        if tables::RGI_EMOJI_SEQUENCES
            .binary_search(&&text[..end])
            .is_ok()
        {
            return Some(end);
        }
    }

    let first = text.chars().next()?;
    in_ranges(tables::RGI_EMOJI_SINGLE, first).then(|| first.len_utf8())
}

/// Number of emoji modifiers at or after byte offset `from` that do not follow an emoji modifier
/// base or a ZWJ. Each one is displayed as a standalone color swatch.
pub(crate) fn stray_emoji_modifier_count(text: &str, from: usize) -> usize {
    if from >= text.len() {
        return 0;
    }

    let mut previous = text[..from].chars().next_back();
    let mut count = 0;
    for character in text[from..].chars() {
        let follows_base = previous.is_some_and(|previous| {
            previous == ZERO_WIDTH_JOINER || is_emoji_modifier_base(previous)
        });
        if is_emoji_modifier(character) && !follows_base {
            count += 1;
        }
        previous = Some(character);
    }

    count
}

/// Byte offset just after the first ZWJ followed by an `Extended_Pictographic` code point.
pub(crate) fn zwj_pictographic_end(text: &str) -> Option<usize> {
    let mut previous_is_zwj = false;
    for (index, character) in text.char_indices() {
        if previous_is_zwj && is_extended_pictographic(character) {
            return Some(index + character.len_utf8());
        }
        previous_is_zwj = character == ZERO_WIDTH_JOINER;
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tables_are_sorted_and_disjoint() {
        for ranges in [
            tables::INVISIBLE,
            tables::EAST_ASIAN_WIDE,
            tables::EAST_ASIAN_AMBIGUOUS,
            tables::EMOJI_PRESENTATION,
            tables::EMOJI_MODIFIER,
            tables::EMOJI_MODIFIER_BASE,
            tables::EXTENDED_PICTOGRAPHIC,
            tables::REGIONAL_INDICATOR,
            tables::RGI_EMOJI_SINGLE,
        ] {
            for pair in ranges.windows(2) {
                assert!(pair[0].0 <= pair[0].1 && pair[0].1 < pair[1].0);
            }
        }

        assert!(
            tables::RGI_EMOJI_SEQUENCES
                .windows(2)
                .all(|pair| pair[0] < pair[1])
        );
        assert!(
            tables::RGI_EMOJI_SEQUENCES
                .iter()
                .all(|sequence| sequence.chars().count() <= tables::RGI_EMOJI_SEQUENCE_MAX_CHARS)
        );
    }

    #[test]
    fn finds_longest_rgi_prefix() {
        let family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
        assert_eq!(rgi_emoji_prefix_len(family), Some(family.len()));
        assert_eq!(rgi_emoji_prefix_len("\u{1F600}x"), Some(4));
        assert_eq!(rgi_emoji_prefix_len("a"), None);
    }

    #[test]
    fn counts_stray_modifiers() {
        // Waving hand (a modifier base) followed by two skin tones: only the second is stray.
        let text = "\u{1F44B}\u{1F3FB}\u{1F3FC}";
        assert_eq!(stray_emoji_modifier_count(text, 4), 1);
    }
}

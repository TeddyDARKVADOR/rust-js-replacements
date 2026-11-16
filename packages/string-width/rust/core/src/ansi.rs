//! ANSI escape sequence removal, equivalent to `strip-ansi` 7.2.0 with `ansi-regex` 6.6.0.
//!
//! `ansi-regex` is a single regular expression made of five alternatives, tried in order at each
//! position. Every repetition in it is followed by a character class disjoint from the repeated
//! class, so the expression never needs to backtrack. That makes a direct scanner equivalent to the
//! regular expression while avoiding a regex engine dependency.

use std::borrow::Cow;

const BEL: char = '\u{07}';
const ESC: char = '\u{1B}';
const CSI_8BIT: char = '\u{9B}';
const OSC_8BIT: char = '\u{9D}';
const STRING_TERMINATOR_8BIT: char = '\u{9C}';

/// Removes ANSI escape sequences from `input`.
///
/// Like `strip-ansi`, the input is returned unchanged unless it contains an ESC (U+001B) or a
/// C1 CSI (U+009B) character, even if it contains other C1 sequence introducers.
pub fn strip_ansi(input: &str) -> Cow<'_, str> {
    if !input.contains([ESC, CSI_8BIT]) {
        return Cow::Borrowed(input);
    }

    let mut output = String::with_capacity(input.len());
    let mut copied_until = 0;
    let mut index = 0;

    while let Some(character) = input[index..].chars().next() {
        if let Some(end) = match_sequence(input, index, character) {
            output.push_str(&input[copied_until..index]);
            index = end;
            copied_until = end;
        } else {
            index += character.len_utf8();
        }
    }

    output.push_str(&input[copied_until..]);
    Cow::Owned(output)
}

/// Returns the end of the escape sequence starting at `start`, if there is one.
fn match_sequence(input: &str, start: usize, first: char) -> Option<usize> {
    let after_first = start + first.len_utf8();

    match first {
        ESC => {
            // Alternatives in the order of the regular expression: Linux palette, OSC, control
            // string, CSI, and finally the other escapes, which can also match `ESC P` or `ESC k`.
            let second = input[after_first..].chars().next()?;
            let after_second = after_first + second.len_utf8();
            let introduced = match second {
                ']' => match_linux_palette(input, after_second)
                    .or_else(|| match_osc_payload(input, after_second)),
                'P' | 'X' | '^' | '_' | 'k' => match_control_string_payload(input, after_second),
                '[' => match_csi_body(input, after_second),
                _ => None,
            };
            introduced.or_else(|| match_escape(input, after_first))
        }
        OSC_8BIT => match_osc_payload(input, after_first),
        '\u{90}' | '\u{98}' | '\u{9E}' | '\u{9F}' => {
            match_control_string_payload(input, after_first)
        }
        CSI_8BIT => match_csi_body(input, after_first),
        _ => None,
    }
}

/// Characters that end or cancel an OSC or control string payload.
fn is_string_control(character: char) -> bool {
    matches!(character, '\u{18}' | '\u{1A}' | ESC | '\u{80}'..='\u{9F}')
}

/// Matches a string terminator (`ESC \` or U+009C) at `index`.
fn match_string_terminator(input: &str, index: usize) -> Option<usize> {
    let rest = &input[index..];
    if rest.starts_with("\u{1B}\\") {
        Some(index + 2)
    } else if rest.starts_with(STRING_TERMINATOR_8BIT) {
        Some(index + STRING_TERMINATOR_8BIT.len_utf8())
    } else {
        None
    }
}

/// `ESC ] (P[0-9A-Fa-f]{7} | R) (BEL | ST)?`, with `index` just after `ESC ]`.
fn match_linux_palette(input: &str, index: usize) -> Option<usize> {
    let rest = &input.as_bytes()[index..];
    let body_length = match rest.first()? {
        b'P' if rest.len() >= 8 && rest[1..8].iter().all(u8::is_ascii_hexdigit) => 8,
        b'R' => 1,
        _ => return None,
    };

    let end = index + body_length;
    if input[end..].starts_with(BEL) {
        return Some(end + 1);
    }

    Some(match_string_terminator(input, end).unwrap_or(end))
}

/// OSC payload and terminator: `[^BEL string-controls]* (BEL | ST)`.
fn match_osc_payload(input: &str, index: usize) -> Option<usize> {
    let stop = input[index..]
        .find(|character: char| character == BEL || is_string_control(character))
        .map(|offset| index + offset)?;

    if input[stop..].starts_with(BEL) {
        Some(stop + 1)
    } else {
        match_string_terminator(input, stop)
    }
}

/// DCS, SOS, PM, APC, and title payload and terminator: `[^string-controls]* ST`.
fn match_control_string_payload(input: &str, index: usize) -> Option<usize> {
    let stop = input[index..]
        .find(is_string_control)
        .map(|offset| index + offset)?;

    match_string_terminator(input, stop)
}

/// CSI parameters, intermediates, and final byte: `[0-?]* [ -/]* [@-~]`.
fn match_csi_body(input: &str, index: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut position = index;

    while bytes
        .get(position)
        .is_some_and(|byte| (0x30..=0x3F).contains(byte))
    {
        position += 1;
    }
    while bytes
        .get(position)
        .is_some_and(|byte| (0x20..=0x2F).contains(byte))
    {
        position += 1;
    }

    bytes
        .get(position)
        .is_some_and(|byte| (0x40..=0x7E).contains(byte))
        .then_some(position + 1)
}

/// Other escapes: `ESC ([ -/]+ [0-~] | [0-9A-PR-TZcf-oq-uy=><~|}])`, with `index` just after ESC.
fn match_escape(input: &str, index: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let mut position = index;

    while bytes
        .get(position)
        .is_some_and(|byte| (0x20..=0x2F).contains(byte))
    {
        position += 1;
    }

    let next = *bytes.get(position)?;
    if position > index {
        return (0x30..=0x7E).contains(&next).then_some(position + 1);
    }

    let is_two_byte_final = matches!(
        next,
        b'0'..=b'9'
            | b'A'..=b'P'
            | b'R'..=b'T'
            | b'Z'
            | b'c'
            | b'f'..=b'o'
            | b'q'..=b'u'
            | b'y'
            | b'='
            | b'>'
            | b'<'
            | b'~'
            | b'|'
            | b'}'
    );
    is_two_byte_final.then_some(position + 1)
}

#[cfg(test)]
mod tests {
    use super::strip_ansi;

    #[test]
    fn leaves_plain_text_untouched() {
        assert_eq!(strip_ansi("plain text"), "plain text");
    }

    #[test]
    fn strips_sgr_sequences() {
        assert_eq!(
            strip_ansi("\u{1B}[1m\u{1B}[31mbold red\u{1B}[0m"),
            "bold red"
        );
    }

    #[test]
    fn strips_hyperlinks() {
        let link = "\u{1B}]8;;https://example.com\u{07}link\u{1B}]8;;\u{1B}\\";
        assert_eq!(strip_ansi(link), "link");
    }

    #[test]
    fn keeps_unterminated_osc() {
        assert_eq!(strip_ansi("\u{1B}]0;title"), "\u{1B}]0;title");
    }

    #[test]
    fn strips_two_byte_escapes() {
        assert_eq!(strip_ansi("a\u{1B}7b\u{1B}8c"), "abc");
        assert_eq!(strip_ansi("\u{1B}(0x"), "x");
    }

    #[test]
    fn keeps_esc_followed_by_unsupported_character() {
        assert_eq!(strip_ansi("\u{1B}Qx"), "\u{1B}Qx");
    }

    #[test]
    fn strips_8bit_csi() {
        assert_eq!(strip_ansi("\u{9B}31mred"), "red");
    }

    #[test]
    fn strips_linux_palette_before_osc() {
        assert_eq!(strip_ansi("\u{1B}]P0123456text\u{07}"), "text\u{07}");
        assert_eq!(strip_ansi("\u{1B}]R"), "");
    }
}

//! JavaScript built-in behaviors that the original algorithm relies on.

/// `Number.parseInt(text, 10)` for the strings found in SGR parameters (digits, `;`, `:`): the
/// value of the leading ASCII digits, or NaN when there are none.
pub(crate) fn parse_int(text: &str) -> f64 {
    let digits = text.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return f64::NAN;
    }

    // Rust and V8 both round decimal strings to the nearest double.
    text[..digits].parse().unwrap_or(f64::NAN)
}

/// `String(value)` for a non-negative integer produced by [`parse_int`].
pub(crate) fn format_number(value: f64) -> String {
    if value < 1e21 {
        // Display never uses an exponent and prints the shortest round-trip digits, as V8 does
        // below 1e21.
        format!("{value}")
    } else {
        // V8 switches to exponent notation with an explicit sign: 1e+21.
        format!("{value:e}").replacen('e', "e+", 1)
    }
}

/// Whether `String.prototype.trim` removes the character: ECMAScript `WhiteSpace` and
/// `LineTerminator`. Differs from `char::is_whitespace` (U+FEFF is included, U+0085 is not).
pub(crate) fn is_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{9}'..='\u{D}'
            | ' '
            | '\u{A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

/// `String.prototype.trimStart`.
pub(crate) fn trim_start(text: &str) -> &str {
    text.trim_start_matches(is_whitespace)
}

/// `String.prototype.trim() === ''`.
pub(crate) fn is_blank(text: &str) -> bool {
    text.chars().all(is_whitespace)
}

#[cfg(test)]
mod tests {
    use super::{format_number, is_blank, parse_int, trim_start};

    #[test]
    fn parse_int_reads_leading_digits() {
        assert!(parse_int("31").eq(&31.0));
        assert!(parse_int("0031").eq(&31.0));
        assert!(parse_int("5:2").eq(&5.0));
        assert!(parse_int("").is_nan());
        assert!(parse_int(":5").is_nan());
    }

    #[test]
    fn format_number_matches_javascript() {
        assert_eq!(format_number(31.0), "31");
        assert_eq!(format_number(1e20), "100000000000000000000");
        assert_eq!(format_number(1e21), "1e+21");
        assert_eq!(
            format_number(1.234_567_890_123_456_8e25),
            "1.2345678901234568e+25"
        );
    }

    #[test]
    fn javascript_whitespace() {
        assert_eq!(trim_start("\u{FEFF}\u{3000} a "), "a ");
        assert_eq!(trim_start("\u{85}a"), "\u{85}a");
        assert!(is_blank(" \t\u{A0}"));
        assert!(!is_blank(" \u{200B}"));
    }
}

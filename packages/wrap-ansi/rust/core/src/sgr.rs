//! SGR (Select Graphic Rendition) state tracking of wrap-ansi 10.0.2.
//!
//! Styles are tracked per family (foreground, background, underline color, and one family per
//! modifier), with the close codes of `ansi-styles` 6.2.3. Codes are JavaScript numbers in the
//! original, so they are `f64` here: `parseInt` of a long run of digits is a large finite number.

#![allow(
    clippy::float_cmp,
    reason = "codes are compared exactly, as JavaScript's === compares numbers"
)]

use crate::js::{format_number, parse_int};
use crate::tables;

const RESET: f64 = 0.0;
const RESET_FOREGROUND: f64 = 39.0;
const RESET_BACKGROUND: f64 = 49.0;
const RESET_UNDERLINE_COLOR: f64 = 59.0;
const FOREGROUND_EXTENDED: f64 = 38.0;
const BACKGROUND_EXTENDED: f64 = 48.0;
const UNDERLINE_COLOR_EXTENDED: f64 = 58.0;
const COLOR_MODE_RGB: f64 = 2.0;
const COLOR_MODE_256: f64 = 5.0;

#[derive(Debug, Clone, PartialEq)]
struct SgrToken {
    code: f64,
    open: String,
    has_arguments: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Family {
    Foreground,
    Background,
    UnderlineColor,
    /// A modifier, identified by its open code (bold, italic, ...).
    Modifier(u32),
}

#[derive(Debug, Clone, PartialEq)]
struct ActiveStyle {
    family: Family,
    open: String,
    close: u32,
}

/// The styles active at some point of a string, in the order they were applied.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct ActiveStyles(Vec<ActiveStyle>);

fn is_extended_color(code: f64) -> bool {
    code == FOREGROUND_EXTENDED || code == BACKGROUND_EXTENDED || code == UNDERLINE_COLOR_EXTENDED
}

fn is_digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

/// `ansiStyles.codes.get(code)`: the close code of a style.
fn style_close_code(code: f64) -> Option<u32> {
    tables::STYLE_CLOSE_CODES
        .iter()
        .find(|&&(open, _)| f64::from(open) == code)
        .map(|&(_, close)| close)
}

/// Close codes of the modifiers (`ansiStyles.codes` values, without 0).
fn is_modifier_close_code(code: f64) -> bool {
    code != RESET
        && tables::STYLE_CLOSE_CODES
            .iter()
            .any(|&(_, close)| f64::from(close) == code)
}

/// A colon-delimited color (`38:5:n`, `38:2:r:g:b`, `38:2:space:r:g:b`), kept verbatim.
fn colon_color_token(parameter: &str) -> Option<SgrToken> {
    let parts: Vec<&str> = parameter.split(':').collect();
    let code = parse_int(parts[0]);
    let mode = parse_int(parts.get(1).copied().unwrap_or(""));

    if !is_extended_color(code) {
        return None;
    }

    let token = SgrToken {
        code,
        open: parameter.to_owned(),
        has_arguments: true,
    };

    if mode == COLOR_MODE_256 && parts.len() == 3 && is_digits(parts[2]) {
        return Some(token);
    }

    if mode != COLOR_MODE_RGB {
        return None;
    }

    let (color_space, components) = if parts.len() == 6 {
        (Some(parts[2]), &parts[3..])
    } else {
        (None, &parts[2..])
    };
    let valid = components.len() == 3
        && components.iter().all(|component| is_digits(component))
        && color_space.is_none_or(|space| space.bytes().all(|byte| byte.is_ascii_digit()));
    valid.then_some(token)
}

fn join_codes(codes: &[f64]) -> String {
    codes
        .iter()
        .map(|&code| format_number(code))
        .collect::<Vec<_>>()
        .join(";")
}

/// Splits SGR parameters into tokens (`getSgrTokens` in the original).
fn sgr_tokens(parameters: &str) -> Vec<SgrToken> {
    let parameters: Vec<&str> = parameters.split(';').collect();
    let parameter_at = |index: usize| parse_int(parameters.get(index).copied().unwrap_or(""));
    let mut tokens = Vec::new();
    let mut index = 0;

    while index < parameters.len() {
        let parameter = parameters[index];
        if parameter.contains(':') {
            tokens.extend(colon_color_token(parameter));
            index += 1;
            continue;
        }

        let code = if parameter.is_empty() {
            RESET
        } else {
            parse_int(parameter)
        };
        if !code.is_finite() {
            index += 1;
            continue;
        }

        if is_extended_color(code) {
            if index + 1 >= parameters.len() {
                break;
            }

            let mode = parameter_at(index + 1);
            let color_index = parameter_at(index + 2);
            if mode == COLOR_MODE_256 && color_index.is_finite() {
                tokens.push(SgrToken {
                    code,
                    open: join_codes(&[code, mode, color_index]),
                    has_arguments: true,
                });
                index += 3;
                continue;
            }

            let (red, green, blue) = (
                parameter_at(index + 2),
                parameter_at(index + 3),
                parameter_at(index + 4),
            );
            if mode == COLOR_MODE_RGB && red.is_finite() && green.is_finite() && blue.is_finite() {
                tokens.push(SgrToken {
                    code,
                    open: join_codes(&[code, mode, red, green, blue]),
                    has_arguments: true,
                });
                index += 5;
                continue;
            }

            break;
        }

        tokens.push(SgrToken {
            code,
            open: format_number(code),
            has_arguments: false,
        });
        index += 1;
    }

    tokens
}

fn color_style(token: &SgrToken) -> Option<(Family, u32)> {
    let SgrToken {
        code,
        has_arguments,
        ..
    } = *token;
    let in_range = |start: f64, end: f64| code >= start && code <= end;

    if in_range(30.0, 37.0)
        || in_range(90.0, 97.0)
        || (code == FOREGROUND_EXTENDED && has_arguments)
    {
        Some((Family::Foreground, 39))
    } else if in_range(40.0, 47.0)
        || in_range(100.0, 107.0)
        || (code == BACKGROUND_EXTENDED && has_arguments)
    {
        Some((Family::Background, 49))
    } else if code == UNDERLINE_COLOR_EXTENDED && has_arguments {
        Some((Family::UnderlineColor, 59))
    } else {
        None
    }
}

impl ActiveStyles {
    fn remove_family(&mut self, family: Family) {
        if let Some(index) = self.0.iter().position(|style| style.family == family) {
            self.0.remove(index);
        }
    }

    fn upsert(&mut self, style: ActiveStyle) {
        self.remove_family(style.family);
        self.0.push(style);
    }

    /// Applies a reset code. Returns `false` when `code` is not a reset code.
    fn apply_reset(&mut self, code: f64) -> bool {
        if code == RESET {
            self.0.clear();
        } else if code == RESET_FOREGROUND {
            self.remove_family(Family::Foreground);
        } else if code == RESET_BACKGROUND {
            self.remove_family(Family::Background);
        } else if code == RESET_UNDERLINE_COLOR {
            self.remove_family(Family::UnderlineColor);
        } else if is_modifier_close_code(code) {
            self.0.retain(|style| {
                !(matches!(style.family, Family::Modifier(_)) && f64::from(style.close) == code)
            });
        } else {
            return false;
        }

        true
    }

    fn apply_token(&mut self, token: SgrToken) {
        if self.apply_reset(token.code) {
            return;
        }

        if let Some((family, close)) = color_style(&token) {
            self.upsert(ActiveStyle {
                family,
                open: token.open,
                close,
            });
            return;
        }

        if let Some(close) = style_close_code(token.code).filter(|&close| close != 0) {
            // `style_close_code` only finds codes from the table, which are small integers.
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let open_code = token.code as u32;
            self.upsert(ActiveStyle {
                family: Family::Modifier(open_code),
                open: token.open,
                close,
            });
        }
    }

    /// Applies every token of an SGR sequence.
    pub(crate) fn apply(&mut self, parameters: &str) {
        for token in sgr_tokens(parameters) {
            self.apply_token(token);
        }
    }

    /// Applies only the reset codes of an SGR sequence.
    pub(crate) fn apply_resets(&mut self, parameters: &str) {
        for token in sgr_tokens(parameters) {
            self.apply_reset(token.code);
        }
    }

    /// Appends the sequences that close the active styles, last opened first.
    pub(crate) fn push_closing(&self, output: &mut String) {
        for style in self.0.iter().rev() {
            output.push_str("\u{1B}[");
            output.push_str(&style.close.to_string());
            output.push('m');
        }
    }

    /// Appends the sequences that reopen the active styles.
    pub(crate) fn push_opening(&self, output: &mut String) {
        for style in &self.0 {
            output.push_str("\u{1B}[");
            output.push_str(&style.open);
            output.push('m');
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ActiveStyles;

    fn closing(styles: &ActiveStyles) -> String {
        let mut output = String::new();
        styles.push_closing(&mut output);
        output
    }

    fn opening(styles: &ActiveStyles) -> String {
        let mut output = String::new();
        styles.push_opening(&mut output);
        output
    }

    #[test]
    fn tracks_colors_and_modifiers() {
        let mut styles = ActiveStyles::default();
        styles.apply("1;31");
        assert_eq!(opening(&styles), "\u{1B}[1m\u{1B}[31m");
        assert_eq!(closing(&styles), "\u{1B}[39m\u{1B}[22m");

        styles.apply("32");
        assert_eq!(opening(&styles), "\u{1B}[1m\u{1B}[32m");

        styles.apply("22");
        assert_eq!(opening(&styles), "\u{1B}[32m");

        styles.apply("");
        assert_eq!(opening(&styles), "");
    }

    #[test]
    fn extended_colors() {
        let mut styles = ActiveStyles::default();
        styles.apply("38;5;0196;48;2;1;2;3");
        assert_eq!(opening(&styles), "\u{1B}[38;5;196m\u{1B}[48;2;1;2;3m");

        let mut styles = ActiveStyles::default();
        styles.apply("58:2::10:20:30");
        assert_eq!(opening(&styles), "\u{1B}[58:2::10:20:30m");
        assert_eq!(closing(&styles), "\u{1B}[59m");
    }

    #[test]
    fn incomplete_extended_color_stops_parsing() {
        let mut styles = ActiveStyles::default();
        styles.apply("38;9;1;31");
        assert_eq!(opening(&styles), "");
    }

    #[test]
    fn resets_only() {
        let mut styles = ActiveStyles::default();
        styles.apply("1;31");
        styles.apply_resets("32;39");
        assert_eq!(opening(&styles), "\u{1B}[1m");
    }
}

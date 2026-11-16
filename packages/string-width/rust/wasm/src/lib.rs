//! WebAssembly bindings for `string-width-core`.
//!
//! Option normalization (defaults and JavaScript truthiness) happens in the TypeScript layer, so
//! these functions take plain booleans.

use string_width_core::{Options, UNICODE_VERSION};
use wasm_bindgen::prelude::wasm_bindgen;

fn to_options(ambiguous_is_narrow: bool, count_ansi_escape_codes: bool) -> Options {
    Options {
        ambiguous_is_narrow,
        count_ansi_escape_codes,
    }
}

/// JavaScript strings are at most 2^30 UTF-16 code units long, so a width (at most two columns per
/// code unit) always fits in a `u32`. Saturation is a safeguard that cannot trigger.
fn to_u32(width: usize) -> u32 {
    u32::try_from(width).unwrap_or(u32::MAX)
}

/// Returns the visual width of `input`.
#[wasm_bindgen(js_name = stringWidth)]
pub fn string_width(input: &str, ambiguous_is_narrow: bool, count_ansi_escape_codes: bool) -> u32 {
    to_u32(string_width_core::string_width(
        input,
        to_options(ambiguous_is_narrow, count_ansi_escape_codes),
    ))
}

/// Returns the visual width of every string in `inputs`, in order.
#[wasm_bindgen(js_name = stringWidthMany)]
#[allow(
    clippy::needless_pass_by_value,
    reason = "wasm-bindgen cannot borrow a Vec<String> argument"
)]
pub fn string_width_many(
    inputs: Vec<String>,
    ambiguous_is_narrow: bool,
    count_ansi_escape_codes: bool,
) -> Vec<u32> {
    let options = to_options(ambiguous_is_narrow, count_ansi_escape_codes);
    inputs
        .iter()
        .map(|input| to_u32(string_width_core::string_width(input, options)))
        .collect()
}

/// Unicode version of the character tables compiled into the module.
#[wasm_bindgen(js_name = unicodeVersion)]
pub fn unicode_version() -> String {
    UNICODE_VERSION.to_owned()
}

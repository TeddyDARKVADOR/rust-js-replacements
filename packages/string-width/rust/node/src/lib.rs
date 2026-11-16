//! Node.js bindings for `string-width-core`.
//!
//! Option normalization (defaults and JavaScript truthiness) happens in the TypeScript layer, so
//! these functions take plain booleans. That keeps the boundary cheap: no object conversion.

// NAPI-RS converts JavaScript strings into owned Rust values; it cannot lend a `&str`.
#![allow(
    clippy::needless_pass_by_value,
    reason = "NAPI-RS requires owned String arguments"
)]

use napi::bindgen_prelude::Uint32Array;
use napi_derive::napi;
use string_width_core::{Options, UNICODE_VERSION};

fn to_options(ambiguous_is_narrow: bool, count_ansi_escape_codes: bool) -> Options {
    Options {
        ambiguous_is_narrow,
        count_ansi_escape_codes,
    }
}

/// JavaScript strings are at most 2^29 UTF-16 code units long in V8, so a width (at most two
/// columns per code unit) always fits in a `u32`. Saturation is a safeguard that cannot trigger.
fn to_u32(width: usize) -> u32 {
    u32::try_from(width).unwrap_or(u32::MAX)
}

/// Returns the visual width of `input`.
#[napi]
pub fn string_width(
    input: String,
    ambiguous_is_narrow: bool,
    count_ansi_escape_codes: bool,
) -> u32 {
    to_u32(string_width_core::string_width(
        &input,
        to_options(ambiguous_is_narrow, count_ansi_escape_codes),
    ))
}

/// Returns the visual width of every string in `inputs`, in order.
#[napi]
pub fn string_width_many(
    inputs: Vec<String>,
    ambiguous_is_narrow: bool,
    count_ansi_escape_codes: bool,
) -> Uint32Array {
    let options = to_options(ambiguous_is_narrow, count_ansi_escape_codes);
    let widths: Vec<u32> = inputs
        .iter()
        .map(|input| to_u32(string_width_core::string_width(input, options)))
        .collect();
    Uint32Array::new(widths)
}

/// Unicode version of the character tables compiled into the addon.
#[napi]
pub fn unicode_version() -> &'static str {
    UNICODE_VERSION
}

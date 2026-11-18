//! WebAssembly bindings for `wrap-ansi-core`.
//!
//! Option normalization (defaults and JavaScript truthiness) happens in the TypeScript layer, so
//! these functions take plain values.

use wasm_bindgen::prelude::wasm_bindgen;
use wrap_ansi_core::Options;

/// Wraps `input` to `columns` terminal columns, preserving ANSI escape codes.
#[wasm_bindgen(js_name = wrapAnsi)]
pub fn wrap_ansi(input: &str, columns: f64, hard: bool, word_wrap: bool, trim: bool) -> String {
    wrap_ansi_core::wrap_ansi(
        input,
        columns,
        Options {
            hard,
            word_wrap,
            trim,
        },
    )
}

/// Width of `input` with the rules of string-width 8.3.0, as wrap-ansi measures text. Not part of
/// the public API: exported for the compatibility tests.
#[wasm_bindgen(js_name = stringWidth)]
pub fn string_width(input: &str) -> u32 {
    // JavaScript strings are at most 2^30 UTF-16 code units long, so the width fits in a u32.
    u32::try_from(wrap_ansi_core::string_width(input)).unwrap_or(u32::MAX)
}

//! Node.js bindings for `wrap-ansi-core`.
//!
//! Option normalization (defaults and JavaScript truthiness) happens in the TypeScript layer, so
//! these functions take plain values. That keeps the boundary cheap: no object conversion.

// NAPI-RS converts JavaScript strings into owned Rust values; it cannot lend a `&str`.
#![allow(
    clippy::needless_pass_by_value,
    reason = "NAPI-RS requires owned String arguments"
)]

use napi_derive::napi;
use wrap_ansi_core::Options;

/// Wraps `input` to `columns` terminal columns, preserving ANSI escape codes.
#[napi]
pub fn wrap_ansi(input: String, columns: f64, hard: bool, word_wrap: bool, trim: bool) -> String {
    wrap_ansi_core::wrap_ansi(
        &input,
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
#[napi]
pub fn string_width(input: String) -> u32 {
    // JavaScript strings are at most 2^29 UTF-16 code units long, so the width fits in a u32.
    u32::try_from(wrap_ansi_core::string_width(&input)).unwrap_or(u32::MAX)
}

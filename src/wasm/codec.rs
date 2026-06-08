//! WASM bit-packing codec for ddunigma.
//!
//! This module implements the core bit-packing encode/decode loops in Rust,
//! targeting wasm32-unknown-unknown for cross-platform WASM deployment.
//!
//! The logic mirrors `src/core/BitPack.ts` exactly:
//! - For power-of-two charsets: accumulate bits, extract bitLength-bit chunks
//! - For non-power-of-two charsets: same accumulation but output pairs (high, low)
//! - Handle padding bits correctly on both encode and decode
//!
//! ## WASM Interface
//!
//! The module exposes:
//! - `alloc(size)` / `dealloc(ptr, size)` for memory management
//! - `encode(input_ptr, input_len, bit_length, charset_size, use_power_of_two)` -> encoded ptr
//! - `decode(indices_ptr, indices_len, bit_length, charset_size, use_power_of_two, padding_bits)` -> decoded ptr
//! - `get_result_ptr()` / `get_padding_bits()` for reading results
//!   (encode/decode return the element count directly)
//!
//! Compatible with: browsers, Node.js 18+, Deno, Cloudflare Workers.

use core::slice;
use std::vec::Vec;

// ─── Constants ───────────────────────────────────────────────────────────────

const BYTE_BITS: u32 = 8;
const BYTE_MASK: u32 = 0xFF;

// ─── Global Result Storage ───────────────────────────────────────────────────
//
// WASM linear memory doesn't have a convenient way to return variable-length
// results. We store the last result in a global and expose pointer/length
// accessors for the host to read.

/// Single-threaded global codec state.
struct CodecState {
    result_buf: Vec<u8>,
    result_u16_buf: Vec<u16>,
    last_padding_bits: u32,
    last_result_is_u16: bool,
}

static mut STATE: CodecState = CodecState {
    result_buf: Vec::new(),
    result_u16_buf: Vec::new(),
    last_padding_bits: 0,
    last_result_is_u16: false,
};

/// Borrow the global codec state.
///
/// `wasm32-unknown-unknown` linear memory is single-threaded, and the host
/// copies every result out synchronously before the next call, so a single
/// global is sound and reentrancy is impossible. Going through a raw pointer
/// (`addr_of_mut!`) avoids constructing a reference to the `mut` static itself,
/// keeping the code clean under the Rust 2024 `static_mut_refs` lint.
#[inline(always)]
fn state() -> &'static mut CodecState {
    unsafe { &mut *core::ptr::addr_of_mut!(STATE) }
}

// ─── Memory Management ──────────────────────────────────────────────────────

/// Allocate `size` bytes of memory and return a pointer to the start.
/// The caller (JS host) is responsible for writing data into this region.
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

/// Deallocate a previously allocated region of `size` bytes at `ptr`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if !ptr.is_null() && size > 0 {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}

// ─── Result Accessors ────────────────────────────────────────────────────────

/// Get a pointer to the result buffer.
/// For encode: points to u16 array (2 bytes per index).
/// For decode: points to u8 array.
#[no_mangle]
pub extern "C" fn get_result_ptr() -> *const u8 {
    let st = state();
    if st.last_result_is_u16 {
        st.result_u16_buf.as_ptr() as *const u8
    } else {
        st.result_buf.as_ptr()
    }
}

/// Get the number of padding bits from the last encode operation.
#[no_mangle]
pub extern "C" fn get_padding_bits() -> u32 {
    state().last_padding_bits
}

// ─── Encode ──────────────────────────────────────────────────────────────────

/// Encode a byte array into charset indices using bit-packing.
///
/// # Parameters
/// - `input_ptr`: Pointer to the input byte array in WASM memory
/// - `input_len`: Length of the input byte array
/// - `bit_length`: Number of bits per encoded symbol
/// - `charset_size`: Size of the charset (number of unique characters)
/// - `use_power_of_two`: 1 if charset size is a power of two, 0 otherwise
///
/// # Returns
/// The number of indices written. Use `get_result_ptr()` to read the u16 array
/// and `get_padding_bits()` to get the padding bit count.
#[no_mangle]
pub unsafe extern "C" fn encode(
    input_ptr: *const u8,
    input_len: usize,
    bit_length: u32,
    charset_size: u32,
    use_power_of_two: u32,
) -> usize {
    let st = state();
    st.last_result_is_u16 = true;
    let out = &mut st.result_u16_buf;

    if input_len == 0 {
        out.clear();
        st.last_padding_bits = 0;
        return 0;
    }

    let input = slice::from_raw_parts(input_ptr, input_len);
    let is_pot = use_power_of_two != 0;

    let total_bits = input_len as u32 * BYTE_BITS;
    let estimated_chunks = (total_bits + bit_length - 1) / bit_length;
    let estimated_indices = if is_pot {
        estimated_chunks as usize
    } else {
        (estimated_chunks * 2) as usize
    };

    out.clear();
    out.reserve(estimated_indices);

    let mut accumulator: u64 = 0;
    let mut accumulator_bits: u32 = 0;

    if is_pot {
        let mask = (1u64 << bit_length) - 1;

        for &byte in input.iter() {
            accumulator = (accumulator << BYTE_BITS) | (byte as u64);
            accumulator_bits += BYTE_BITS;

            while accumulator_bits >= bit_length {
                accumulator_bits -= bit_length;
                let index = ((accumulator >> accumulator_bits) & mask) as u16;
                out.push(index);
                accumulator &= (1u64 << accumulator_bits) - 1;
            }
        }
    } else {
        for &byte in input.iter() {
            accumulator = (accumulator << BYTE_BITS) | (byte as u64);
            accumulator_bits += BYTE_BITS;

            while accumulator_bits >= bit_length {
                accumulator_bits -= bit_length;
                let value = (accumulator >> accumulator_bits) as u32;
                let div = value / charset_size;
                let rem = value - div * charset_size;
                out.push(div as u16);
                out.push(rem as u16);
                accumulator &= (1u64 << accumulator_bits) - 1;
            }
        }
    }

    // Handle remaining bits (padding)
    st.last_padding_bits = 0;
    if accumulator_bits > 0 {
        st.last_padding_bits = bit_length - accumulator_bits;
        let value = (accumulator << st.last_padding_bits) as u32;

        if is_pot {
            out.push(value as u16);
        } else {
            let div = value / charset_size;
            let rem = value - div * charset_size;
            out.push(div as u16);
            out.push(rem as u16);
        }
    }

    out.len()
}

// ─── Decode ──────────────────────────────────────────────────────────────────

/// Decode charset indices back into a byte array using bit-unpacking.
///
/// # Parameters
/// - `indices_ptr`: Pointer to the u16 index array in WASM memory
/// - `indices_len`: Number of u16 indices
/// - `bit_length`: Number of bits per encoded symbol
/// - `charset_size`: Size of the charset
/// - `use_power_of_two`: 1 if charset size is a power of two, 0 otherwise
/// - `padding_bits`: Number of padding bits in the last symbol
///
/// # Returns
/// The number of decoded bytes. Use `get_result_ptr()` to read the u8 array.
/// Returns 0xFFFFFFFF on error (invalid index).
#[no_mangle]
pub unsafe extern "C" fn decode(
    indices_ptr: *const u16,
    indices_len: usize,
    bit_length: u32,
    charset_size: u32,
    use_power_of_two: u32,
    padding_bits: u32,
) -> usize {
    let st = state();
    st.last_result_is_u16 = false;
    let out = &mut st.result_buf;

    if indices_len == 0 {
        out.clear();
        return 0;
    }

    let indices = slice::from_raw_parts(indices_ptr, indices_len);
    let is_pot = use_power_of_two != 0;
    let chunk_size: usize = if is_pot { 1 } else { 2 };

    let num_chunks = (indices_len + chunk_size - 1) / chunk_size;
    let estimated_bytes = ((num_chunks as u64 * bit_length as u64)
        .saturating_sub(padding_bits as u64)
        / BYTE_BITS as u64) as usize;

    out.clear();
    out.reserve(estimated_bytes + 1);

    let mut accumulator: u64 = 0;
    let mut accumulator_bits: u32 = 0;
    let mut i: usize = 0;

    if is_pot {
        while i < indices_len {
            let val = indices[i] as u32;

            // Validate index range
            if val >= charset_size {
                // Signal error: return sentinel value
                out.clear();
                return 0xFFFFFFFF;
            }

            accumulator = (accumulator << bit_length) | (val as u64);
            accumulator_bits += bit_length;

            // Apply padding removal on last chunk
            if i + chunk_size >= indices_len && padding_bits > 0 {
                accumulator >>= padding_bits;
                accumulator_bits -= padding_bits;
            }

            while accumulator_bits >= BYTE_BITS {
                accumulator_bits -= BYTE_BITS;
                let byte_val = ((accumulator >> accumulator_bits) & BYTE_MASK as u64) as u8;
                out.push(byte_val);
                accumulator &= (1u64 << accumulator_bits) - 1;
            }

            i += chunk_size;
        }
    } else {
        while i + 1 < indices_len {
            let v1 = indices[i] as u32;
            let v2 = indices[i + 1] as u32;

            // Validate index range
            if v1 >= charset_size || v2 >= charset_size {
                out.clear();
                return 0xFFFFFFFF;
            }

            let value = v1 * charset_size + v2;
            let max_binary_value = 1u32 << bit_length;
            if value >= max_binary_value {
                out.clear();
                return 0xFFFFFFFF;
            }

            accumulator = (accumulator << bit_length) | (value as u64);
            accumulator_bits += bit_length;

            // Apply padding removal on last chunk
            if i + chunk_size >= indices_len && padding_bits > 0 {
                accumulator >>= padding_bits;
                accumulator_bits -= padding_bits;
            }

            while accumulator_bits >= BYTE_BITS {
                accumulator_bits -= BYTE_BITS;
                let byte_val = ((accumulator >> accumulator_bits) & BYTE_MASK as u64) as u8;
                out.push(byte_val);
                accumulator &= (1u64 << accumulator_bits) - 1;
            }

            i += chunk_size;
        }
    }

    out.len()
}

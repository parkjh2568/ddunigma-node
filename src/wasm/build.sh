#!/usr/bin/env bash
#
# Build script for the ddunigma WASM codec module.
#
# Prerequisites:
#   1. Rust toolchain (rustup): https://rustup.rs/
#   2. WASM target: rustup target add wasm32-unknown-unknown
#
# Usage:
#   cd src/wasm && ./build.sh
#
# Output:
#   src/wasm/codec.wasm — optimized WASM binary loadable in:
#     - Browsers (via WebAssembly.instantiate)
#     - Node.js 18+ (via WebAssembly.instantiate or fs.readFile + instantiate)
#     - Deno (via WebAssembly.instantiate)
#     - Cloudflare Workers (via WebAssembly.instantiate with module binding)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building ddunigma WASM codec..."

# Step 1: Build with cargo targeting wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release

# The output is at src/wasm/target/wasm32-unknown-unknown/release/ddunigma_wasm_codec.wasm
WASM_OUTPUT="./target/wasm32-unknown-unknown/release/ddunigma_wasm_codec.wasm"

if [ ! -f "$WASM_OUTPUT" ]; then
  echo "❌ Build failed: $WASM_OUTPUT not found"
  exit 1
fi

# Step 2: Copy to src/wasm/codec.wasm
cp "$WASM_OUTPUT" ./codec.wasm
echo "✅ Copied to src/wasm/codec.wasm"

# Step 3: Report size
WASM_SIZE=$(wc -c < ./codec.wasm | tr -d ' ')
echo ""
echo "📦 Final WASM binary: codec.wasm (${WASM_SIZE} bytes)"
echo ""
echo "Done! The WASM module exports:"
echo "  - alloc(size) -> ptr"
echo "  - dealloc(ptr, size)"
echo "  - encode(input_ptr, input_len, bit_length, charset_size, use_power_of_two) -> count"
echo "  - decode(indices_ptr, indices_len, bit_length, charset_size, use_power_of_two, padding_bits) -> count"
echo "  - get_result_ptr() -> ptr"
echo "  - get_padding_bits() -> bits"
echo "  - release_result()"

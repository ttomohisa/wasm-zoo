/* Narrow, bounded WASM bridge to the exact upstream libzstd C API. */
#include <stddef.h>
#include "zstd.h"
size_t zoo_compress_bound(size_t length) { return ZSTD_compressBound(length); }
size_t zoo_compress(const void *src, size_t length, void *dst, size_t capacity, int level) {
  return ZSTD_compress(dst, capacity, src, length, level);
}
size_t zoo_decompress(const void *src, size_t length, void *dst, size_t capacity) {
  return ZSTD_decompress(dst, capacity, src, length);
}
int zoo_is_error(size_t code) { return (int)ZSTD_isError(code); }
double zoo_frame_size(const void *src, size_t length) {
  unsigned long long value = ZSTD_getFrameContentSize(src, length);
  if (value == ZSTD_CONTENTSIZE_ERROR) return -1.0;
  if (value == ZSTD_CONTENTSIZE_UNKNOWN) return -2.0;
  return (double)value;
}
unsigned zoo_version_number(void) { return ZSTD_versionNumber(); }

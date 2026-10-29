/**
 * Minimal QR-code-like visual for the course.
 * Renders a deterministic grid from the token string into a canvas.
 * Treat as a black box: call renderQr(canvas, text).
 */
export function renderQr(canvas, text) {
  const size = 21;
  const scale = Math.floor(Math.min(canvas.width, canvas.height) / size) || 8;
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';

  // Simple hash of the string → pseudo-random modules + finder patterns
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  function bit(n) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) % 2 === 0;
  }

  function finder(x0, y0) {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const on =
          x === 0 || x === 6 || y === 0 || y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4);
        if (on) ctx.fillRect((x0 + x) * scale, (y0 + y) * scale, scale, scale);
      }
    }
  }

  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // skip finder areas
      if ((x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8)) continue;
      if (bit(x + y * size)) {
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
}

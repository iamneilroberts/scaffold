const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encode(lat: number, lng: number, precision = 4): string {
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLng = true;

  while (hash.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = ch | (1 << (4 - bit));
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = ch | (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch]!;
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export function neighbors(hash: string): string[] {
  const idx = BASE32.indexOf(hash[hash.length - 1]!);
  const prefix = hash.slice(0, -1);
  const result: string[] = [hash];

  for (const offset of [-1, 1]) {
    const ni = idx + offset;
    if (ni >= 0 && ni < 32) {
      result.push(prefix + BASE32[ni]!);
    }
  }

  return result;
}

export function bucketKey(hash: string): string {
  return `places/geohash/${hash}`;
}

export function nearbyBucketKeys(lat: number, lng: number, precision = 4): string[] {
  const center = encode(lat, lng, precision);
  return neighbors(center).map(bucketKey);
}

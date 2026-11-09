// Parses the specific KML shape Google My Maps exports: a flat list of
// <Folder> layers, each containing <Placemark>s that are either a <Point>
// or one or more single-ring <Polygon>s (no holes — a placemark's <Polygon>
// may also sit inside a <MultiGeometry>, in which case each sub-polygon
// becomes its own output row sharing the placemark's name). Deliberately
// narrow/regex-based rather than a general KML parser, since that's the
// only shape this ever needs to read.

function tagBlocks(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function firstTag(xml, tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return m ? m[1].trim() : '';
}
function parseCoordinates(text) {
  // "lng,lat,alt lng,lat,alt ..." — whitespace/newline separated triples.
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((triple) => {
      const [lng, lat] = triple.split(',').map(Number);
      return [lng, lat];
    })
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

// Returns [{ name, layer, type: 'polygon'|'point', ring: [[lng,lat],...] }]
// — for a point, ring is a single [[lng,lat]] pair.
export function parseKml(kmlText) {
  const out = [];
  const folders = tagBlocks(kmlText, 'Folder');
  for (const folder of folders) {
    const layerName = firstTag(folder, 'name');
    const placemarks = tagBlocks(folder, 'Placemark');
    for (const pm of placemarks) {
      const name = firstTag(pm, 'name');
      if (!name) continue;
      const polygonBlocks = tagBlocks(pm, 'Polygon');
      if (polygonBlocks.length) {
        for (const poly of polygonBlocks) {
          const outer = /<outerBoundaryIs>([\s\S]*?)<\/outerBoundaryIs>/.exec(poly);
          const coordsText = outer ? firstTag(outer[1], 'coordinates') : '';
          const ring = parseCoordinates(coordsText);
          if (ring.length >= 3) out.push({ name, layer: layerName, type: 'polygon', ring });
        }
        continue;
      }
      const pointMatch = /<Point>([\s\S]*?)<\/Point>/.exec(pm);
      if (pointMatch) {
        const ring = parseCoordinates(firstTag(pointMatch[1], 'coordinates'));
        if (ring.length) out.push({ name, layer: layerName, type: 'point', ring: [ring[0]] });
      }
    }
  }
  return out;
}

// Standard ray-casting point-in-polygon test. ring: [[lng,lat],...].
export function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Finds the first polygon (in list order) that contains (lat, lng), or null.
// Accepts both parseKml()'s own output (`type`) and rows read back from
// community_boundaries/school_boundaries (`geometry_type`) — the insert maps
// `type` -> `geometry_type` and it never round-trips back.
export function matchCommunity(lat, lng, polygons) {
  for (const p of polygons) {
    if ((p.type || p.geometry_type) === 'polygon' && pointInRing(lng, lat, p.ring)) return p.name;
  }
  return null;
}

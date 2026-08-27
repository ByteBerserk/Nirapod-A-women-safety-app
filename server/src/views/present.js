/**
 * Helpers every presenter needs.
 *
 * These were copied into each of the six view files, identically, which is fine
 * until one of them is fixed and the other five are not. The shapes they
 * produce - a string id, a {lat,lng} point - are part of the contract the
 * client relies on, so they belong in one place.
 */

/**
 * A document, a populated reference or a bare ObjectId, as a string.
 *
 * Presenters are handed whichever of the three the controller happened to load,
 * and the client only ever wants the string.
 *
 * @returns {string|null}
 */
const idOf = (value) => (value && value._id ? String(value._id) : value ? String(value) : null);

/**
 * GeoJSON [lng, lat] as the {lat, lng} every UI expects.
 *
 * The order really is reversed in GeoJSON, and getting it the wrong way round
 * puts someone in the Indian Ocean rather than in Dhaka, so the conversion
 * happens here and nowhere else.
 *
 * @param {number[]} coordinates  [longitude, latitude]
 * @param {object} [extra]        merged into the result, e.g. accuracy
 * @returns {{lat:number,lng:number}|null}
 */
function pointOf(coordinates, extra = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { lat: coordinates[1], lng: coordinates[0], ...extra };
}

export { idOf, pointOf };

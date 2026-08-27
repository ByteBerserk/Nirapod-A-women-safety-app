const idOf = (value) => (value && value._id ? String(value._id) : value ? String(value) : null);

function pointOf(coordinates, extra = {}) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { lat: coordinates[1], lng: coordinates[0], ...extra };
}

export { idOf, pointOf };

const DEFAULT_DISTANCE_METERS = 140;

// bearing: 0=N, 90=E, 180=S, 270=W
// distanceM is optional; if omitted, DEFAULT_DISTANCE_METERS is used.
const MARKER_BEARINGS = {
  'Piha': { bearing: 270 },
  'Muriwai': { bearing: 270 },
  'Karekare': { bearing: 270 },
  'Bethells (Te Henga)': { bearing: 270 },
  'Te Arai Point': { bearing: 80 },
  'Raglan (Manu Bay)': { bearing: 250 },
  'Raglan (Whale Bay)': { bearing: 250 },
  'Raglan (Indicators)': { bearing: 250 },
  'Mount Maunganui - Main Beach': { bearing: 92, distanceM: 340 },
  'Mount Maunganui - Omanu': { bearing: 92 },
  'Mount Maunganui - Arataki': { bearing: 92 },
  'Mount Maunganui - Tay Street': { bearing: 92 },
  'Mount Maunganui - Moturiki': { bearing: 88, distanceM: 110 },
  'Papamoa Beach': { bearing: 95 },
  'Pukehina Beach': { bearing: 95 },
  'Ohope': { bearing: 95 },
  'Wainui Beach': { bearing: 92 },
  'Makorori Point': { bearing: 92 },
  'Midway Beach': { bearing: 92 },
  'Stent Road': { bearing: 260 },
  'Fitzroy Beach': { bearing: 260 },
  'Back Beach': { bearing: 260 },
  'Lyall Bay': { bearing: 170 },
  'St Clair': { bearing: 150 },
  'St Kilda': { bearing: 145 },
  'New Brighton': { bearing: 95 },
};

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const movePointByMeters = (lat, lng, distanceMeters, bearingDeg) => {
  const earthRadiusM = 6371000;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const angularDistance = distanceMeters / earthRadiusM;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng)
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    markerLat: Number(toDeg(lat2).toFixed(6)),
    markerLng: Number(toDeg(lng2).toFixed(6)),
  };
};

export const applyMarkerOffsets = (spot) => {
  const config = MARKER_BEARINGS[spot?.name];
  if (!config) {
    return {
      ...spot,
      markerLat: spot.lat,
      markerLng: spot.lng,
    };
  }

  const distanceM = config.distanceM || DEFAULT_DISTANCE_METERS;
  const { markerLat, markerLng } = movePointByMeters(
    spot.lat,
    spot.lng,
    distanceM,
    config.bearing
  );

  return {
    ...spot,
    markerLat,
    markerLng,
  };
};

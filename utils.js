/**
 * Bramble Utility Functions
 * Distance calculations and location helpers
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Radius of Earth in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Categorize distance into ranges
 * @param {number} distance - Distance in miles
 * @returns {string} Distance category
 */
function categorizeDistance(distance) {
  if (distance < 5) {
    return '< 5 mi';
  } else if (distance < 20) {
    return '5-20 mi';
  } else if (distance < 50) {
    return '20-50 mi';
  } else {
    return '> 50 mi';
  }
}

/**
 * Get formatted distance string
 * @param {number} distance - Distance in miles
 * @returns {string} Formatted distance (e.g., "3.2 mi", "45.7 mi")
 */
function formatDistance(distance) {
  if (distance < 0.1) {
    return '< 0.1 mi';
  }
  return `${distance.toFixed(1)} mi`;
}

/**
 * Calculate ethical score bonus based on distance
 * @param {number} distance - Distance in miles
 * @returns {number} Score bonus (0-20 points)
 */
function getDistanceBonus(distance) {
  if (distance < 10) {
    return 20;
  } else if (distance < 25) {
    return 10;
  }
  return 0;
}

/**
 * Get rough location description from coordinates
 * In production, this would use a reverse geocoding API
 * For now, just returns formatted coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} Location description
 */
function getLocationDescription(lat, lon) {
  // Format coordinates nicely
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  return `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

/**
 * Estimate city/state from coordinates (mock implementation)
 * In production, this would use a reverse geocoding API like Google Maps or Nominatim
 * For now, returns rough estimates based on known coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} City, State
 */
function estimateCityState(lat, lon) {
  // Mock implementation - in production, use reverse geocoding API
  // This is just for demonstration purposes

  // San Francisco Bay Area
  if (lat > 37 && lat < 38 && lon > -123 && lon < -121) {
    return 'San Francisco, CA';
  }
  // Los Angeles Area
  else if (lat > 33 && lat < 35 && lon > -119 && lon < -117) {
    return 'Los Angeles, CA';
  }
  // New York Area
  else if (lat > 40 && lat < 41 && lon > -75 && lon < -73) {
    return 'New York, NY';
  }
  // Seattle Area
  else if (lat > 47 && lat < 48 && lon > -123 && lon < -121) {
    return 'Seattle, WA';
  }
  // Chicago Area
  else if (lat > 41 && lat < 42 && lon > -88 && lon < -87) {
    return 'Chicago, IL';
  }
  // Default: return coordinates
  else {
    return getLocationDescription(lat, lon);
  }
}

/**
 * Validate coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
function isValidCoordinates(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !isNaN(lat) &&
    !isNaN(lon)
  );
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateDistance,
    categorizeDistance,
    formatDistance,
    getDistanceBonus,
    getLocationDescription,
    estimateCityState,
    isValidCoordinates
  };
}

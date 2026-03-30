// src/constants/Spots.js
import { CUSTOM_NZ_SPOTS } from './SpotsCustom';
import { applyMarkerOffsets } from './SpotMarkerOffsets';

export const SURFLINE_COLORS = {
  VERY_POOR: '#727272', // Gris
  POOR: '#44ADEE',      // Azul
  FAIR: '#FFB100',      // Naranja
  GOOD: '#00D15D',      // Verde
  EPIC: '#9C27B0',      // Púrpura
};

// Función para generar forecast de 16 días realista (en METROS)
const generateForecast = (baseRating) => {
  const ratings = ['VERY_POOR', 'POOR', 'FAIR', 'GOOD', 'EPIC'];
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const ratingIndex = ratings.indexOf(baseRating);
  
  const forecast = [];
  const today = new Date();
  
  for (let i = 0; i < 16; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    // Variar rating aleatoriamente alrededor del base
    const variation = Math.floor(Math.random() * 3) - 1;
    const forecastRating = ratings[Math.max(0, Math.min(4, ratingIndex + variation))];
    
    // Datos de swell variados (en METROS)
    const primaryHeightM = (Math.random() * 1.5 + 0.3).toFixed(2);
    const secondaryHeightM = (Math.random() * 0.6 + 0.2).toFixed(2);
    const wind = Math.floor(Math.random() * 15) + 5;
    const waterTemp = Math.floor(Math.random() * 4) + 16;
    
    // Generar datos de marea para 24 horas (12 puntos cada 2 horas)
    const tideData = [];
    for (let h = 0; h < 12; h++) {
      const hour = h * 2;
      // Simulación de onda de marea sinusoidal
      const tideHeight = 1.2 + 0.8 * Math.sin((hour / 12) * Math.PI);
      tideData.push({
        hour,
        height: parseFloat(tideHeight.toFixed(2)),
        time: `${String(hour).padStart(2, '0')}:00`
      });
    }
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
      rating: forecastRating,
      height: { 
        min: Math.floor(parseFloat(primaryHeightM)), 
        max: Math.ceil(parseFloat(primaryHeightM) + 0.6) 
      },
      primarySwell: {
        height: parseFloat(primaryHeightM),
        period: Math.floor(Math.random() * 6 + 10),
        direction: directions[Math.floor(Math.random() * directions.length)]
      },
      secondarySwell: {
        height: parseFloat(secondaryHeightM),
        period: Math.floor(Math.random() * 4 + 6),
        direction: directions[Math.floor(Math.random() * directions.length)]
      },
      windSpeed: wind,
      windDirection: ['OFF', 'LIGHT', 'STRONG'][Math.floor(Math.random() * 3)],
      waterTemp: waterTemp,
      tideInfo: {
        type: Math.random() > 0.5 ? 'HIGH' : 'LOW',
        time: `${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`
      },
      tideData: tideData,
      neopreneThickness: waterTemp >= 20 ? 'None' : waterTemp >= 18 ? '2/2mm' : '3/2mm'
    });
  }
  
  return forecast;
};

export const NZ_REGIONS = [
  'All',
  'Northland',
  'Auckland',
  'Waikato',
  'Bay of Plenty',
  'Gisborne',
  'Taranaki',
  'Wellington',
  'Canterbury',
  'Otago',
];

const SPOTS_BASE = [
  { id: '1', name: 'Shipwreck Bay', lat: -35.172, lng: 173.125, region: 'Northland', rating: 'EPIC', height: '6-8' },
  { id: '2', name: '90 Mile Beach', lat: -34.933, lng: 173.09, region: 'Northland', rating: 'FAIR', height: '3-5' },
  { id: '3', name: 'Ahipara', lat: -35.166, lng: 173.153, region: 'Northland', rating: 'GOOD', height: '4-6' },
  { id: '4', name: 'Sandy Bay (Tutukaka)', lat: -35.603, lng: 174.528, region: 'Northland', rating: 'FAIR', height: '2-4' },
  { id: '5', name: 'Te Arai Point', lat: -36.093, lng: 174.579, region: 'Auckland', rating: 'GOOD', height: '3-5' },
  { id: '6', name: 'Muriwai', lat: -36.822, lng: 174.425, region: 'Auckland', rating: 'FAIR', height: '2-4' },
  { id: '7', name: 'Piha', lat: -36.952, lng: 174.468, region: 'Auckland', rating: 'FAIR', height: '2-4' },
  { id: '8', name: 'Karekare', lat: -36.986, lng: 174.446, region: 'Auckland', rating: 'FAIR', height: '2-4' },
  { id: '9', name: 'Bethells (Te Henga)', lat: -36.899, lng: 174.441, region: 'Auckland', rating: 'POOR', height: '1-3' },
  { id: '10', name: 'Raglan (Manu Bay)', lat: -37.825, lng: 174.801, region: 'Waikato', rating: 'GOOD', height: '3-5' },
  { id: '11', name: 'Raglan (Whale Bay)', lat: -37.827, lng: 174.8, region: 'Waikato', rating: 'GOOD', height: '3-5' },
  { id: '12', name: 'Raglan (Indicators)', lat: -37.831, lng: 174.798, region: 'Waikato', rating: 'FAIR', height: '2-4' },
  { id: '13', name: 'Kawhia', lat: -38.07, lng: 174.825, region: 'Waikato', rating: 'POOR', height: '1-2' },
  { id: '14', name: 'Mount Maunganui - Main Beach', lat: -37.6402, lng: 176.1845, region: 'Bay of Plenty', rating: 'FAIR', height: '2-3' },
  { id: '15', name: 'Mount Maunganui - Omanu', lat: -37.6564, lng: 176.2196, region: 'Bay of Plenty', rating: 'GOOD', height: '3-4' },
  { id: '16', name: 'Mount Maunganui - Arataki', lat: -37.6686, lng: 176.2388, region: 'Bay of Plenty', rating: 'FAIR', height: '2-4' },
  { id: '17', name: 'Mount Maunganui - Tay Street', lat: -37.6455, lng: 176.2031, region: 'Bay of Plenty', rating: 'GOOD', height: '3-5' },
  { id: '18', name: 'Mount Maunganui - Moturiki', lat: -37.6337, lng: 176.1805, region: 'Bay of Plenty', rating: 'FAIR', height: '2-3' },
  { id: '19', name: 'Papamoa Beach', lat: -37.7014, lng: 176.2871, region: 'Bay of Plenty', rating: 'GOOD', height: '3-5' },
  { id: '20', name: 'Pukehina Beach', lat: -37.7992, lng: 176.3045, region: 'Bay of Plenty', rating: 'POOR', height: '1-2' },
  { id: '21', name: 'Whakatane Heads', lat: -37.9496, lng: 176.7245, region: 'Bay of Plenty', rating: 'FAIR', height: '2-4' },
  { id: '22', name: 'Maketu', lat: -37.7606, lng: 176.3192, region: 'Bay of Plenty', rating: 'POOR', height: '1-2' },
  { id: '23', name: 'Ohope', lat: -37.9941, lng: 176.6812, region: 'Bay of Plenty', rating: 'FAIR', height: '2-3' },
  { id: '24', name: 'Wainui Beach', lat: -38.645, lng: 177.899, region: 'Gisborne', rating: 'GOOD', height: '3-5' },
  { id: '25', name: 'Makorori Point', lat: -38.587, lng: 177.954, region: 'Gisborne', rating: 'GOOD', height: '4-6' },
  { id: '26', name: 'Midway Beach', lat: -38.673, lng: 177.871, region: 'Gisborne', rating: 'FAIR', height: '2-4' },
  { id: '27', name: 'Stent Road', lat: -39.318, lng: 174.215, region: 'Taranaki', rating: 'GOOD', height: '3-5' },
  { id: '28', name: 'Fitzroy Beach', lat: -39.04, lng: 174.1, region: 'Taranaki', rating: 'FAIR', height: '2-4' },
  { id: '29', name: 'Back Beach', lat: -39.067, lng: 174.03, region: 'Taranaki', rating: 'GOOD', height: '3-5' },
  { id: '30', name: 'Lyall Bay', lat: -41.327, lng: 174.801, region: 'Wellington', rating: 'FAIR', height: '2-3' },
  { id: '31', name: 'Titahi Bay', lat: -41.104, lng: 174.843, region: 'Wellington', rating: 'POOR', height: '1-2' },
  { id: '32', name: 'Castlepoint', lat: -40.901, lng: 176.227, region: 'Wellington', rating: 'GOOD', height: '3-5' },
  { id: '33', name: 'Kaikoura Peninsula', lat: -42.429, lng: 173.697, region: 'Canterbury', rating: 'FAIR', height: '2-4' },
  { id: '34', name: 'Sumner Bar', lat: -43.568, lng: 172.759, region: 'Canterbury', rating: 'POOR', height: '1-2' },
  { id: '35', name: 'Taylor\'s Mistake', lat: -43.575, lng: 172.771, region: 'Canterbury', rating: 'FAIR', height: '2-3' },
  { id: '36', name: 'New Brighton', lat: -43.507, lng: 172.732, region: 'Canterbury', rating: 'POOR', height: '1-2' },
  { id: '37', name: 'St Clair', lat: -45.914, lng: 170.48, region: 'Otago', rating: 'GOOD', height: '3-5' },
  { id: '38', name: 'St Kilda', lat: -45.906, lng: 170.506, region: 'Otago', rating: 'FAIR', height: '2-3' },
  { id: '39', name: 'Aramoana', lat: -45.825, lng: 170.563, region: 'Otago', rating: 'POOR', height: '1-2' },
  { id: '40', name: 'Kaka Point', lat: -46.401, lng: 170.159, region: 'Otago', rating: 'FAIR', height: '2-4' },
  ...CUSTOM_NZ_SPOTS,
];

export const NZ_SPOTS = SPOTS_BASE.map(spot => ({
  ...spot,
  showName: spot.showName || spot.name,
  forecast: generateForecast(spot.rating)
})).map(applyMarkerOffsets);

export const getSpotShowName = (spot) => spot?.showName || spot?.name || '';
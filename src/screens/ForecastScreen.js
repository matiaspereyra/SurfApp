import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Animated, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wind, Waves, Thermometer, Clock, Heart, Bell, ChevronDown, ChevronUp, Sunrise, Sunset } from 'lucide-react-native';
import Svg, { Path, Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import SunCalc from 'suncalc';
import AppHeader from '../components/AppHeader';
import { SURFLINE_COLORS, getSpotShowName } from '../constants/Spots';
import { fetchSpotForecastByName } from '../services/forecastService';
import { getAlertRule, upsertAlertRule } from '../services/alertRuleService';
import { isCompactLayout } from '../theme/ui';

// Función para convertir dirección a ángulo (invierte para mostrar hacia dónde va, no de dónde viene)
const getDirectionAngle = (direction) => {
  const directions = {
    'N': 180,    // viene del norte, flecha apunta al sur
    'NNE': 202.5,
    'NE': 225,   // viene del noreste, flecha apunta al suroeste
    'ENE': 247.5,
    'E': 270,    // viene del este, flecha apunta al oeste
    'ESE': 292.5,
    'SE': 315,   // viene del sureste, flecha apunta al noroeste
    'SSE': 337.5,
    'S': 0,      // viene del sur, flecha apunta al norte
    'SSW': 22.5,
    'SW': 45,    // viene del suroeste, flecha apunta al noreste
    'WSW': 67.5,
    'W': 90,     // viene del oeste, flecha apunta al este
    'WNW': 112.5,
    'NW': 135,   // viene del noroeste, flecha apunta al sureste
    'NNW': 157.5,
  };
  return directions[direction] || 0;
};

const getOppositeAngle = (degValue) => {
  const deg = Number(degValue);
  if (!Number.isFinite(deg)) return 0;
  return (deg + 180) % 360;
};

const toKph = (kts) => {
  const speed = Number(kts);
  if (!Number.isFinite(speed)) return null;
  return Math.round(speed * 1.852);
};

const getWindGustColor = (kphValue) => {
  const speed = Number(kphValue);
  if (!Number.isFinite(speed)) return '#334155';
  return speed > 11 ? '#DC2626' : '#334155';
};

const getColorByHeight = (heightMeters) => {
  const height = Number(heightMeters);
  if (!Number.isFinite(height)) return '#FFB100'; // naranja por defecto
  if (height <= 1) return '#DC2626'; // rojo
  if (height <= 3) return '#FFB100'; // naranja
  if (height <= 4) return '#00D15D'; // verde
  return '#00A145'; // verde oscuro para 4m+
};

const getColorByStarCount = (starCount) => {
  const stars = Number(starCount);
  if (!Number.isFinite(stars)) return '#FFB100';
  if (stars <= 1) return '#DC2626';
  if (stars <= 3) return '#FFB100';
  if (stars === 4) return '#00D15D';
  return '#00A145';
};

const getColorByRating = (swellHeightM, swellPeriodS, windSpeedKts) => {
  const windKph = toKph(windSpeedKts);
  const stars = getRowStars(swellHeightM, swellPeriodS, windKph);
  return getColorByStarCount(stars);
};

const THREE_HOUR_SLOTS = [0, 3, 6, 9, 12, 15, 18, 21];

const getNzTodayDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

const getNzCurrentMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 12 * 60;
  return clamp(hour * 60 + minute, 0, 24 * 60 - 1);
};

const formatForecastDayLabel = (dateKey, fallbackDayOfWeek = '') => {
  if (!dateKey) return fallbackDayOfWeek || '--';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallbackDayOfWeek || dateKey;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatHourlyHeaderTitle = (dateKey, fallbackDayOfWeek = '') => {
  if (!dateKey) return fallbackDayOfWeek || '--';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallbackDayOfWeek || dateKey;

  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long' });
  const day = parsed.getDate();
  const month = parsed.getMonth() + 1;
  return `${weekday}, ${day}/${month}`;
};

const getHourFromTime = (time) => {
  if (typeof time !== 'string' || time.length < 2) return null;
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : null;
};

const formatHourSlot = (time) => {
  const hour = getHourFromTime(time);
  if (hour === null) return '--';
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return 'Noon';
  return `${hour - 12}pm`;
};

const formatHourSlotVertical = (time) => {
  const label = String(formatHourSlot(time) || '--');
  return label;
};

const getRowStars = (surfHeight, swellPeriodS, windKph) => {
  const surf = Number(surfHeight);
  const period = Number(swellPeriodS);
  const wind = Number(windKph);
  if (!Number.isFinite(surf)) return 1;

  let score = 0;

  // Altura útil y consistente para surf
  if (surf >= 0.8) score += 1;
  if (surf >= 1.4) score += 1;

  // Periodos mayores suelen indicar más energía y mejor forma
  if (Number.isFinite(period)) {
    if (period >= 9) score += 1;
    if (period >= 12) score += 1;
  }

  // Menos viento = mejor calidad de ola
  if (Number.isFinite(wind)) {
    if (wind <= 18) score += 1;
    if (wind <= 10) score += 1;
  }

  return Math.max(1, Math.min(5, score));
};

const formatShortDate = (dateKey) => {
  if (!dateKey) return '';
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
};

const formatHeightRangeMeters = (heightValue) => {
  if (heightValue === null || heightValue === undefined) return '--';
  const raw = String(heightValue).trim();
  if (!raw || raw === '--') return '--';

  // If there is already a unit, keep it unchanged.
  if (/(m|ft|pies|metros)/i.test(raw)) return raw;
  return `${raw} m`;
};

const formatSurfRange = (surfHeight) => {
  const value = Number(surfHeight);
  if (!Number.isFinite(value)) return '--';

  const min = Math.max(0, value - 0.2);
  const max = value + 0.2;
  return `${min.toFixed(1)}-${max.toFixed(1)}`;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatMinutesToHHMM = (minutes) => {
  const safe = clamp(Math.round(minutes), 0, 24 * 60 - 1);
  const hh = Math.floor(safe / 60);
  const mm = safe % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const formatMinutesToAmPm = (minutes) => {
  const hhmm = formatMinutesToHHMM(minutes);
  const [hourRaw, minuteRaw] = hhmm.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '--';

  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
};

const formatHHMMToAmPm = (hhmm) => {
  const raw = String(hhmm || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '--';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '--';

  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')}${suffix}`;
};

const parseAmPmToMinutes = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!match) return null;

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3];
  if (!Number.isFinite(hour12) || !Number.isFinite(minute)) return null;
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

  const baseHour = hour12 % 12;
  const hour24 = suffix === 'pm' ? baseHour + 12 : baseHour;
  return hour24 * 60 + minute;
};

const formatTideHeightMeters = (value, decimals = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const safe = Math.abs(num) < 1e-6 ? 0 : num;
  return `${safe.toFixed(decimals)}m`;
};

const getMinutesFromHHMM = (hhmm) => {
  const raw = String(hhmm || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;

  const total = hour * 60 + minute;
  return clamp(total, 0, 24 * 60 - 1);
};

const formatDateToAmPmNz = (dateValue) => {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '--';
  const formatted = dateValue.toLocaleTimeString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatted.replace(/\s+/g, '').toLowerCase();
};

const getSunTimesReal = (dateKey, lat, lng) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const dt = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(dt.getTime()) || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return {
      firstLight: '6:10am',
      sunrise: '6:40am',
      sunset: '7:20pm',
      lastLight: '7:50pm',
    };
  }

  // Use noon anchor to keep requested calendar day stable around timezone edges.
  const noonAnchor = new Date(`${dateKey}T12:00:00`);
  const sunTimes = SunCalc.getTimes(noonAnchor, latNum, lngNum);

  return {
    firstLight: formatDateToAmPmNz(sunTimes?.dawn),
    sunrise: formatDateToAmPmNz(sunTimes?.sunrise),
    sunset: formatDateToAmPmNz(sunTimes?.sunset),
    lastLight: formatDateToAmPmNz(sunTimes?.dusk),
  };
};

const buildTideGraph = (points, width, height) => {
  if (!Array.isArray(points) || !points.length) {
    return { coords: [], path: '', fillPath: '' };
  }

  const minHeight = Math.min(...points.map((p) => Number(p?.height) || 0));
  const maxHeight = Math.max(...points.map((p) => Number(p?.height) || 0));
  const range = Math.max(0.1, maxHeight - minHeight);
  const innerW = Math.max(1, width - 20);
  const innerH = Math.max(1, height - 24);
  const yCenter = 8 + innerH / 2;
  const xForMinutes = (minutes) => 10 + (innerW * clamp(minutes, 0, TIDE_TIMELINE_END_MINUTES)) / TIDE_TIMELINE_END_MINUTES;

  const coords = points.map((point, idx) => {
    const pointMinutes = getMinutesFromHHMM(point?.time);
    const clampedMinutes = Number.isFinite(pointMinutes)
      ? clamp(pointMinutes, 0, TIDE_TIMELINE_END_MINUTES)
      : null;
    const x = Number.isFinite(pointMinutes)
      ? xForMinutes(clampedMinutes)
      : 10 + (innerW * idx) / Math.max(1, points.length - 1);
    const normalized = ((Number(point?.height) || 0) - minHeight) / range;
    const rawY = 8 + (1 - normalized) * innerH;
    const flattenFactor = 0.38;
    const verticalBias = innerH * 0.20;
    const y = clamp(yCenter + (rawY - yCenter) * flattenFactor + verticalBias, 8, height - 6);
    return { x, y, point, idx };
  });

  let path = '';
  if (coords.length === 1) {
    path = `M ${coords[0].x} ${coords[0].y}`;
  } else if (coords.length === 2) {
    // Fallback to a single curve when only two points are available.
    const p0 = coords[0];
    const p1 = coords[1];
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    path = `M ${p0.x} ${p0.y} Q ${cx} ${cy}, ${p1.x} ${p1.y}`;
  } else {
    // Midpoint quadratic spline: visually uniform wave without hard straight sections.
    path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length - 1; i += 1) {
      const curr = coords[i];
      const next = coords[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      path += ` Q ${curr.x} ${curr.y}, ${midX} ${midY}`;
    }
    const prev = coords[coords.length - 2];
    const last = coords[coords.length - 1];
    path += ` Q ${prev.x} ${prev.y}, ${last.x} ${last.y}`;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  const bottomY = height - 2;
  const fillPath = `${path} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

  return { coords, path, fillPath, bottomY, xForMinutes };
};

const getTideExtrema = (coords) => {
  if (!Array.isArray(coords) || coords.length < 3) return [];

  const getQuadraticVertex = (p1, p2, p3) => {
    const x1 = Number(p1?.m);
    const x2 = Number(p2?.m);
    const x3 = Number(p3?.m);
    const y1 = Number(p1?.h);
    const y2 = Number(p2?.h);
    const y3 = Number(p3?.h);
    if (![x1, x2, x3, y1, y2, y3].every(Number.isFinite)) return null;

    const den = (x1 - x2) * (x1 - x3) * (x2 - x3);
    if (!Number.isFinite(den) || Math.abs(den) < 1e-9) return null;

    const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / den;
    const b = (x3 * x3 * (y1 - y2) + x2 * x2 * (y3 - y1) + x1 * x1 * (y2 - y3)) / den;
    const c =
      (x2 * x3 * (x2 - x3) * y1 + x3 * x1 * (x3 - x1) * y2 + x1 * x2 * (x1 - x2) * y3) / den;
    if (!Number.isFinite(a) || Math.abs(a) < 1e-9 || !Number.isFinite(b) || !Number.isFinite(c)) return null;

    const xv = -b / (2 * a);
    const yv = a * xv * xv + b * xv + c;
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) return null;
    return { xv, yv };
  };

  const refineExtrema = (item) => {
    const i = Number(item?.idx);
    if (!Number.isFinite(i) || i <= 0 || i >= coords.length - 1) {
      return {
        x: item.x,
        y: item.y,
        labelTime: formatHHMMToAmPm(item?.point?.time),
        labelHeight: Number(item?.point?.height),
      };
    }

    const prev = coords[i - 1];
    const curr = coords[i];
    const next = coords[i + 1];
    const prevM = getMinutesFromHHMM(prev?.point?.time);
    const currM = getMinutesFromHHMM(curr?.point?.time);
    const nextM = getMinutesFromHHMM(next?.point?.time);
    const prevH = Number(prev?.point?.height);
    const currH = Number(curr?.point?.height);
    const nextH = Number(next?.point?.height);

    if (![prevM, currM, nextM, prevH, currH, nextH].every(Number.isFinite)) {
      return {
        x: item.x,
        y: item.y,
        labelTime: formatHHMMToAmPm(item?.point?.time),
        labelHeight: Number(item?.point?.height),
      };
    }

    const vertex = getQuadraticVertex(
      { m: prevM, h: prevH },
      { m: currM, h: currH },
      { m: nextM, h: nextH }
    );
    if (!vertex) {
      return {
        x: item.x,
        y: item.y,
        labelTime: formatHHMMToAmPm(item?.point?.time),
        labelHeight: currH,
      };
    }

    const minM = Math.min(prevM, currM, nextM);
    const maxM = Math.max(prevM, currM, nextM);
    const refinedM = clamp(vertex.xv, minM, maxM);
    const span = Math.max(1, nextM - prevM);
    const ratio = clamp((refinedM - prevM) / span, 0, 1);
    const refinedX = prev.x + (next.x - prev.x) * ratio;

    return {
      x: refinedX,
      y: curr.y,
      labelTime: formatMinutesToAmPm(refinedM),
      labelHeight: vertex.yv,
    };
  };

  const rawMax = [];
  const rawMin = [];
  for (let i = 1; i < coords.length - 1; i += 1) {
    const prevY = Number(coords[i - 1]?.y);
    const curY = Number(coords[i]?.y);
    const nextY = Number(coords[i + 1]?.y);
    if (!Number.isFinite(prevY) || !Number.isFinite(curY) || !Number.isFinite(nextY)) continue;

    // In screen coordinates, smaller y is a visual maximum and larger y is a visual minimum.
    if (curY <= prevY && curY <= nextY) {
      rawMax.push({ ...coords[i], kind: 'max' });
    } else if (curY >= prevY && curY >= nextY) {
      rawMin.push({ ...coords[i], kind: 'min' });
    }
  }

  const pickDistinctByX = (pool, count, sortFn) => {
    const sorted = pool.slice().sort(sortFn);
    const chosen = [];
    for (const item of sorted) {
      const tooClose = chosen.some((picked) => Math.abs((picked.idx || 0) - (item.idx || 0)) < 2);
      if (tooClose) continue;
      chosen.push(item);
      if (chosen.length >= count) break;
    }
    return chosen;
  };

  // Prefer the true highest and lowest points of the plotted wave.
  let maxes = pickDistinctByX(rawMax, 2, (a, b) => a.y - b.y);
  let mins = pickDistinctByX(rawMin, 2, (a, b) => b.y - a.y);

  // Fallback to actual curve points (still visually on-curve) if local extrema are insufficient.
  if (maxes.length < 2) {
    const fallbackMax = pickDistinctByX(coords.slice(1, -1).map((c) => ({ ...c, kind: 'max' })), 2, (a, b) => a.y - b.y);
    maxes = fallbackMax.slice(0, 2);
  }
  if (mins.length < 2) {
    const fallbackMin = pickDistinctByX(coords.slice(1, -1).map((c) => ({ ...c, kind: 'min' })), 2, (a, b) => b.y - a.y);
    mins = fallbackMin.slice(0, 2);
  }

  return [...maxes, ...mins]
    .sort((a, b) => a.x - b.x)
    .map((item) => ({ ...item, ...refineExtrema(item) }));
};

const TIDE_TIMELINE_END_MINUTES = 23 * 60;
const TIDE_TIMELINE_MAJOR_MARKS = [
  { label: '12', minutes: 0 },
  { label: '3', minutes: 3 * 60 },
  { label: '6', minutes: 6 * 60 },
  { label: '9', minutes: 9 * 60 },
  { label: '12', minutes: 12 * 60 },
  { label: '3', minutes: 15 * 60 },
  { label: '6', minutes: 18 * 60 },
  { label: '9', minutes: 21 * 60 },
];

const DirectionTriangle = ({ angle = 0, color = '#0F172A', size = 14 }) => (
  <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size * 0.45,
        borderRightWidth: size * 0.45,
        borderBottomWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  </View>
);

const WindDirectionArrow = ({ angle = 0, color = '#0F172A' }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${angle}deg` }] }}>
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderBottomWidth: 9,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
        marginBottom: -1,
      }}
    />
    <View
      style={{
        width: 3,
        height: 13,
        borderRadius: 0,
        backgroundColor: color,
      }}
    />
  </View>
);

function SkeletonBlock({ style }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

export default function ForecastScreen({
  spot,
  onBack,
  authUser,
  isFavorite = false,
  onToggleFavorite = () => {},
}) {
  const [liveSpot, setLiveSpot] = useState(null);
  const [loadingLiveForecast, setLoadingLiveForecast] = useState(false);
  const [expandedDailySections, setExpandedDailySections] = useState({});
  const [tideCursorByDay, setTideCursorByDay] = useState({});
  const [tideCursorMovedByDay, setTideCursorMovedByDay] = useState({});
  const [isSpotAlertOn, setIsSpotAlertOn] = useState(false);
  const [savingSpotAlert, setSavingSpotAlert] = useState(false);
  const tideDragFrameRef = useRef(null);
  const pendingTideCursorRef = useRef(null);
  const tideHapticStateRef = useRef({});
  const tideLastCursorRef = useRef({});
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const compact = isCompactLayout(screenWidth);
  const spotTitle = getSpotShowName(spot);
  const isVeryLongTitle = spotTitle.length > 22;
  const isLongTitle = spotTitle.length > 16;
  const headerTitleStyle = isVeryLongTitle
    ? styles.headerTitleVeryLong
    : isLongTitle
      ? styles.headerTitleLong
      : styles.headerTitleDefault;

  useEffect(() => {
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [spot?.id]);

  useEffect(() => {
    let mounted = true;

    const loadLiveForecast = async () => {
      if (!spot?.name) {
        if (mounted) {
          setLiveSpot(null);
        }
        return;
      }

      setLoadingLiveForecast(true);
      const live = await fetchSpotForecastByName(spot.name, 16);

      if (mounted) {
        setLiveSpot(live);
        setLoadingLiveForecast(false);
      }
    };

    loadLiveForecast();

    return () => {
      mounted = false;
    };
  }, [spot?.name]);

  useEffect(() => {
    setExpandedDailySections({});
    setTideCursorByDay({});
    setTideCursorMovedByDay({});
    tideHapticStateRef.current = {};
    tideLastCursorRef.current = {};
  }, [spot?.name]);

  useEffect(() => () => {
    if (tideDragFrameRef.current) {
      cancelAnimationFrame(tideDragFrameRef.current);
      tideDragFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadSpotAlertState = async () => {
      if (!authUser?.id || !spot?.name) {
        if (mounted) setIsSpotAlertOn(false);
        return;
      }

      const rule = await getAlertRule(authUser.id);
      if (!mounted) return;

      const selectedSpots = Array.isArray(rule?.spot_names) ? rule.spot_names : [];
      const hasSpotEnabled = Boolean(rule?.is_armed) && selectedSpots.includes(spot.name);
      setIsSpotAlertOn(hasSpotEnabled);
    };

    loadSpotAlertState();

    return () => {
      mounted = false;
    };
  }, [authUser?.id, spot?.name]);

  if (!spot) return null;

  const displaySpot = liveSpot;
  const displayForecast = displaySpot?.forecast || [];
  const nzTodayDateKey = getNzTodayDateKey();
  const upcomingForecast = displayForecast.filter((day) => {
    if (!day?.date || !nzTodayDateKey) return false;
    return day.date >= nzTodayDateKey;
  });
  const currentForecastDay = upcomingForecast[0] || null;
  const heroHeightLabel = currentForecastDay
    ? `${currentForecastDay?.height?.min ?? '--'}-${currentForecastDay?.height?.max ?? '--'} m`
    : formatHeightRangeMeters(displaySpot?.height);
  const hasLiveForecast = Boolean(displaySpot && upcomingForecast.length);
  const showForecastSkeleton = loadingLiveForecast && !hasLiveForecast;
  const hourlyForecastByDay = upcomingForecast
    .slice(0, 16)
    .map((day) => {
      const hourlyBySlot = new Map();
      if (Array.isArray(day?.hourlyData)) {
        day.hourlyData.forEach((hour) => {
          const parsedHourRaw = getHourFromTime(hour?.time);
          if (parsedHourRaw === null) return;

          // Normalize midnight values like 24:00 to 00:00.
          const parsedHour = parsedHourRaw % 24;
          const slot = Math.floor(parsedHour / 3) * 3;
          const distanceToSlot = Math.abs(parsedHour - slot);
          const existing = hourlyBySlot.get(slot);
          const hasWindValue = hour?.windSpeed !== null && hour?.windSpeed !== undefined;
          const existingHasWindValue = existing?.windSpeed !== null && existing?.windSpeed !== undefined;

          if (
            !existing ||
            distanceToSlot < existing.distanceToSlot ||
            (distanceToSlot === existing.distanceToSlot && hasWindValue && !existingHasWindValue)
          ) {
            hourlyBySlot.set(slot, {
              ...hour,
              distanceToSlot,
            });
          }
        });
      }

      const entries = THREE_HOUR_SLOTS.map((slot) => {
        const slotHour = hourlyBySlot.get(slot);
        if (slotHour) {
          const { distanceToSlot, ...rest } = slotHour;
          return rest;
        }

        return {
          time: `${String(slot).padStart(2, '0')}:00`,
          surfHeight: null,
          swellHeight: null,
          swellPeriod: null,
          swellDirection: null,
          windSpeed: null,
          windGust: null,
          windDirection: null,
          windDirectionDeg: null,
          isPlaceholder: true,
        };
      });

      return {
        ...day,
        dayLabel: formatForecastDayLabel(day?.date, day?.dayOfWeek),
        entries,
      };
    });

  const handleToggleFavorite = () => {
    onToggleFavorite?.(spot?.name);
  };

  const toggleDaySection = (dayKey) => {
    setExpandedDailySections((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey],
    }));
  };

  const setTideCursor = (dayKey, value, withHaptics = true) => {
    const clampedValue = clamp(value, 0, 1);
    pendingTideCursorRef.current = { dayKey, value: clampedValue };

    if (withHaptics) {
      const step = Math.round(clampedValue * 12);
      const now = Date.now();
      const state = tideHapticStateRef.current[dayKey] || { step: -1, timestamp: 0 };
      if (step !== state.step && now - state.timestamp > 90) {
        tideHapticStateRef.current[dayKey] = { step, timestamp: now };
        Haptics.selectionAsync().catch(() => {});
      }
    }

    if (tideDragFrameRef.current) return;
    tideDragFrameRef.current = requestAnimationFrame(() => {
      const pending = pendingTideCursorRef.current;
      tideDragFrameRef.current = null;
      if (!pending) return;

      const previous = tideLastCursorRef.current[pending.dayKey];
      if (Number.isFinite(previous) && Math.abs(previous - pending.value) < 0.005) {
        pendingTideCursorRef.current = null;
        return;
      }

      tideLastCursorRef.current[pending.dayKey] = pending.value;
      setTideCursorByDay((prev) => ({
        ...prev,
        [pending.dayKey]: pending.value,
      }));
      pendingTideCursorRef.current = null;
    });
  };

  const handleTideTouch = (dayKey, locationX, width, isStart = false) => {
    if (isStart) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      setTideCursorMovedByDay((prev) => (prev?.[dayKey] ? prev : { ...prev, [dayKey]: true }));
    }
    setTideCursor(dayKey, locationX / width, true);
  };

  const handleToggleSpotAlert = async () => {
    if (!authUser?.id || !spot?.name || savingSpotAlert) return;

    setSavingSpotAlert(true);
    const currentRule = await getAlertRule(authUser.id);
    const currentSpots = Array.isArray(currentRule?.spot_names) ? currentRule.spot_names : [];

    const hasSpot = currentSpots.includes(spot.name);
    const nextSpotNames = hasSpot
      ? currentSpots.filter((name) => name !== spot.name)
      : [...currentSpots, spot.name];

    const result = await upsertAlertRule({
      userId: authUser.id,
      spotNames: nextSpotNames,
      minRating: 'GOOD',
      maxWindKts: 99,
      isArmed: nextSpotNames.length > 0,
    });

    if (result.ok) {
      setIsSpotAlertOn(nextSpotNames.includes(spot.name));
    }

    setSavingSpotAlert(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.atmosphereOne} pointerEvents="none" />
      <View style={styles.atmosphereTwo} pointerEvents="none" />

      {/* Header */}
      <AppHeader
        title={spotTitle}
        compact={compact}
        sideSlotWidth={84}
        titleStyle={headerTitleStyle}
        onBack={onBack}
        rightElement={(
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleToggleSpotAlert}
              style={styles.actionButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Bell
                color={isSpotAlertOn ? '#FFB100' : savingSpotAlert ? '#627486' : '#8EA2B8'}
                size={20}
                fill={isSpotAlertOn ? '#FFB100' : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.actionButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Heart
                color={isFavorite ? '#00D15D' : '#8EA2B8'}
                size={20}
                fill={isFavorite ? '#00D15D' : 'transparent'}
              />
            </TouchableOpacity>
          </View>
        )}
      />

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        style={{ opacity: contentOpacity }}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={[styles.heroCard, compact ? styles.heroCardCompact : null]}>
            <View style={styles.heroTopRow}>
              <View
                style={[
                  styles.ratingBadge,
                  { backgroundColor: getColorByRating(currentForecastDay?.primarySwell?.height, currentForecastDay?.primarySwell?.period, currentForecastDay?.windSpeed) },
                ]}
              >
                <Text style={styles.ratingText}>{displaySpot?.rating || '--'}</Text>
              </View>
              <Text style={styles.liveTag}>LIVE</Text>
            </View>
            {showForecastSkeleton ? (
              <SkeletonBlock style={[styles.waveHeightSkeleton, compact ? styles.waveHeightSkeletonCompact : null]} />
            ) : (
              <Text style={[styles.waveHeightValue, compact ? styles.waveHeightValueCompact : null]}>{heroHeightLabel}</Text>
            )}
            <View style={styles.metricsRow}>
              <View style={styles.metricPill}>
                <Waves size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>SWELL</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                  <Text style={styles.metricPillValue}>{currentForecastDay?.primarySwell?.height ?? '0.5'}m</Text>
                )}
              </View>
              <View style={styles.metricPill}>
                <Clock size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>PERIODO</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                    <Text style={styles.metricPillValue}>{currentForecastDay?.primarySwell?.period ?? '13'}s</Text>
                )}
              </View>
              <View style={styles.metricPill}>
                <Wind size={14} color="#46D7FF" />
                <Text style={styles.metricPillLabel}>VIENTO</Text>
                {showForecastSkeleton ? (
                  <SkeletonBlock style={styles.metricValueSkeleton} />
                ) : (
                    <Text style={styles.metricPillValue}>{currentForecastDay?.windSpeed ?? '--'}kts</Text>
                )}
              </View>
            </View>
            <Text style={styles.liveHint}>
              {loadingLiveForecast
                ? 'Actualizando forecast real...'
                : hasLiveForecast
                  ? 'Forecast real activo'
                  : 'Sin forecast real disponible para este spot'}
            </Text>
          </View>
        </View>

        {/* Hourly Forecast Table by Day (every 3h) */}
        <Text style={[styles.sectionTitle, compact ? styles.sectionTitleCompact : null]}>PRONOSTICO DIARIO CADA 3 HORAS</Text>

        {showForecastSkeleton ? (
          [0, 1].map((idx) => (
            <View key={`hourly-skeleton-${idx}`} style={styles.dayHourlySkeletonCard}>
              <View style={styles.dayHourlyHeader}>
                <SkeletonBlock style={styles.dayTitleSkeleton} />
                <SkeletonBlock style={styles.daySubSkeleton} />
              </View>
              {[0, 1, 2, 3].map((rowIdx) => (
                <View key={`hourly-skeleton-row-${rowIdx}`} style={styles.dayHourlySkeletonRow}>
                  <SkeletonBlock style={styles.hourSkeletonCell} />
                  <SkeletonBlock style={styles.surfSkeletonCell} />
                  <SkeletonBlock style={styles.swellSkeletonCell} />
                  <SkeletonBlock style={styles.windSkeletonCell} />
                </View>
              ))}
            </View>
          ))
        ) : !hasLiveForecast || !hourlyForecastByDay.length ? (
          <Text style={styles.emptyForecastText}>Sin datos de forecast disponibles.</Text>
        ) : (
          hourlyForecastByDay.map((day, dayIdx) => (
            <View key={`${day.date}-${dayIdx}`} style={styles.dayHourlyCard}>
              {(() => {
                const dayKey = day.date || String(dayIdx);
                const isExpanded = Boolean(expandedDailySections[dayKey]);
                const shownEntries = isExpanded
                  ? day.entries
                  : day.entries.filter((hour) => {
                      const hourValue = getHourFromTime(hour?.time);
                      return hourValue === 6 || hourValue === 12 || hourValue === 18;
                    });
                const tidePoints = Array.isArray(day.tideData) ? day.tideData : [];
                const graphWidth = Math.max(220, screenWidth - 12);
                const graphHeight = 156;
                const nowCursor = clamp(getNzCurrentMinutes() / TIDE_TIMELINE_END_MINUTES, 0, 1);
                const defaultTideCursor = nowCursor;
                const tideCursor = Number.isFinite(tideCursorByDay[dayKey]) ? tideCursorByDay[dayKey] : defaultTideCursor;
                const sunTimes = getSunTimesReal(day.date, spot?.lat, spot?.lng);
                const sunriseMinutes = parseAmPmToMinutes(sunTimes.sunrise);
                const sunsetMinutes = parseAmPmToMinutes(sunTimes.sunset);
                const graph = buildTideGraph(tidePoints, graphWidth, graphHeight);
                const extrema = getTideExtrema(graph.coords);
                const preSunriseMinutes = Number.isFinite(sunriseMinutes)
                  ? clamp(sunriseMinutes, 0, TIDE_TIMELINE_END_MINUTES)
                  : null;
                const postSunsetMinutes = Number.isFinite(sunsetMinutes)
                  ? clamp(sunsetMinutes, 0, TIDE_TIMELINE_END_MINUTES)
                  : null;
                const timelineTickMinutes = Array.from({ length: 24 }, (_item, idx) => idx * 60);
                const cursorX = clamp(tideCursor * graphWidth, 0, graphWidth);
                const selected = graph.coords.length
                  ? graph.coords.reduce((closest, point) => (
                      Math.abs(point.x - cursorX) < Math.abs(closest.x - cursorX) ? point : closest
                    ), graph.coords[0])
                  : null;

                return (
                  <>
              <TouchableOpacity
                onPress={() => toggleDaySection(dayKey)}
                activeOpacity={0.85}
                style={styles.dayHourlyHeader}
              >
                <View style={styles.dayHeaderTitleRow}>
                  {isExpanded ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#64748B" />
                  )}
                  <Text style={styles.dayHourlyTitle}>{formatHourlyHeaderTitle(day.date, day.dayOfWeek || day.dayLabel)}</Text>
                </View>
                <View style={styles.dayHeaderActionRow}>
                  <Text style={styles.dayHeaderActionText}>
                    {isExpanded ? 'COLAPSAR' : 'VER TODO'}
                  </Text>
                </View>
              </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleDaySection(dayKey)}
                  activeOpacity={1}
                  style={styles.tableContainerNoScroll}
                >
                  <View style={styles.forecastTable}>
                    <View style={styles.tableHeaderRow}>
                      <View style={[styles.tableCell, styles.hourCell, styles.headerHourCell]} />
                      <View style={[styles.tableCell, styles.surfCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>SURF (m)</Text>
                      </View>
                      <View style={[styles.tableCell, styles.swellCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>SWELL</Text>
                      </View>
                      <View style={[styles.tableCell, styles.windCell, styles.headerMainCell]}>
                        <Text style={styles.tableHeader}>WIND</Text>
                      </View>
                    </View>

                    {shownEntries.map((hour, idx) => {
                      const kph = toKph(hour.windSpeed);
                      const gustKph = toKph(hour.windGust);
                      const starCount = getRowStars(hour.surfHeight ?? hour.swellHeight, hour.swellPeriod, kph);
                      const starColor = getColorByStarCount(starCount);
                      const swellDeg = Number(hour.swellDirectionDeg);
                      const swellAngle = Number.isFinite(swellDeg)
                        ? getOppositeAngle(swellDeg)
                        : getDirectionAngle(hour.swellDirection);
                      const windAngle = Number.isFinite(Number(hour.windDirectionDeg))
                        ? getOppositeAngle(hour.windDirectionDeg)
                        : getDirectionAngle(hour.windDirection);

                      return (
                        <View
                          key={`${day.date}-${hour.time}-${idx}`}
                          style={[
                            styles.tableDataRow,
                            idx % 2 === 1 ? styles.tableDataRowAlt : null,
                            compact ? styles.tableDataRowCompact : null,
                            hour?.isPlaceholder ? styles.tableDataRowPlaceholder : null,
                          ]}
                        >
                          <View style={[styles.tableCell, styles.hourCell, styles.hourBandCell, idx % 2 === 1 ? styles.hourBandCellAlt : null]}>
                            <View style={styles.hourMetaVerticalRow}>
                              <View style={styles.verticalHourContainer}>
                                <Text style={[styles.tableHourText, styles.verticalHourText]}>{formatHourSlotVertical(hour.time)}</Text>
                              </View>
                              <View style={styles.ratingBlocksRow}>
                                {Array.from({ length: 5 }, (_item, blockIdx) => (
                                  <View
                                    key={`rating-block-${day.date}-${hour.time}-${idx}-${blockIdx}`}
                                    style={[
                                      styles.ratingBlock,
                                      (5 - blockIdx) <= starCount
                                        ? { backgroundColor: starColor }
                                        : styles.ratingBlockEmpty,
                                      blockIdx === 0 ? styles.ratingBlockFirst : null,
                                      blockIdx === 4 ? styles.ratingBlockLast : null,
                                    ]}
                                  />
                                ))}
                              </View>
                            </View>
                          </View>

                          <View style={[styles.tableCell, styles.surfCell, styles.surfBandCell]}>
                            <View style={styles.surfValuePanel}>
                              <Text style={[styles.metricValue, styles.surfMetricValue]}>
                                {formatSurfRange(hour.surfHeight ?? hour.swellHeight)}
                              </Text>
                            </View>
                          </View>

                          <View style={[styles.tableCell, styles.swellCell, styles.swellBandCell, idx % 2 === 1 ? styles.swellBandCellAlt : null]}>
                            <View style={styles.swellGridRow}>
                              <View style={styles.swellGridCol}>
                                <Text style={styles.swellDataValue}>{hour.swellHeight ?? '--'}<Text style={styles.swellUnitTiny}>m</Text></Text>
                              </View>
                              <View style={styles.swellGridCol}>
                                <Text style={styles.swellDataValue}>{hour.swellPeriod ?? '--'}<Text style={styles.swellUnitTiny}>s</Text></Text>
                              </View>
                              <View style={styles.swellGridCol}>
                                <DirectionTriangle
                                  angle={swellAngle}
                                  color="#3B4A59"
                                  size={16}
                                />
                                <Text style={styles.swellDirectionDeg}>{Number.isFinite(swellDeg) ? `${Math.round(swellDeg)}°` : '--'}</Text>
                              </View>
                            </View>
                          </View>

                          <View
                            style={[
                              styles.tableCell,
                              styles.windCell,
                              styles.windCombinedCell,
                            ]}
                          >
                            <View style={styles.windMainInfo}>
                              <View style={styles.windSpeedRow}>
                                <Text style={styles.windSpeedText}>{kph ?? '--'}</Text>
                                <View style={styles.windUnitStack}>
                                  <Text style={[styles.windGustExponent, { color: getWindGustColor(gustKph) }]}>{Number.isFinite(gustKph) ? gustKph : '--'}</Text>
                                  <Text style={styles.windUnit}>kph</Text>
                                </View>
                              </View>
                            </View>
                            <View style={[styles.windArrowPanel, idx % 2 === 0 ? styles.windArrowPanelEven : null]}>
                              <WindDirectionArrow angle={windAngle} color="#0F172A" />
                              <Text style={styles.windArrowLabel}>{hour.windDirection ?? '--'}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </TouchableOpacity>
                {isExpanded ? (
                  <View style={styles.tideSectionWrap}>
                    <View style={styles.tideSectionTopBorder} />
                    <View style={styles.tideSectionTitleRow}>
                      <Text style={styles.tideSectionTitle}>TIDES (m)</Text>
                    </View>
                    <Text style={styles.tideSpotMeta}>{spotTitle} · {spot?.region || 'New Zealand'}</Text>

                    <View
                      style={styles.tideWaveCard}
                      onStartShouldSetResponder={() => true}
                      onMoveShouldSetResponder={() => true}
                      onResponderGrant={(evt) => handleTideTouch(dayKey, evt.nativeEvent.locationX, graphWidth, true)}
                      onResponderMove={(evt) => handleTideTouch(dayKey, evt.nativeEvent.locationX, graphWidth)}
                    >
                      <Svg width={graphWidth} height={graphHeight}>
                        <Path d={graph.fillPath} fill="#DFEAF0" stroke="none" />
                        <Path d={graph.path} stroke="#0F172A" strokeWidth={2.2} fill="none" />
                        {Number.isFinite(preSunriseMinutes) && preSunriseMinutes > 0 ? (
                          <Rect
                            x={0}
                            y={0}
                            width={Math.max(0, graph.xForMinutes(preSunriseMinutes))}
                            height={graphHeight}
                            fill="rgba(15,23,42,0.08)"
                          />
                        ) : null}
                        {Number.isFinite(postSunsetMinutes) && postSunsetMinutes < TIDE_TIMELINE_END_MINUTES ? (
                          <Rect
                            x={Math.max(0, graph.xForMinutes(postSunsetMinutes))}
                            y={0}
                            width={Math.max(0, graphWidth - graph.xForMinutes(postSunsetMinutes))}
                            height={graphHeight}
                            fill="rgba(15,23,42,0.08)"
                          />
                        ) : null}
                        {extrema.map((point, idx) => (
                          <React.Fragment key={`tide-extrema-${dayKey}-${idx}`}>
                            <Line
                              x1={point.x}
                              y1={point.y}
                              x2={point.x}
                              y2={graphHeight - 2}
                              stroke="#64748B"
                              strokeWidth={1.2}
                            />
                            {(() => {
                              const timeLabel = point.labelTime || formatHHMMToAmPm(point.point?.time);
                              const heightLabel = formatTideHeightMeters(point.labelHeight, 1);
                              const firstLineY = Math.max(10, point.y - 16);
                              const secondLineY = Math.max(20, point.y - 6);

                              return (
                                <>
                                  <SvgText
                                    x={point.x}
                                    y={firstLineY}
                                    fontSize="9"
                                    fontWeight="700"
                                    fill="#475569"
                                    textAnchor="middle"
                                  >
                                    {timeLabel}
                                  </SvgText>
                                  <SvgText
                                    x={point.x}
                                    y={secondLineY}
                                    fontSize="8"
                                    fontWeight="700"
                                    fill="#475569"
                                    textAnchor="middle"
                                  >
                                    {heightLabel}
                                  </SvgText>
                                </>
                              );
                            })()}
                          </React.Fragment>
                        ))}
                        {selected ? (
                          <>
                            <Line x1={selected.x} y1={24} x2={selected.x} y2={graphHeight - 2} stroke="#0F172A" strokeWidth={1.8} />
                            <Circle cx={selected.x} cy={selected.y} r={5} fill="#6F8FA3" />
                          </>
                        ) : null}
                      </Svg>

                      {selected ? (
                        <View
                          style={[
                            styles.tideCursorInfo,
                            {
                              left: clamp(selected.x - 44, 4, graphWidth - 92),
                            },
                          ]}
                        >
                          <Text style={styles.tideCursorTime}>
                            {!tideCursorMovedByDay[dayKey] ? 'Now' : formatHHMMToAmPm(selected?.point?.time)}
                          </Text>
                          <View style={styles.tideCursorHeightPill}>
                            <Text style={styles.tideCursorHeightText}>
                              {formatTideHeightMeters(selected?.point?.height, 2)}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.tideTimelineWrap}>
                      <Svg width={graphWidth} height={24}>
                        <Line
                          x1={graph.xForMinutes(0)}
                          y1={1}
                          x2={graph.xForMinutes(TIDE_TIMELINE_END_MINUTES)}
                          y2={1}
                          stroke="#CBD5E1"
                          strokeWidth={1}
                        />
                        {timelineTickMinutes.map((tickMinutes) => {
                          const isMajor = tickMinutes % 180 === 0 || tickMinutes >= 22 * 60;
                          return (
                            <Line
                              key={`${dayKey}-tick-${tickMinutes}`}
                              x1={graph.xForMinutes(tickMinutes)}
                              y1={1}
                              x2={graph.xForMinutes(tickMinutes)}
                              y2={isMajor ? 7 : 5}
                              stroke="#CBD5E1"
                              strokeWidth={1}
                            />
                          );
                        })}
                        {TIDE_TIMELINE_MAJOR_MARKS.map((mark) => {
                          const isBeforeSunrise = Number.isFinite(preSunriseMinutes) && mark.minutes < preSunriseMinutes;
                          const isAfterSunset = Number.isFinite(postSunsetMinutes) && mark.minutes > postSunsetMinutes;
                          const isNight = isBeforeSunrise || isAfterSunset;
                          const textColor = isNight ? '#475569' : '#64748B';
                          return (
                            <SvgText
                              key={`${dayKey}-timeline-label-${mark.minutes}`}
                              x={graph.xForMinutes(mark.minutes)}
                              y={18}
                              fontSize="10"
                              fontWeight="700"
                              fill={textColor}
                              textAnchor="middle"
                            >
                              {mark.label}
                            </SvgText>
                          );
                        })}
                      </Svg>
                    </View>

                    <View style={styles.lightColumnsRow}>
                      <View style={styles.lightColumnCard}>
                        <View style={styles.lightColumnIconWrap}>
                          <Sunrise size={16} color="#64748B" />
                        </View>
                        <View style={styles.lightColumnRows}>
                          <View style={styles.lightColumnRow}>
                            <Text style={styles.lightLabel}>First light</Text>
                            <Text style={styles.lightValue}>{sunTimes.firstLight}</Text>
                          </View>
                          <View style={styles.lightColumnRow}>
                            <Text style={styles.lightLabel}>Sunrise</Text>
                            <Text style={styles.lightValue}>{sunTimes.sunrise}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.lightColumnCard}>
                        <View style={styles.lightColumnIconWrap}>
                          <Sunset size={16} color="#64748B" />
                        </View>
                        <View style={styles.lightColumnRows}>
                          <View style={styles.lightColumnRow}>
                            <Text style={styles.lightLabel}>Last light</Text>
                            <Text style={styles.lightValue}>{sunTimes.lastLight}</Text>
                          </View>
                          <View style={styles.lightColumnRow}>
                            <Text style={styles.lightLabel}>Sunset</Text>
                            <Text style={styles.lightValue}>{sunTimes.sunset}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : null}
                  </>
                );
              })()}
            </View>
          ))
        )}

      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  atmosphereOne: {
    position: 'absolute',
    top: -140,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#0D3147',
    opacity: 0,
  },
  atmosphereTwo: {
    position: 'absolute',
    bottom: -180,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: '#0A2436',
    opacity: 0,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  actionButton: { padding: 4, minWidth: 24, alignItems: 'center' },
  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 8,
  },
  heroCard: {
    width: '100%',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCardCompact: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  ratingText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  liveTag: {
    color: '#2F5D8A',
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: '#EFF6FF',
    letterSpacing: 0.8,
  },
  waveHeightValue: {
    color: '#0F172A',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  waveHeightValueCompact: {
    fontSize: 32,
  },
  metricsRow: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },
  metricPillLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metricPillValue: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  liveHint: { color: '#64748B', fontSize: 12, marginTop: 10 },
  skeletonBlock: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  waveHeightSkeleton: {
    marginTop: 4,
    width: 118,
    height: 40,
    borderRadius: 8,
  },
  waveHeightSkeletonCompact: {
    width: 100,
    height: 34,
  },
  metricValueSkeleton: {
    width: 54,
    height: 14,
    borderRadius: 5,
  },

  // Forecast Table (Horizontal)
  sectionTitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTitleCompact: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 11,
  },
  headerTitleDefault: {
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  headerTitleLong: {
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  headerTitleVeryLong: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 0,
  },
  tableContainer: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  tableContainerNoScroll: {
    marginHorizontal: 0,
    marginBottom: 0,
    width: '100%',
  },
  tableContent: {
    paddingRight: 0,
  },
  dayHourlyCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
  },
  dayHourlySkeletonCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  dayTitleSkeleton: {
    width: 130,
    height: 14,
  },
  daySubSkeleton: {
    width: 68,
    height: 12,
  },
  dayHourlySkeletonRow: {
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hourSkeletonCell: {
    width: 32,
    height: 40,
  },
  surfSkeletonCell: {
    flex: 1,
    height: 38,
  },
  swellSkeletonCell: {
    flex: 1.3,
    height: 38,
  },
  windSkeletonCell: {
    flex: 1.5,
    height: 38,
  },
  sixteenDaySkeletonCard: {
    marginHorizontal: 0,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  dailySkeletonRow: {
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dailyLeftSkeleton: {
    width: 74,
    height: 16,
  },
  dailyMidSkeleton: {
    flex: 1,
    height: 16,
  },
  dailyRightSkeleton: {
    width: 64,
    height: 16,
  },
  dayHourlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 14,
  },
  dayHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayHeaderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayHeaderActionText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dayHourlyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dayHourlySub: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  tideSectionWrap: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  tideSectionTopBorder: {
    height: 0,
  },
  tideSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tideSectionTitle: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  tideSpotMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 24,
  },
  tideWaveCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 8,
    overflow: 'visible',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 0,
    marginTop: 6,
    marginBottom: 0,
  },
  tideCursorInfo: {
    position: 'absolute',
    top: 0,
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  tideCursorTime: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  tideCursorHeightPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0F172A',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tideCursorHeightText: {
    color: '#0F172A',
    fontSize: 8,
    fontWeight: '600',
  },
  tideTimelineWrap: {
    marginTop: -2,
    marginBottom: 10,
  },
  tideTimelineRule: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    marginHorizontal: 10,
    height: 8,
    position: 'relative',
  },
  tideTimelineTicksRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tideTimelineTick: {
    width: 1,
    backgroundColor: '#CBD5E1',
  },
  tideTimelineTickMajor: {
    height: 6,
  },
  tideTimelineTickMinor: {
    height: 4,
  },
  tideTimelineRow: {
    marginTop: 1,
    marginBottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  tideTimelineLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  tideTimelineLabelPreSun: {
    textShadowColor: 'rgba(15, 23, 42, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  lightColumnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  lightColumnCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  lightColumnIconWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightColumnRows: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 6,
  },
  lightColumnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lightLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  lightValue: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '400',
  },
  forecastTable: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E0E7',
    paddingVertical: 0,
    minHeight: 74,
    marginLeft: 12,
  },
  tableDataRowAlt: {
    backgroundColor: '#FDFEFE',
  },
  tableDataRowPlaceholder: {
    opacity: 0.68,
  },
  tableDataRowCompact: {
    minHeight: 62,
  },
  tableCell: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCellDay: {
    minWidth: 58,
  },
  tableCellMetric: {
    minWidth: 64,
  },
  hourCell: {
    flex: 0.9,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingVertical: 9,
  },
  hourMetaVerticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    width: '100%',
    paddingLeft: 2,
  },
  surfCell: {
    flex: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swellCell: {
    flex: 1.75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  windCell: {
    flex: 2.1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerHourCell: {
    backgroundColor: '#FFFFFF',
  },
  headerMainCell: {
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  tableDayText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },
  tableDateText: {
    color: '#7B92A3',
    fontSize: 9,
  },
  ratingPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
  },
  ratingPillText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },
  metricValue: {
    color: '#17212B',
    fontSize: 14,
    fontWeight: '900',
  },
  surfMetricValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  unitSmall: {
    color: '#5F6C78',
    fontSize: 10,
    fontWeight: '600',
  },
  surfUnitSmall: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },
  windSpeedCell: {
    minWidth: 70,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
  },
  windSpeedText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  windSpeedRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  windUnitStack: {
    marginLeft: 2,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  windUnit: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '700',
  },
  windGustExponent: {
    color: '#334155',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 8,
    marginBottom: -1,
  },
  hourBandCell: {
    backgroundColor: '#FFFFFF',
  },
  hourBandCellAlt: {
    backgroundColor: '#FFFFFF',
  },
  surfBandCell: {
    backgroundColor: '#FFFFFF',
  },
  surfValuePanel: {
    width: 85,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  swellBandCell: {
    backgroundColor: '#FFFFFF',
  },
  swellBandCellAlt: {
    backgroundColor: '#FFFFFF',
  },
  combinedCell: {
    alignItems: 'flex-start',
    gap: 3,
  },
  swellGridRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  swellGridCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swellGridHeaderText: {
    color: '#334155',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  swellDataValue: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '600',
  },
  swellUnitTiny: {
    color: '#5F6C78',
    fontSize: 8,
    fontWeight: '600',
  },
  swellSecondary: {
    color: '#3B4A59',
    fontSize: 11,
    fontWeight: '700',
  },
  swellDirectionDeg: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  swellSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  directionTriangle: {
    fontWeight: '900',
    lineHeight: 14,
  },
  ratingBlocksRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    marginLeft: -2,
  },
  ratingBlock: {
    width: 7,
    height: 9,
    backgroundColor: '#00A145',
  },
  ratingBlockEmpty: {
    backgroundColor: '#CBD5E1',
  },
  ratingBlockFirst: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  ratingBlockLast: {
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  windCombinedCell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 2,
  },
  windMainInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
  },
  windInlineRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  windArrowPanel: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    paddingVertical: 4,
    marginRight: 6,
  },
  windArrowPanelEven: {
    backgroundColor: '#E2E8F0',
  },
  windDirectionLine: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
  },
  windArrowLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  emptyForecastText: { color: '#64748B', fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },

  tableHourText: {
    color: '#495867',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 12,
  },
  verticalHourContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    transform: [{ rotate: '270deg' }],
    width: 30,
    height: 18,
  },
  verticalHourChar: {
    marginVertical: -2,
  },
  verticalHourText: {
    textAlign: 'center',
    lineHeight: 14,
    width: 30,
  },
  verticalHeaderText: {
    transform: [{ rotate: '90deg' }],
    width: 42,
    textAlign: 'center',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    padding: 6,
  },
  modalTitle: { color: '#0F172A', fontSize: 18, fontWeight: 'bold' },
  modalContent: { paddingHorizontal: 20, paddingVertical: 20 },

  // Info Cards
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  ratingBadgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
    minHeight: 60,
  },
  ratingBadgeLargeText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 14,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  infoLabel: {
    color: '#8E9196',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  infoValue: { color: '#0F172A', fontSize: 20, fontWeight: 'bold' },
  infoSmall: { color: '#8E9196', fontSize: 11, marginTop: 4 },

  swellDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },

  conditionsRow: { flexDirection: 'row', gap: 12 },

  // Tide Graph
  tideGraph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginVertical: 16,
    position: 'relative',
  },
  tideBar: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 2,
    minHeight: 2,
  },
  tideIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 20,
    alignItems: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D15D',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  tideInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  tideTimeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  timeLabelSmall: { color: '#484F58', fontSize: 10, fontWeight: 'bold' },

  // Direction Views
  directionView: {
    alignItems: 'center',
    gap: 8,
    overflow: 'visible',
  },
  windDirectionView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'visible',
  },
  directionArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
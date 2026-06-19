import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

interface GeoResult {
  lat: number;
  lng: number;
}

interface SolarPotential {
  maxArrayPanelsCount: number;
  maxArrayAreaMeters2: number;
  maxSunshineHoursPerYear: number;
  carbonOffsetFactorKgPerMwh: number;
  panelCapacityWatts: number;
  panelHeightMeters: number;
  panelWidthMeters: number;
  panelLifetimeYears: number;
  solarPanelConfigs: Array<{
    panelsCount: number;
    yearlyEnergyDcKwh: number;
    roofSegmentSummaries: Array<{ pitchDegrees: number; azimuthDegrees: number; panelsCount: number; yearlyEnergyDcKwh: number; segmentIndex: number }>;
  }>;
}

interface BuildingInsights {
  solarPotential: SolarPotential;
}

async function geocode(address: string): Promise<GeoResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ', Tamil Nadu, India')}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  const data = (await res.json()) as { status: string; results: Array<{ geometry: { location: { lat: number; lng: number } } }> };
  if (data.status !== 'OK' || !data.results[0]) return null;
  return data.results[0].geometry.location;
}

async function getSolarInsights(lat: number, lng: number): Promise<BuildingInsights | null> {
  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=LOW&key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<BuildingInsights>;
}

function calcProposal(monthlyBillInr: number, insights: BuildingInsights | null) {
  const avgTariffPerUnit = 7.5;
  const unitsPerMonth = monthlyBillInr / avgTariffPerUnit;
  const unitsPerYear = unitsPerMonth * 12;
  const systemKw = Math.ceil(unitsPerYear / 1500);
  const clampedKw = Math.max(1, Math.min(systemKw, 500));

  const maxPanels = insights?.solarPotential.maxArrayPanelsCount ?? 0;
  const sunshineHours = insights?.solarPotential.maxSunshineHoursPerYear ?? 1600;
  const maxKw = maxPanels > 0 ? (maxPanels * 0.54) : clampedKw * 1.5;
  const feasibleKw = Math.min(clampedKw, maxKw);

  const ratePerKw = 55_000;
  const totalCostInr = feasibleKw * ratePerKw;
  const subsidyInr = feasibleKw <= 3 ? 78_000 : feasibleKw <= 10 ? 78_000 + (feasibleKw - 3) * 9_000 : 78_000 + 7 * 9_000;
  const netPayable = Math.max(0, totalCostInr - subsidyInr);
  const annualSavingsInr = unitsPerYear * avgTariffPerUnit;
  const paybackYears = netPayable > 0 ? (netPayable / annualSavingsInr) : 0;
  const roi25yr = annualSavingsInr * 25;
  const emiMonthly = netPayable > 0 ? Math.round((netPayable * 0.10) / 12) : 0;
  const annualGenerationKwh = Math.round(feasibleKw * (sunshineHours / 24) * 5);

  return {
    systemKw: parseFloat(feasibleKw.toFixed(1)),
    totalCostInr: Math.round(totalCostInr),
    subsidyInr: Math.round(subsidyInr),
    netPayable: Math.round(netPayable),
    annualSavingsInr: Math.round(annualSavingsInr),
    paybackYears: parseFloat(paybackYears.toFixed(1)),
    roi25yr: Math.round(roi25yr),
    emiMonthly,
    annualGenerationKwh,
    maxSunshineHoursPerYear: Math.round(sunshineHours),
    maxPanels: maxPanels || Math.ceil(clampedKw / 0.54),
    carbonOffsetKgPerYear: Math.round(annualGenerationKwh * 0.82),
  };
}

export async function GET(req: NextRequest) {
  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const city = searchParams.get('city') ?? '';
  const monthlyBillStr = searchParams.get('monthlyBill') ?? '2000';
  const monthlyBill = Math.max(500, parseInt(monthlyBillStr, 10) || 2000);

  if (!city.trim()) {
    return NextResponse.json({ error: 'city is required' }, { status: 400 });
  }

  const geo = await geocode(city);
  const insights = geo ? await getSolarInsights(geo.lat, geo.lng) : null;
  const proposal = calcProposal(monthlyBill, insights);

  return NextResponse.json({
    city,
    coordinates: geo,
    solarInsights: insights
      ? {
          maxArrayPanels: insights.solarPotential.maxArrayPanelsCount,
          maxAreaM2: Math.round(insights.solarPotential.maxArrayAreaMeters2),
          sunshineHoursPerYear: Math.round(insights.solarPotential.maxSunshineHoursPerYear),
        }
      : null,
    proposal,
  });
}

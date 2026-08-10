import { describe, expect, it } from 'vitest';
import {
  dailyCapacityFor,
  FORECAST_DAYS,
  forecastLoad,
  HALT_RATIO,
  newItemAllowance,
  THROTTLE_RATIO,
  type ForecastDay,
} from './forecast.ts';

const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);
const DAY = 86_400_000;

describe('forecastLoad', () => {
  it('buckets cards by the day they come due', () => {
    const forecast = forecastLoad(
      [{ dueAt: NOW + DAY }, { dueAt: NOW + DAY }, { dueAt: NOW + 3 * DAY }],
      NOW,
    );
    expect(forecast[1]?.dueCount).toBe(2);
    expect(forecast[3]?.dueCount).toBe(1);
    expect(forecast[2]?.dueCount).toBe(0);
  });

  it('puts overdue cards on today rather than hiding them', () => {
    // Debt you already owe is work waiting now.
    const forecast = forecastLoad([{ dueAt: NOW - 10 * DAY }, { dueAt: NOW - DAY }], NOW);
    expect(forecast[0]?.dueCount).toBe(2);
  });

  it('covers the fourteen days SPEC §9 asks for', () => {
    expect(forecastLoad([], NOW)).toHaveLength(FORECAST_DAYS);
  });

  it('ignores cards beyond the horizon', () => {
    const forecast = forecastLoad([{ dueAt: NOW + 400 * DAY }], NOW);
    expect(forecast.reduce((sum, day) => sum + day.dueCount, 0)).toBe(0);
  });

  it('returns an empty forecast for a learner with no cards', () => {
    expect(forecastLoad([], NOW).every((day) => day.dueCount === 0)).toBe(true);
  });
});

describe('newItemAllowance (SPEC §7.2)', () => {
  /** A forecast with `perDay` reviews due every day. */
  const flat = (perDay: number): ForecastDay[] =>
    Array.from({ length: FORECAST_DAYS }, (_, dayOffset) => ({ dayOffset, dueCount: perDay }));

  it('leaves the allowance alone when the learner is keeping up', () => {
    const result = newItemAllowance({ forecast: flat(10), dailyCapacity: 20, baseNewItems: 8 });
    expect(result).toMatchObject({ allowed: 8, throttled: false });
    expect(result.debtRatio).toBeCloseTo(0.5);
  });

  it('still leaves it alone right up to the threshold', () => {
    const result = newItemAllowance({
      forecast: flat(THROTTLE_RATIO * 20),
      dailyCapacity: 20,
      baseNewItems: 8,
    });
    expect(result.throttled).toBe(false);
    expect(result.allowed).toBe(8);
  });

  it('throttles once sustained load passes 1.5x capacity', () => {
    const result = newItemAllowance({ forecast: flat(40), dailyCapacity: 20, baseNewItems: 8 });
    expect(result.throttled).toBe(true);
    expect(result.allowed).toBeLessThan(8);
    expect(result.allowed).toBeGreaterThan(0);
  });

  it('stops new items entirely when the backlog is overwhelming', () => {
    const result = newItemAllowance({
      forecast: flat(HALT_RATIO * 20),
      dailyCapacity: 20,
      baseNewItems: 8,
    });
    expect(result.allowed).toBe(0);
  });

  it('tapers rather than falling off a cliff', () => {
    const at = (perDay: number) =>
      newItemAllowance({ forecast: flat(perDay), dailyCapacity: 20, baseNewItems: 20 }).allowed;
    // Monotone decreasing across the throttled range.
    const points = [30, 36, 42, 48, 54, 60].map(at);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!).toBeLessThanOrEqual(points[i - 1]!);
    }
    expect(points.at(-1)).toBe(0);
  });

  it('measures sustained load, so a moderately busy day does not throttle', () => {
    // FSRS clusters due dates; one heavier Thursday is normal and must not stop
    // a learner adding words all week.
    const spike = (peak: number): ForecastDay[] =>
      Array.from({ length: FORECAST_DAYS }, (_, dayOffset) => ({
        dueCount: dayOffset === 3 ? peak : 2,
        dayOffset,
      }));

    expect(
      newItemAllowance({ forecast: spike(60), dailyCapacity: 20, baseNewItems: 8 }).throttled,
    ).toBe(false);

    // But a spike big enough to swamp the whole week is real debt, and the
    // learner should stop adding to it.
    expect(
      newItemAllowance({ forecast: spike(300), dailyCapacity: 20, baseNewItems: 8 }).throttled,
    ).toBe(true);
  });

  it('refuses to introduce anything when there is no capacity at all', () => {
    expect(
      newItemAllowance({ forecast: flat(0), dailyCapacity: 0, baseNewItems: 8 }).allowed,
    ).toBe(0);
  });

  it('gives a brand-new learner their full allowance', () => {
    expect(
      newItemAllowance({ forecast: flat(0), dailyCapacity: 20, baseNewItems: 8 }),
    ).toMatchObject({ allowed: 8, throttled: false, debtRatio: 0 });
  });
});

describe('dailyCapacityFor', () => {
  it('scales with the learner-chosen session length', () => {
    expect(dailyCapacityFor(4)).toBeLessThan(dailyCapacityFor(8));
    expect(dailyCapacityFor(8)).toBeLessThan(dailyCapacityFor(15));
  });

  it('never reports zero capacity, which would halt everything', () => {
    expect(dailyCapacityFor(0)).toBeGreaterThan(0);
  });
});

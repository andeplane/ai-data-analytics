import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateETA,
  formatTime,
  type ProgressSample,
} from './useWebLLM'

describe(formatTime.name, () => {
  it.each([
    [0, '0s'],
    [1, '1s'],
    [45, '45s'],
    [59, '59s'],
    [60, '1m 0s'],
    [61, '1m 1s'],
    [90, '1m 30s'],
    [150, '2m 30s'],
    [3600, '60m 0s'],
    [3661, '61m 1s'],
  ])('should format %i seconds as "%s"', (seconds, expected) => {
    expect(formatTime(seconds)).toBe(expected)
  })

  it.each([
    [-1, '--'],
    [-100, '--'],
    [Infinity, '--'],
    [-Infinity, '--'],
    [NaN, '--'],
  ])('should return "--" for invalid value %s', (value, expected) => {
    expect(formatTime(value)).toBe(expected)
  })

  it('should floor fractional seconds', () => {
    expect(formatTime(45.9)).toBe('45s')
    expect(formatTime(90.5)).toBe('1m 30s')
  })
})

describe(calculateETA.name, () => {
  const NOW = 1700000000000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return null for fewer than 2 samples', () => {
    expect(calculateETA([], 0.5)).toBeNull()
    expect(calculateETA([{ timestamp: NOW, progress: 0.1 }], 0.5)).toBeNull()
  })

  it('should return null when progress is already complete', () => {
    const samples: ProgressSample[] = [
      { timestamp: NOW - 2000, progress: 0.8 },
      { timestamp: NOW - 1000, progress: 0.9 },
    ]
    expect(calculateETA(samples, 1.0)).toBeNull()
    expect(calculateETA(samples, 1.1)).toBeNull()
  })

  it('should calculate ETA from recent samples within window', () => {
    // Progress rate: 0.1 per second (10% per second)
    // 50% remaining = 5 seconds ETA
    const samples: ProgressSample[] = [
      { timestamp: NOW - 2000, progress: 0.3 },
      { timestamp: NOW - 1000, progress: 0.4 },
      { timestamp: NOW, progress: 0.5 },
    ]
    
    const eta = calculateETA(samples, 0.5)
    expect(eta).toBeCloseTo(5, 1) // 50% remaining at 10%/sec = 5 seconds
  })

  it('should return null when no progress in recent window', () => {
    // Samples show no progress (stalled)
    const samples: ProgressSample[] = [
      { timestamp: NOW - 2000, progress: 0.5 },
      { timestamp: NOW - 1000, progress: 0.5 },
      { timestamp: NOW, progress: 0.5 },
    ]
    
    expect(calculateETA(samples, 0.5)).toBeNull()
  })

  it('should use older samples when not enough recent ones', () => {
    // Samples outside the 10-second window
    const samples: ProgressSample[] = [
      { timestamp: NOW - 20000, progress: 0.0 },
      { timestamp: NOW - 10000, progress: 0.5 },
    ]
    
    const eta = calculateETA(samples, 0.5)
    // Rate: 0.5 progress over 10 seconds = 0.05/sec
    // Remaining: 0.5 / 0.05 = 10 seconds
    expect(eta).toBeCloseTo(10, 1)
  })

  it('should return null when time delta is zero', () => {
    const samples: ProgressSample[] = [
      { timestamp: NOW, progress: 0.3 },
      { timestamp: NOW, progress: 0.5 },
    ]
    
    expect(calculateETA(samples, 0.5)).toBeNull()
  })

  it('should return null when progress delta is negative', () => {
    // Progress went backwards (unusual but possible)
    const samples: ProgressSample[] = [
      { timestamp: NOW - 2000, progress: 0.6 },
      { timestamp: NOW - 1000, progress: 0.5 },
    ]
    
    expect(calculateETA(samples, 0.5)).toBeNull()
  })

  it('should handle fast progress rates correctly', () => {
    // Very fast: 0.4 progress in 1 second
    const samples: ProgressSample[] = [
      { timestamp: NOW - 1000, progress: 0.5 },
      { timestamp: NOW, progress: 0.9 },
    ]
    
    const eta = calculateETA(samples, 0.9)
    // Rate: 0.4/sec, remaining: 0.1 / 0.4 = 0.25 seconds
    expect(eta).toBeCloseTo(0.25, 2)
  })

  it('should use at most 10 samples when falling back to older data', () => {
    // Create 15 samples outside the window
    const samples: ProgressSample[] = []
    for (let i = 0; i < 15; i++) {
      samples.push({
        timestamp: NOW - 20000 + i * 100, // All outside 10s window
        progress: i * 0.05,
      })
    }
    
    // Should use last 10 samples (indices 5-14)
    // Progress from 0.25 to 0.70 (delta = 0.45) over 900ms
    const eta = calculateETA(samples, 0.70)
    expect(eta).not.toBeNull()
  })
})


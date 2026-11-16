import { inr, qty, phoneLabel, firstName, nextDays, dateLabel } from '../src/utils/format';
import { distanceKm } from '../src/utils/location';

jest.mock('@react-native-community/geolocation', () => ({ getCurrentPosition: jest.fn() }));

describe('format', () => {
  it('formats rupees with Indian grouping', () => {
    expect(inr(124500)).toBe('₹1,24,500');
    expect(inr(5683.6, true)).toBe('₹5,683.60');
    expect(inr(1800, true)).toBe('₹1,800');
  });
  it('formats quantities', () => {
    expect(qty(12.46)).toBe('12.5 kg');
    expect(qty(1, 'pc')).toBe('1 pc');
    expect(qty(3, 'pc')).toBe('3 pcs');
  });
  it('formats phone numbers and names', () => {
    expect(phoneLabel('9876543210')).toBe('98765 43210');
    expect(phoneLabel('+91 98765-43210')).toBe('98765 43210');
    expect(firstName('Harpreet Singh')).toBe('Harpreet');
  });
  it('builds the next 7 pickup days starting today', () => {
    const d = nextDays(7);
    expect(d).toHaveLength(7);
    expect(d[0].label).toBe('Today');
    expect(d[1].label).toBe('Tomorrow');
  });
  it('labels dates', () => {
    expect(dateLabel(new Date(new Date().getFullYear(), 10, 12))).toBe('12 Nov');
    expect(dateLabel(new Date(2020, 0, 5))).toBe('5 Jan 2020');
  });
  it('measures distance', () => {
    expect(distanceKm({ lat: 28.5108, lng: 77.0705 }, { lat: 28.5273, lng: 77.0597 })).toBeCloseTo(2.1, 0);
  });
});

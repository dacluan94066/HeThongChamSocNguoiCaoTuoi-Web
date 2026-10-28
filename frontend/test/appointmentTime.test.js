import test from 'node:test';
import assert from 'node:assert/strict';
import { isFutureAppointment } from '../src/utils/appointmentTime.js';
test('Vietnam full appointment instant rejects past/current minute but allows tomorrow early time', () => {
  const now = new Date('2026-10-28T08:00:00Z');
  assert.equal(isFutureAppointment('2026-10-28', '08:00', now), false);
  assert.equal(isFutureAppointment('2026-10-28', '15:00', now), false);
  assert.equal(isFutureAppointment('2026-10-28', '15:01', now), true);
  assert.equal(isFutureAppointment('2026-10-29', '08:00', now), true);
});
test('midnight and invalid calendar values never depend on the browser timezone', () => {
  const now = new Date('2026-10-28T16:59:59Z');
  assert.equal(isFutureAppointment('2026-10-28', '23:59', now), false);
  assert.equal(isFutureAppointment('2026-10-29', '00:00', now), true);
  assert.equal(isFutureAppointment('2026-02-30', '08:00', now), false);
  assert.equal(isFutureAppointment('2026-10-29', '24:00', now), false);
});

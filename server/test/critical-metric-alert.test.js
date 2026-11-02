const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateMetric, checkCriticalMetric } = require('../src/utils/metricAssessment');

test('Critical metric detection: classifies emergency physiological values as KhanCap', () => {
  // Blood pressure hypertensive crisis (>= 180 or diastolic >= 120)
  const bpHigh = evaluateMetric({
    tenChiSo: 'Huyết áp',
    giaTri: 195,
    giaTriPhu: 110,
    min: 90,
    max: 140,
    min2: 60,
    max2: 90,
  });
  assert.equal(bpHigh.abnormal, true);
  assert.equal(bpHigh.level, 'KhanCap');
  assert.match(bpHigh.description, /\[CẤP CỨU NGUY KỊCH\]/);

  // Blood pressure severe hypotension (systolic <= 70)
  const bpLow = evaluateMetric({
    tenChiSo: 'Huyết áp',
    giaTri: 65,
    giaTriPhu: 40,
    min: 90,
    max: 140,
    min2: 60,
    max2: 90,
  });
  assert.equal(bpLow.abnormal, true);
  assert.equal(bpLow.level, 'KhanCap');

  // SpO2 severe hypoxia (< 90%)
  const spo2Low = evaluateMetric({
    tenChiSo: 'SpO2',
    giaTri: 84,
    min: 95,
    max: 100,
  });
  assert.equal(spo2Low.abnormal, true);
  assert.equal(spo2Low.level, 'KhanCap');

  // Severe hypoglycemia (< 50 mg/dL)
  const glucoseLow = evaluateMetric({
    tenChiSo: 'Đường huyết',
    giaTri: 42,
    min: 70,
    max: 130,
  });
  assert.equal(glucoseLow.abnormal, true);
  assert.equal(glucoseLow.level, 'KhanCap');

  // Severe hyperglycemia (> 350 mg/dL)
  const glucoseHigh = evaluateMetric({
    tenChiSo: 'Đường huyết',
    giaTri: 410,
    min: 70,
    max: 130,
  });
  assert.equal(glucoseHigh.abnormal, true);
  assert.equal(glucoseHigh.level, 'KhanCap');

  // Severe tachycardia (> 160 bpm)
  const hrHigh = evaluateMetric({
    tenChiSo: 'Nhịp tim',
    giaTri: 175,
    min: 60,
    max: 100,
  });
  assert.equal(hrHigh.abnormal, true);
  assert.equal(hrHigh.level, 'KhanCap');

  // Severe bradycardia (< 40 bpm)
  const hrLow = evaluateMetric({
    tenChiSo: 'Nhịp tim',
    giaTri: 36,
    min: 60,
    max: 100,
  });
  assert.equal(hrLow.abnormal, true);
  assert.equal(hrLow.level, 'KhanCap');

  // Extreme fever (>= 39.5 C)
  const tempHigh = evaluateMetric({
    tenChiSo: 'Nhiệt độ cơ thể',
    giaTri: 40.2,
    min: 36.5,
    max: 37.5,
  });
  assert.equal(tempHigh.abnormal, true);
  assert.equal(tempHigh.level, 'KhanCap');
});

test('Non-critical abnormal metrics: retain Cao and TrungBinh levels', () => {
  // Moderate-to-high blood pressure elevation (172/100 -> > 140 * 1.2 is Cao)
  const bpHigh = evaluateMetric({
    tenChiSo: 'Huyết áp',
    giaTri: 172,
    giaTriPhu: 100,
    min: 90,
    max: 140,
    min2: 60,
    max2: 90,
  });
  assert.equal(bpHigh.abnormal, true);
  assert.equal(bpHigh.level, 'Cao');
  assert.doesNotMatch(bpHigh.description, /\[CẤP CỨU NGUY KỊCH\]/);

  // Mild heart rate elevation (e.g. 105 bpm)
  const hrMild = evaluateMetric({
    tenChiSo: 'Nhịp tim',
    giaTri: 105,
    min: 60,
    max: 100,
  });
  assert.equal(hrMild.abnormal, true);
  assert.equal(hrMild.level, 'TrungBinh');

  // Normal heart rate
  const hrNormal = evaluateMetric({
    tenChiSo: 'Nhịp tim',
    giaTri: 75,
    min: 60,
    max: 100,
  });
  assert.equal(hrNormal.abnormal, false);
  assert.equal(hrNormal.level, null);
});

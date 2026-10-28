import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider, Form } from 'antd';
import dayjs from 'dayjs';
import { AuthProvider } from '../../src/context/AuthContext';
import ElderlyProfilesPage from '../../src/pages/ElderlyProfiles/ElderlyProfilesPage';
import { ElderlyPersonalFields, ElderlyHealthFields } from '../../src/components/ElderlyProfileFields';
import 'antd/dist/reset.css';
import '../../src/index.css';
import '../../src/styles/tokens.css';

const errors = [];
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const visibleDialog = () => [...document.querySelectorAll('[role=dialog]')].find(el => el.checkVisibility());
async function wait(predicate) {
  for (let i = 0; i < 160; i++) { if (predicate()) return; await delay(40); }
  throw new Error('UI timeout');
}
const field = name => visibleDialog().querySelector(`[id="${name}"]`);
const expect = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const selectedLabel = name => field(name).closest('.ant-form-item').textContent;
const enter = (name, value) => {
  const input = field(name);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
async function open(id) {
  const edit = () => document.querySelector(`[data-row-key="${id}"] .action-edit`);
  await wait(edit); edit().click(); await wait(visibleDialog); await delay(80);
}
async function cancel() {
  visibleDialog().querySelector('.modal-cancel-button').click();
  await wait(() => !visibleDialog());
}
function checkA(name = 'NCT fixture A') {
  expect(field('hoTen').value, name, 'Name');
  expect(field('ngaySinh').value, '28/05/1950', 'Existing birth date');
  expect(selectedLabel('gioiTinh').includes('Nam'), true, 'Existing gender');
  expect(field('cccd').value, '000000000001', 'Existing CCCD');
  expect(field('soDienThoai').value, '0000000001', 'Existing contact phone');
  expect(field('diaChi').value, 'Địa chỉ fixture A', 'Existing address');
  expect(selectedLabel('nhomMau').includes('O+'), true, 'Existing blood group');
  expect(field('benhNen').value, 'Bệnh nền fixture A', 'Existing conditions');
  expect(field('diUng').value, 'Dị ứng fixture A', 'Existing allergies');
}

// The shared fields are also used by conditional account-creation forms.
// Their default must still discard profile-only fields when those controls disappear.
export function ConditionalCreationProbe() {
  const [show, setShow] = useState(false);
  const [form] = Form.useForm();
  return <div hidden><button id="probe-show" onClick={() => setShow(value => !value)}>Toggle</button>
    <button id="probe-fill" onClick={() => form.setFieldsValue({ ngaySinh: dayjs('1950-05-28'), gioiTinh: 'Nam', cccd: '000000000001', diaChi: 'Fixture', nhomMau: 'O+', benhNen: 'Fixture', diUng: 'Fixture' })}>Fill</button>
    <button id="probe-read" onClick={() => { window.creationValues = form.getFieldsValue(true); }}>Read</button>
    <Form form={form}>{show && <><ElderlyPersonalFields /><ElderlyHealthFields /></>}</Form>
  </div>;
}

async function run() {
  await open(201); checkA();
  enter('diaChi', 'Bản nháp chưa lưu'); await delay(40);
  await cancel(); await open(201); checkA(); await cancel();
  await open(202);
  expect(field('hoTen').value, 'NCT fixture B', 'Selected profile B');
  expect(field('ngaySinh').value, '29/06/1955', 'Profile B birth date');
  expect(selectedLabel('gioiTinh').includes('Nữ'), true, 'Profile B gender');
  for (const name of ['cccd', 'soDienThoai', 'diaChi', 'benhNen', 'diUng']) expect(field(name).value, '', `B has no stale ${name}`);
  expect(selectedLabel('nhomMau').includes('O+'), false, 'B has no stale blood group');
  visibleDialog().querySelector('.modal-save-button').click(); await wait(() => !visibleDialog());
  await open(201); checkA();
  enter('hoTen', 'NCT fixture A cập nhật'); await delay(40);
  visibleDialog().querySelector('.modal-save-button').click();
  await wait(() => document.querySelector('.ant-message-error')?.textContent.includes('Không thể lưu hồ sơ fixture'));
  checkA('NCT fixture A cập nhật');
  const state = (await (await fetch('/__state')).json()).data;
  expect(state.writes.length, 2, 'Failed save must not retry itself');
  visibleDialog().querySelector('.modal-save-button').click(); await wait(() => !visibleDialog());
  await open(201); checkA('NCT fixture A cập nhật'); await cancel();
  document.querySelector('#probe-show').click(); await delay(80);
  document.querySelector('#probe-fill').click(); await delay(40);
  document.querySelector('#probe-show').click(); await delay(80);
  document.querySelector('#probe-read').click();
  for (const name of ['ngaySinh', 'gioiTinh', 'cccd', 'diaChi', 'nhomMau', 'benhNen', 'diUng']) {
    expect(window.creationValues[name], undefined, `Hidden creation field ${name} must still clear`);
  }
  expect(errors.length, 0, 'Unhandled errors');
  return { pass: true, errors };
}

createRoot(document.getElementById('root')).render(<StrictMode><ConfigProvider theme={{ token: { motion: false } }}>
  <AuthProvider><MemoryRouter initialEntries={['/ho-so-nguoi-cao-tuoi']}><ElderlyProfilesPage /></MemoryRouter></AuthProvider>
  <ConditionalCreationProbe />
</ConfigProvider></StrictMode>);
run().then(report => fetch('/__result', { method: 'POST', body: JSON.stringify(report) }))
  .catch(error => fetch('/__result', { method: 'POST', body: JSON.stringify({ error: error.message }) }));

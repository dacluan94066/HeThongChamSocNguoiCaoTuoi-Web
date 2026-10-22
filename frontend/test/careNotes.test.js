import test from 'node:test';
import assert from 'node:assert/strict';
import { CARE_NOTE_TYPES, buildCareNotePayload, buildCareNoteQuery, careNoteError, careNoteMoment,
  groupCareNotesByDay, isCareNoteConflict, isValidCareTime, vietnamNowWall } from '../src/utils/careNotes.js';
test('care diary retains exactly the four existing categories', () => {
  assert.deepEqual(Object.keys(CARE_NOTE_TYPES), ['CHAM_SOC_HANG_NGAY', 'SU_CO', 'VAT_LY_TRI_LIEU', 'CANH_BAO']);
});
test('Vietnam wall clock is independent of browser timezone and handles midnight', () => {
  assert.equal(vietnamNowWall(new Date('2026-10-22T17:00:00Z')), '2026-10-23T00:00:00');
  assert.equal(vietnamNowWall(new Date('2026-10-22T16:59:00Z')), '2026-10-22T23:59:00');
});
test('all filters, including range/type/search, survive a refresh query', () => {
  assert.deepEqual(buildCareNoteQuery({ elderlyId:4, from:'2026-10-20', to:'2026-10-23', type:'SU_CO', search:'  bữa sáng  ' }),
    { nguoiCaoTuoiId:4, tuNgay:'2026-10-20', denNgay:'2026-10-23', loaiNhatKy:'SU_CO', search:'bữa sáng' });
  assert.deepEqual(buildCareNoteQuery({ elderlyId:null, type:'', search:'  ' }), {});
});
test('grouping sorts by actual care date/time without modifying API rows', () => {
  const rows=[{id:1,thoiGianChamSoc:'2026-10-22T20:00:00'},{id:3,thoiGianChamSoc:'2026-10-23T08:00:00'},
    {id:2,ngay:'2026-10-22',thoiGian:'21:30'},{id:4}];
  const before=JSON.stringify(rows), groups=groupCareNotesByDay(rows);
  assert.deepEqual(groups.map(g=>g.day),['2026-10-23','2026-10-22','unknown']);
  assert.deepEqual(groups[1].entries.map(n=>n.id),[2,1]); assert.equal(JSON.stringify(rows),before);
  assert.equal(careNoteMoment(rows[2]),'2026-10-22T21:30:00');
});
test('create whitelist never sends client identity, status, create time or clinical mutations', () => {
  assert.deepEqual(buildCareNotePayload({nguoiCaoTuoiId:4,tieuDe:' Hoạt động ',noiDung:' Nội dung ',loaiNhatKy:'CHAM_SOC_HANG_NGAY',
    thoiGianChamSoc:'2026-10-22T08:10:49',nguoiChamSocId:999,nguoiChamSocTen:'FAKE',ngayTao:'FAKE',trangThai:'HOAN_THANH',medicationId:9}),
  {nguoiCaoTuoiId:4,tieuDe:'Hoạt động',noiDung:'Nội dung',loaiNhatKy:'CHAM_SOC_HANG_NGAY',thoiGianChamSoc:'2026-10-22T08:10:49+07:00'});
});
test('editing uses loaded version and cannot move a note to another elderly or author', () => {
  const p=buildCareNotePayload({nguoiCaoTuoiId:999,tieuDe:' T ',noiDung:' N ',loaiNhatKy:'SU_CO',thoiGianChamSoc:'2026-10-22T08:10:00',lyDo:' Bổ sung chi tiết ',version:'FAKE'}, {version:'REAL'});
  assert.equal(p.version,'REAL');assert.equal(p.lyDo,'Bổ sung chi tiết');assert.equal('nguoiCaoTuoiId' in p,false);assert.equal('nguoiChamSocId' in p,false);
});
test('care timestamp rejects future times and normalized invalid dates', () => {
  const now='2026-10-23T08:00:00';assert.equal(isValidCareTime('2026-10-22T08:00:00',now),true);assert.equal(isValidCareTime('2026-10-23T08:00',now),true);
  for(const v of ['2026-10-23T08:00:01','2026-02-30T08:00:00','2026-10-22T24:00:00','bad',null])assert.equal(isValidCareTime(v,now),false,String(v));
});
test('backend 503 message retained; 409 detected without pretending success', () => {
  const e={response:{status:503,data:{message:'Cần chạy patch nhật ký'}}};assert.equal(careNoteError(e),'Cần chạy patch nhật ký');
  assert.equal(isCareNoteConflict(e),false);assert.equal(isCareNoteConflict({response:{status:409}}),true);assert.equal(careNoteError({},'Không thể kết nối'),'Không thể kết nối');
});

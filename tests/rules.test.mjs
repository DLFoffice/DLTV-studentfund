/* ============================================================
   ทดสอบ Security Rules v7 ด้วย Firebase Emulator (ไม่แตะฐานข้อมูลจริง)
   วิธีรัน:  cd tests && npm install && npm test
   (ต้องมี Java 11+ สำหรับ emulator)
   ============================================================ */
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, deleteField,
} from 'firebase/firestore';

let env;
const STU_A = { no: 1, id: '1111111111111', name: 'ด.ช.เอ ทดสอบ', nickname: 'เอ',
  semPayments: [{ term: '1/2568', p1: 1000, p2: 500 }], bank: { accNoSt: '123' }, form1: {} };
const STU_B = { no: 2, id: '2222222222222', name: 'ด.ญ.บี ทดสอบ', nickname: 'บี', form1: {} };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dltv',
    firestore: { rules: readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/admin@test.com'), { role: 'admin' });
    await setDoc(doc(db, 'students/A'), STU_A);
    await setDoc(doc(db, 'students/B'), STU_B);
    await setDoc(doc(db, 'accounts/uidA'), { role: 'student', no: 1, name: STU_A.name,
      username: 'dltv001', email: 'dltv001@x', studentId: 'A',
      mustChangePassword: true, initialPassword: 'Dltv1234' });
    await setDoc(doc(db, 'accounts/uidStaff'), { role: 'staff', name: 'ครู' });
  });
});

const student = () => env.authenticatedContext('uidA', { email: 'dltv001@x' }).firestore();
const staff   = () => env.authenticatedContext('uidStaff', { email: 'staff@x' }).firestore();
const admin   = () => env.authenticatedContext('uidAdmin', { email: 'admin@test.com' }).firestore();
const nobody  = () => env.authenticatedContext('uidRandom', { email: 'random@x' }).firestore();
const anon    = () => env.unauthenticatedContext().firestore();

/* ---------- students ---------- */
test('นักเรียนอ่านเอกสารตัวเองได้', () => assertSucceeds(getDoc(doc(student(), 'students/A'))));
test('นักเรียนอ่านเอกสารคนอื่นไม่ได้', () => assertFails(getDoc(doc(student(), 'students/B'))));
test('ผู้ใช้ที่ล็อกอินแต่ไม่มีบทบาท อ่านข้อมูลนักเรียนไม่ได้', () => assertFails(getDoc(doc(nobody(), 'students/A'))));
test('คนไม่ล็อกอิน อ่านข้อมูลนักเรียนไม่ได้', () => assertFails(getDoc(doc(anon(), 'students/A'))));

test('นักเรียนแก้แบบฟอร์มของตัวเองได้', () =>
  assertSucceeds(setDoc(doc(student(), 'students/A'), { form1: { q1: 'ตอบ' } }, { merge: true })));
test('นักเรียนแก้ผล SDQ ของตัวเองได้', () =>
  assertSucceeds(setDoc(doc(student(), 'students/A'), { sdq: { '1/2568': { q1: 1 } } }, { merge: true })));
test('นักเรียนแก้ประวัติเบิกจ่ายไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'students/A'), { semPayments: [{ term: '1/2568', p1: 999999 }] })));
test('นักเรียนแก้เลขบัญชีไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'students/A'), { 'bank.accNoSt': '999' })));
test('นักเรียนแก้ชื่อเล่น (ช่องทาง XSS เดิม) ไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'students/A'), { nickname: '<img src=x onerror=alert(1)>' })));
test('นักเรียนเพิ่มฟิลด์ใหม่เองไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'students/A'), { photoUrl: 'javascript:alert(1)' })));
test('นักเรียนแก้แบบฟอร์มของคนอื่นไม่ได้', () =>
  assertFails(setDoc(doc(student(), 'students/B'), { form1: { q1: 'x' } }, { merge: true })));
test('ครูแก้ข้อมูลนักเรียนได้ทุกฟิลด์', () =>
  assertSucceeds(updateDoc(doc(staff(), 'students/A'), { semPayments: [], nickname: 'เอ๊' })));

/* ---------- accounts ---------- */
test('นักเรียนเลื่อนขั้นตัวเองเป็นครูไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'accounts/uidA'), { role: 'staff' })));
test('นักเรียนปิดบังคับเปลี่ยนรหัส + ลบรหัสเริ่มต้นได้', () =>
  assertSucceeds(setDoc(doc(student(), 'accounts/uidA'),
    { mustChangePassword: false, passwordChangedAt: serverTimestamp(), initialPassword: deleteField() },
    { merge: true })));
test('นักเรียนเปลี่ยนค่า initialPassword เป็นค่าใหม่ไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'accounts/uidA'), { initialPassword: 'hacked' })));
test('นักเรียนเพิ่มฟิลด์อื่นในบัญชีไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'accounts/uidA'), { isAdmin: true })));
test('นักเรียนผูก studentId กับเอกสารที่ลำดับไม่ตรงไม่ได้', () =>
  assertFails(updateDoc(doc(student(), 'accounts/uidA'), { studentId: 'B' })));

/* ---------- loginLogs ---------- */
test('บันทึก log ของตัวเองได้', () =>
  assertSucceeds(addDoc(collection(student(), 'loginLogs'),
    { uid: 'uidA', email: 'dltv001@x', username: 'dltv001', name: 'เอ', at: serverTimestamp(), ua: 'test' })));
test('ปลอม log เป็นคนอื่นไม่ได้', () =>
  assertFails(addDoc(collection(student(), 'loginLogs'),
    { uid: 'uidStaff', email: 'staff@x', at: serverTimestamp() })));

/* ---------- roster ---------- */
test('ครูเขียน roster ที่มีชื่อจริงไม่ได้', () =>
  assertFails(setDoc(doc(staff(), 'roster/no-1'), { no: 1, name: STU_A.name })));
test('ครูเขียน roster แบบแฮชได้', () =>
  assertSucceeds(setDoc(doc(staff(), 'roster/no-1'), { no: 1, nameHash: 'abc', surnameHash: 'def' })));
test('คนนอกอ่าน roster รายตัวได้ (สำหรับหน้าขอรหัส)', () =>
  assertSucceeds(getDoc(doc(anon(), 'roster/no-1'))));

/* ---------- admin ---------- */
test('แอดมินอ่านบัญชีทุกคนได้', () => assertSucceeds(getDoc(doc(admin(), 'accounts/uidA'))));

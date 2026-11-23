// End-to-end smoke test for the whole app (API + Socket.IO), run against a
// locally running backend. NEVER point this at production or your real dev
// DB - it registers an owner, creates a salon and writes queue/booking rows.
//
// Setup (from repo root):
//   createdb -h localhost -U salon_user salon_e2e          # fresh, empty DB
//   cd salon-backend && DB_NAME=salon_e2e OTP_PROVIDER=stub \
//     TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_FROM_NUMBER= npm run start
//   # in another shell, from salon-backend/ so .env supplies JWT_ACCESS_SECRET:
//   set -a; . ./.env; set +a; node ../scripts/e2e-smoke.js
//
// Needs an EMPTY database each run (it registers the first owner), so
// dropdb/createdb salon_e2e before re-running. The last check trips the
// verify-otp rate limit, so wait 60s before running it again.
const path = require('path');
const { io } = require(path.resolve(__dirname, '../salon-frontend/node_modules/socket.io-client'));
const jwt = require(path.resolve(__dirname, '../salon-backend/node_modules/jsonwebtoken'));

const API = 'http://localhost:3000/api';
const SOCKET = 'http://localhost:3000';
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
}

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(socket, event, predicate = () => true, ms = 4000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { socket.off(event, h); resolve(null); }, ms);
    const h = (d) => { if (predicate(d)) { clearTimeout(t); socket.off(event, h); resolve(d); } };
    socket.on(event, h);
  });
}
// IST calendar date N days from now
function istDate(daysAhead) {
  const d = new Date(Date.now() + 5.5 * 3600e3 + daysAhead * 86400e3);
  return d.toISOString().slice(0, 10);
}
const hasPhone = (obj) => JSON.stringify(obj).includes('+91');

(async () => {
  // ---------- Owner setup ----------
  const reg = await call('POST', '/auth/owner/register', {
    name: 'Test Owner', email: 'owner@e2e.test', password: 'password123',
  });
  check('owner can register (first owner)', reg.status === 201, JSON.stringify(reg.data));
  const reg2 = await call('POST', '/auth/owner/register', {
    name: 'Intruder', email: 'x@e2e.test', password: 'password123',
  });
  check('second owner registration is blocked', reg2.status === 409, reg2.status);

  const badLogin = await call('POST', '/auth/owner/login', { email: 'owner@e2e.test', password: 'wrongpass1' });
  check('owner login rejects wrong password', badLogin.status === 401, badLogin.status);
  const login = await call('POST', '/auth/owner/login', { email: 'owner@e2e.test', password: 'password123' });
  check('owner login works', login.status === 201 && !!login.data?.accessToken, login.status);
  const ownerToken = login.data.accessToken;

  const salonRes = await call('POST', '/salons', {
    name: 'E2E Salon', address: '1 Test Road', city: 'Test City', openingTime: '09:00', closingTime: '20:00',
  }, ownerToken);
  check('owner creates salon', salonRes.status === 201, JSON.stringify(salonRes.data));
  const salonId = salonRes.data.id;
  const salon2 = await call('POST', '/salons', { name: 'Second', address: 'abc road' }, ownerToken);
  check('second salon blocked (single-salon mode)', salon2.status === 409, salon2.status);

  const haircut = (await call('POST', `/salons/${salonId}/services`, { name: 'Haircut', price: 200, durationMinutes: 30 }, ownerToken)).data;
  const color = (await call('POST', `/salons/${salonId}/services`, { name: 'Hair Color', price: 800, durationMinutes: 60 }, ownerToken)).data;
  const unused = (await call('POST', `/salons/${salonId}/services`, { name: 'Unused', price: 50, durationMinutes: 10 }, ownerToken)).data;
  check('owner adds services', !!haircut?.id && !!color?.id && !!unused?.id);
  const badSvc = await call('POST', `/salons/${salonId}/services`, { name: 'X', price: -5, durationMinutes: 0 }, ownerToken);
  check('invalid service rejected by validation', badSvc.status === 400, badSvc.status);

  const shadab = (await call('POST', `/salons/${salonId}/staff`, { name: 'Shadab' }, ownerToken)).data;
  const offStaff = (await call('POST', `/salons/${salonId}/staff`, { name: 'Off Duty' }, ownerToken)).data;
  await call('PATCH', `/staff/${offStaff.id}`, { isAvailable: false }, ownerToken);
  check('owner adds staff', !!shadab?.id && !!offStaff?.id);

  // ---------- Customer OTP login ----------
  const otpA = await call('POST', '/auth/send-otp', { phoneNumber: '9876500001' });
  check('send-otp accepts plain 10-digit number', otpA.status === 201, JSON.stringify(otpA.data));
  check('stub mode returns devOtp', typeof otpA.data?.devOtp === 'string');
  const otpAgain = await call('POST', '/auth/send-otp', { phoneNumber: '9876500001' });
  check('send-otp resend cooldown enforced', otpAgain.status === 400, otpAgain.status);
  const badOtpPhone = await call('POST', '/auth/send-otp', { phoneNumber: '12345' });
  check('invalid phone rejected', badOtpPhone.status === 400, badOtpPhone.status);

  const wrong = await call('POST', '/auth/verify-otp', { phoneNumber: '9876500001', otpCode: otpA.data.devOtp === '000000' ? '111111' : '000000' });
  check('wrong OTP rejected', wrong.status === 401, wrong.status);
  const vA = await call('POST', '/auth/verify-otp', { phoneNumber: '+919876500001', otpCode: otpA.data.devOtp, name: 'Asha' });
  check('correct OTP logs in (+91 form same user)', vA.status === 201 && vA.data?.user?.role === 'customer', JSON.stringify(vA.data));
  const tokenA = vA.data.accessToken;
  const reuse = await call('POST', '/auth/verify-otp', { phoneNumber: '9876500001', otpCode: otpA.data.devOtp });
  check('OTP cannot be reused', reuse.status === 401, reuse.status);

  const me = await call('GET', '/auth/me', null, tokenA);
  check('/auth/me returns customer', me.status === 200 && me.data?.role === 'customer');
  const refreshed = await call('POST', '/auth/refresh-token', { refreshToken: vA.data.refreshToken });
  check('refresh token issues new access token', refreshed.status === 201 && !!refreshed.data?.accessToken);

  // ---------- Queue + sockets ----------
  const publicSock = io(SOCKET, { transports: ['websocket'] });
  const customerSock = io(SOCKET, { transports: ['websocket'] });
  await Promise.all([waitFor(publicSock, 'connect'), waitFor(customerSock, 'connect')]);
  publicSock.emit('join_salon_room', { salonId });

  const joinA = await call('POST', '/queue/join', { salonId, serviceIds: [haircut.id] }, tokenA);
  check('customer joins queue', joinA.status === 201 && joinA.data?.tokenNumber === 1, JSON.stringify(joinA.data));
  const entryA = joinA.data.id;
  const dup = await call('POST', '/queue/join', { salonId, serviceIds: [haircut.id] }, tokenA);
  check('duplicate join -> 409 with existing entryId', dup.status === 409 && dup.data?.entryId === entryA, JSON.stringify(dup.data));
  const ownerJoin = await call('POST', '/queue/join', { salonId, serviceIds: [haircut.id] }, ownerToken);
  check('owner cannot join queue as customer', ownerJoin.status === 403, ownerJoin.status);
  const inactiveJoin = await call('POST', '/queue/join', { salonId, serviceIds: ['00000000-0000-4000-8000-000000000000'] }, tokenA);
  check('join with unknown service rejected', inactiveJoin.status === 400 || inactiveJoin.status === 409, inactiveJoin.status);

  // walk-in (owner) creates customer B, announced on public socket
  const updatePromise = waitFor(publicSock, 'queue_updated', (l) => l.length === 2);
  const walk = await call('POST', `/queue/${salonId}/walk-in`, {
    customerName: 'Bilal', customerPhone: '9876500002', serviceIds: [color.id], staffId: shadab.id,
  }, ownerToken);
  check('owner adds walk-in', walk.status === 201 && walk.data?.tokenNumber === 2, JSON.stringify(walk.data));
  const entryB = walk.data.id;
  const bcast = await updatePromise;
  check('public socket receives queue_updated', !!bcast);
  check('PRIVACY: socket broadcast has no phone numbers', bcast && !hasPhone(bcast), JSON.stringify(bcast?.[0]?.customer));

  const live = await call('GET', `/queue/${salonId}/live`);
  check('public live queue works', live.status === 200 && live.data.length === 2);
  check('PRIVACY: public live queue has no phone numbers', !hasPhone(live.data), JSON.stringify(live.data[0]?.customer));
  check('public live queue still has names', live.data[0]?.customer?.name === 'Asha');
  const manage = await call('GET', `/queue/${salonId}/manage`, null, ownerToken);
  check('owner /manage shows phone numbers', manage.status === 200 && hasPhone(manage.data), manage.status);
  const manageCust = await call('GET', `/queue/${salonId}/manage`, null, tokenA);
  check('customer cannot read /manage', manageCust.status === 403, manageCust.status);
  const manageAnon = await call('GET', `/queue/${salonId}/manage`);
  check('anonymous cannot read /manage', manageAnon.status === 401, manageAnon.status);

  const statusA = await call('GET', `/queue/my-status/${entryA}`, null, tokenA);
  check('customer sees own status (position 1)', statusA.status === 200 && statusA.data?.position === 1);
  // customer B token (user created by walk-in) - sign directly since send-otp is throttled per IP
  const userB = manage.data.find((e) => e.id === entryB).customer;
  const tokenB = jwt.sign({ sub: userB.id, role: 'customer', phoneNumber: userB.phoneNumber, email: null }, ACCESS_SECRET, { expiresIn: '15m' });
  const peek = await call('GET', `/queue/my-status/${entryA}`, null, tokenB);
  check("customer cannot view someone else's entry", peek.status === 403, peek.status);
  const steal = await call('DELETE', `/queue/${entryA}/leave`, null, tokenB);
  check("customer cannot cancel someone else's entry", steal.status === 403, steal.status);
  const custCall = await call('PATCH', `/queue/${entryA}/call-next`, {}, tokenA);
  check('customer cannot call-next', custCall.status === 403, custCall.status);

  // entry room + reconnect behaviour (mirrors SocketService: re-join rooms on connect)
  const rooms = { entry: entryA };
  customerSock.on('connect', () => customerSock.emit('join_queue', { entryId: rooms.entry }));
  customerSock.emit('join_queue', { entryId: entryA });
  await sleep(200);
  const calledPromise = waitFor(customerSock, 'status_changed', (p) => p.entryId === entryA && p.status === 'in_service');
  const callA = await call('PATCH', `/queue/${entryA}/call-next`, {}, ownerToken);
  check('owner calls next', callA.status === 200 && callA.data?.status === 'in_service', callA.status);
  check('customer socket gets status_changed -> in_service', !!(await calledPromise));

  // drop the connection like a phone locking, then reconnect
  customerSock.io.engine.close();
  await waitFor(customerSock, 'connect', () => true, 8000);
  await sleep(300);
  const completedPromise = waitFor(customerSock, 'status_changed', (p) => p.entryId === entryA && p.status === 'completed');
  const compA = await call('PATCH', `/queue/${entryA}/complete`, {}, ownerToken);
  check('owner completes service', compA.status === 200 && compA.data?.status === 'completed');
  check('after reconnect, customer still gets live updates', !!(await completedPromise));
  const compAgain = await call('PATCH', `/queue/${entryA}/complete`, {}, ownerToken);
  check('cannot complete twice', compAgain.status === 400, compAgain.status);

  const ns = await call('PATCH', `/queue/${entryB}/no-show`, {}, ownerToken);
  check('owner marks no-show', ns.status === 200 && ns.data?.status === 'no_show');
  const rejoinA = await call('POST', '/queue/join', { salonId, serviceIds: [haircut.id, color.id] }, tokenA);
  check('customer can re-join after completion (token #3)', rejoinA.status === 201 && rejoinA.data?.tokenNumber === 3, JSON.stringify(rejoinA.data));
  const leaveA = await call('DELETE', `/queue/${rejoinA.data.id}/leave`, null, tokenA);
  check('customer leaves queue', leaveA.status === 200 && leaveA.data?.status === 'cancelled');

  // ---------- Bookings ----------
  const d = istDate(2);
  const book = (body, tok = tokenA) => call('POST', '/bookings', { salonId, bookingDate: d, ...body }, tok);
  check('booking in the past rejected', (await call('POST', '/bookings', { salonId, serviceId: haircut.id, bookingDate: '2020-01-01', bookingTime: '10:00' }, tokenA)).status === 400);
  check('booking before opening (08:30) rejected', (await book({ serviceId: haircut.id, bookingTime: '08:30' })).status === 400);
  const late = await book({ serviceId: color.id, bookingTime: '19:30' });
  check('60-min booking at 19:30 (ends 20:30) rejected', late.status === 400, JSON.stringify(late.data?.message));
  const edge = await book({ serviceId: haircut.id, bookingTime: '19:30' });
  check('30-min booking ending exactly 20:00 allowed', edge.status === 201, JSON.stringify(edge.data?.message));
  const b1 = await book({ serviceId: color.id, staffId: shadab.id, bookingTime: '14:00' });
  check('staff booking 14:00-15:00 created', b1.status === 201, JSON.stringify(b1.data?.message));
  const overlap = await book({ serviceId: haircut.id, staffId: shadab.id, bookingTime: '14:30' }, tokenB);
  check('overlapping staff booking (14:30) rejected', overlap.status === 400, overlap.status);
  const runsInto = await book({ serviceId: haircut.id, staffId: shadab.id, bookingTime: '13:45' }, tokenB);
  check('booking running into next one (13:45-14:15) rejected', runsInto.status === 400, runsInto.status);
  const b2b = await book({ serviceId: haircut.id, staffId: shadab.id, bookingTime: '15:00' }, tokenB);
  check('back-to-back staff booking at 15:00 allowed', b2b.status === 201, JSON.stringify(b2b.data?.message));
  const off = await book({ serviceId: haircut.id, staffId: offStaff.id, bookingTime: '11:00' });
  check('booking unavailable staff rejected', off.status === 400, off.status);

  // concurrency: 5 customers race for the same staff slot
  const raceTokens = [];
  for (let i = 0; i < 5; i++) {
    const w = await call('POST', `/queue/${salonId}/walk-in`, { customerName: `Racer ${i}`, customerPhone: `98765100${10 + i}`, serviceIds: [unused.id] }, ownerToken);
    const m = (await call('GET', `/queue/${salonId}/manage`, null, ownerToken)).data.find((e) => e.id === w.data.id);
    raceTokens.push(jwt.sign({ sub: m.customerId, role: 'customer', phoneNumber: m.customer.phoneNumber, email: null }, ACCESS_SECRET, { expiresIn: '15m' }));
  }
  const race = await Promise.all(raceTokens.map((t) => book({ serviceId: haircut.id, staffId: shadab.id, bookingTime: '17:00' }, t)));
  const won = race.filter((r) => r.status === 201).length;
  check('concurrent bookings for same staff slot: exactly 1 succeeds', won === 1, `${won} succeeded: ${race.map((r) => r.status)}`);

  const mine = await call('GET', '/bookings/my', null, tokenA);
  check('customer lists own bookings', mine.status === 200 && mine.data.length === 2, mine.data?.length);
  const custConfirm = await call('PATCH', `/bookings/${b1.data.id}/status`, { status: 'confirmed' }, tokenA);
  check('customer cannot confirm own booking', custConfirm.status === 403, custConfirm.status);
  const conf = await call('PATCH', `/bookings/${b1.data.id}/status`, { status: 'confirmed' }, ownerToken);
  check('owner confirms booking', conf.status === 200 && conf.data?.status === 'confirmed');
  const doneB = await call('PATCH', `/bookings/${b1.data.id}/status`, { status: 'completed' }, ownerToken);
  check('owner completes booking', doneB.status === 200 && doneB.data?.status === 'completed');
  const cancelB2b = await call('PATCH', `/bookings/${b2b.data.id}/status`, { status: 'cancelled' }, tokenB);
  check('customer cancels own booking', cancelB2b.status === 200);
  const rebook = await book({ serviceId: haircut.id, staffId: shadab.id, bookingTime: '15:00' });
  check('cancelled slot can be booked again', rebook.status === 201, JSON.stringify(rebook.data?.message));
  const salonBookings = await call('GET', `/bookings/salon/${salonId}`, null, ownerToken);
  check('owner lists salon bookings', salonBookings.status === 200 && salonBookings.data.length >= 5);

  // ---------- Reviews ----------
  const revB = await call('POST', '/reviews', { salonId, rating: 4 }, tokenB);
  check('no-show customer cannot review', revB.status === 400, revB.status);
  const revA = await call('POST', '/reviews', { salonId, rating: 5, comment: 'Great cut' }, tokenA);
  check('customer with completed visit can review', revA.status === 201, JSON.stringify(revA.data));
  const revA2 = await call('POST', '/reviews', { salonId, rating: 1 }, tokenA);
  check('second review blocked', revA2.status === 409, revA2.status);
  const reviews = await call('GET', `/salons/${salonId}/reviews`);
  check('public reviews list works', reviews.status === 200 && reviews.data.length === 1 && reviews.data[0].customer?.name === 'Asha');
  check('PRIVACY: public reviews have no phone numbers', !hasPhone(reviews.data), JSON.stringify(reviews.data[0]?.customer));
  const salonAfter = await call('GET', `/salons/${salonId}`);
  check('salon avgRating updated to 5', salonAfter.data?.avgRating === 5, salonAfter.data?.avgRating);

  // ---------- Services delete rules ----------
  const delUsed = await call('DELETE', `/services/${haircut.id}`, null, ownerToken);
  check('used service cannot be deleted', delUsed.status === 400, delUsed.status);
  const tmp = (await call('POST', `/salons/${salonId}/services`, { name: 'Temp', price: 10, durationMinutes: 5 }, ownerToken)).data;
  const delTmp = await call('DELETE', `/services/${tmp.id}`, null, ownerToken);
  check('unused service can be deleted', delTmp.status === 200, delTmp.status);

  // ---------- Analytics ----------
  const an = await call('GET', `/analytics/salon/${salonId}/summary`, null, ownerToken);
  check('analytics summary loads', an.status === 200, an.status);
  check('analytics: 1 served today (queue), revenue 200', an.data?.servedCounts?.today === 1 && an.data?.revenue?.today === 200, JSON.stringify(an.data?.servedCounts) + JSON.stringify(an.data?.revenue));
  check('analytics: ratings 5.0 x1', an.data?.ratings?.average === 5 && an.data?.ratings?.count === 1);
  const anCust = await call('GET', `/analytics/salon/${salonId}/summary`, null, tokenA);
  check('customer cannot read analytics', anCust.status === 403, anCust.status);

  // ---------- OTP brute-force throttle (last: it blocks verify for 60s) ----------
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    statuses.push((await call('POST', '/auth/verify-otp', { phoneNumber: '9876500003', otpCode: '999999' })).status);
  }
  check('verify-otp throttled after 5 attempts/min (429)', statuses.includes(429), statuses.join(','));

  publicSock.close();
  customerSock.close();
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(results.join('\n')); console.error('CRASH', e); process.exit(2); });

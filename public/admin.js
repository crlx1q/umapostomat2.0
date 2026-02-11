const passEl = document.getElementById('adminPass');
const testStateEl = document.getElementById('testState');
const cellsTable = document.getElementById('cellsTable');
const shipmentsTable = document.getElementById('shipmentsTable');
const cellIdSelect = document.getElementById('cellId');

let adminPass = '';

function h() {
  return {
    'content-type': 'application/json',
    'x-admin-password': adminPass
  };
}

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...h(), ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function load() {
  if (!adminPass) return;
  const state = await api('/api/admin/state');

  testStateEl.textContent = `Тестовый режим: RGB=${state.tests.rgb ? 'ON' : 'OFF'}, SEQ=${state.tests.openSeq ? 'ON' : 'OFF'}`;

  cellIdSelect.innerHTML = '<option value="">Автоподбор ячейки</option>';
  state.cells.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.id} (${c.size}) ${c.shipmentId ? 'занята' : 'свободна'}`;
    cellIdSelect.appendChild(o);
  });

  cellsTable.innerHTML = '<tr><th>ID</th><th>Размер</th><th>Статус</th><th>Занято</th><th>Действия</th></tr>';
  state.cells.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c.id}</td><td>${c.size}</td><td>${c.state}</td><td>${c.shipmentId || '-'}</td><td></td>`;
    const td = tr.querySelector('td:last-child');
    const open = document.createElement('button');
    open.textContent = 'Открыть';
    open.onclick = async () => { await api(`/api/cells/${c.id}/open`, { method: 'POST' }); load(); };
    const close = document.createElement('button');
    close.textContent = 'Закрыть';
    close.className = 'secondary';
    close.onclick = async () => { await api(`/api/cells/${c.id}/close`, { method: 'POST' }); load(); };
    td.append(open, close);
    cellsTable.appendChild(tr);
  });

  shipmentsTable.innerHTML = '<tr><th>ID</th><th>Название</th><th>User</th><th>Ячейка</th><th>Статус</th><th></th></tr>';
  state.shipments.forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.id}</td><td>${s.title}</td><td>${s.userId}</td><td>${s.cellId}</td><td>${s.status}</td><td></td>`;
    const del = document.createElement('button');
    del.textContent = 'Удалить';
    del.className = 'secondary';
    del.onclick = async () => { await api(`/api/admin/shipments/${s.id}`, { method: 'DELETE' }); load(); };
    tr.querySelector('td:last-child').append(del);
    shipmentsTable.appendChild(tr);
  });
}

document.getElementById('loginBtn').onclick = async () => {
  adminPass = passEl.value;
  await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: adminPass }) });
  load();
};

document.getElementById('createShipment').onclick = async () => {
  await api('/api/admin/shipments', {
    method: 'POST',
    body: JSON.stringify({
      title: document.getElementById('title').value,
      description: document.getElementById('desc').value,
      size: document.getElementById('size').value,
      userId: document.getElementById('userId').value,
      cellId: document.getElementById('cellId').value || undefined
    })
  });
  load();
};

document.getElementById('rgbStart').onclick = () => api('/api/admin/test/rgb/start', { method: 'POST' }).then(load);
document.getElementById('rgbStop').onclick = () => api('/api/admin/test/rgb/stop', { method: 'POST' }).then(load);
document.getElementById('seqStart').onclick = () => api('/api/admin/test/open-seq/start', { method: 'POST' }).then(load);
document.getElementById('seqStop').onclick = () => api('/api/admin/test/open-seq/stop', { method: 'POST' }).then(load);

setInterval(load, 3000);

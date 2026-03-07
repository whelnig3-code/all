// JAEWOO OPS Admin — Client-side JS

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// 테이블 텍스트 필터링
function filterTable(query, tableId) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  const q = query.toLowerCase();
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// ESC 키로 모달 닫기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }
});

// 헬스 체크 점 색상
(async function checkHealth() {
  const dot = document.querySelector('.status-dot');
  if (!dot) return;
  try {
    const r = await fetch('/api/health');
    const data = await r.json();
    dot.style.background = data.status === 'ok' ? '#4caf50' : '#f44336';
    dot.title = `백엔드: ${data.status} (v${data.version || '?'})`;
  } catch(e) {
    dot.style.background = '#f44336';
    dot.title = '백엔드 연결 실패';
  }
})();

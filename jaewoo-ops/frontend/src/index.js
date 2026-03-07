/**
 * JAEWOO OPS 관리자 웹 — Express 서버 (Phase 1)
 * 백엔드 FastAPI(8000)와 연동하는 관리자 대시보드
 */
const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_BASE || 'http://localhost:8000';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ── API 프록시 헬퍼 ──────────────────────────────────────
function apiRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port || 8000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({}); }
      });
    });
    req.on('error', (e) => reject(e));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── HTML 레이아웃 ────────────────────────────────────────
function layout(title, content, activeMenu = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — JAEWOO OPS</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <nav class="sidebar">
    <div class="sidebar-logo">
      <span class="logo-icon">&#127807;</span>
      <div>
        <div class="logo-title">JAEWOO OPS</div>
        <div class="logo-sub">재우(주) 운영관리</div>
      </div>
    </div>
    <ul class="nav-menu">
      <li><a href="/" class="${activeMenu === 'dashboard' ? 'active' : ''}">
        <span class="nav-icon">&#128202;</span> 대시보드
      </a></li>
      <li><a href="/tasks" class="${activeMenu === 'tasks' ? 'active' : ''}">
        <span class="nav-icon">&#128203;</span> 업무 관리
      </a></li>
      <li><a href="/maintenance" class="${activeMenu === 'maintenance' ? 'active' : ''}">
        <span class="nav-icon">&#128295;</span> 설비 점검
      </a></li>
      <li><a href="/employees" class="${activeMenu === 'employees' ? 'active' : ''}">
        <span class="nav-icon">&#128101;</span> 직원 관리
      </a></li>
      <li><a href="/evaluation" class="${activeMenu === 'evaluation' ? 'active' : ''}">
        <span class="nav-icon">&#127942;</span> 인사 평가
      </a></li>
      <li><a href="/emergency" class="${activeMenu === 'emergency' ? 'active' : ''}">
        <span class="nav-icon">&#128680;</span> 긴급 업무
      </a></li>
    </ul>
    <div class="sidebar-footer">
      <a href="${API_BASE}/docs" target="_blank" class="api-link">API Docs</a>
      <span class="version">v1.3.0 · Phase 1</span>
    </div>
  </nav>
  <main class="content">
    <header class="top-bar">
      <h1 class="page-title">${title}</h1>
      <div class="top-bar-right">
        <span class="badge badge-phase">Phase 1 · Excel</span>
        <a href="/api/health" class="status-dot" title="시스템 상태"></a>
      </div>
    </header>
    <div class="page-body">
      ${content}
    </div>
  </main>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

// ── 상태 배지 헬퍼 ──────────────────────────────────────
function statusBadge(status) {
  const map = {
    '대기': 'badge-pending', 'PENDING': 'badge-pending',
    '진행': 'badge-inprogress', '진행중': 'badge-inprogress', 'IN_PROGRESS': 'badge-inprogress',
    '완료': 'badge-done', 'COMPLETED': 'badge-done',
    '지연': 'badge-overdue', 'OVERDUE': 'badge-overdue',
    '취소': 'badge-cancel', 'CANCELLED': 'badge-cancel',
  };
  const cls = map[status] || 'badge-pending';
  const label = {
    'PENDING':'대기','IN_PROGRESS':'진행중','COMPLETED':'완료','OVERDUE':'지연','CANCELLED':'취소'
  }[status] || status;
  return `<span class="badge ${cls}">${label}</span>`;
}

function priorityBadge(p) {
  const map = { 'LOW':'badge-low','MEDIUM':'badge-medium','HIGH':'badge-high','CRITICAL':'badge-critical' };
  const label = { 'LOW':'낮음','MEDIUM':'보통','HIGH':'높음','CRITICAL':'긴급' };
  return `<span class="badge ${map[p]||'badge-medium'}">${label[p]||p}</span>`;
}

// ── 라우트: 헬스 ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.3.0' }));
app.get('/api/health', async (req, res) => {
  try {
    const data = await apiRequest('/health');
    res.json(data);
  } catch(e) {
    res.status(503).json({ status: 'error', message: e.message });
  }
});

// ── 라우트: 대시보드 ─────────────────────────────────────
app.get('/', async (req, res) => {
  let tasks = { items: [], total: 0 };
  let employees = [];
  let scheduler = { running_jobs: [], outbox_pending: 0 };
  try {
    [tasks, employees, scheduler] = await Promise.all([
      apiRequest('/api/v1/tasks'),
      apiRequest('/api/v1/employees'),
      apiRequest('/api/v1/scheduler/status'),
    ]);
  } catch(e) {}

  const items = tasks.items || [];
  const pending  = items.filter(t => t.status === 'PENDING').length;
  const inprog   = items.filter(t => t.status === 'IN_PROGRESS').length;
  const overdue  = items.filter(t => t.status === 'OVERDUE').length;
  const done     = items.filter(t => t.status === 'COMPLETED').length;

  const overdueList = items.filter(t => t.status === 'OVERDUE').slice(0, 5);
  const todayItems  = items.filter(t => t.due_date && t.due_date.startsWith(new Date().toISOString().split('T')[0])).slice(0, 5);

  const content = `
    <div class="stats-grid">
      <div class="stat-card stat-pending">
        <div class="stat-icon">&#128203;</div>
        <div class="stat-info">
          <div class="stat-num">${pending}</div>
          <div class="stat-label">대기 업무</div>
        </div>
      </div>
      <div class="stat-card stat-inprogress">
        <div class="stat-icon">&#9654;</div>
        <div class="stat-info">
          <div class="stat-num">${inprog}</div>
          <div class="stat-label">진행 중</div>
        </div>
      </div>
      <div class="stat-card stat-overdue">
        <div class="stat-icon">&#9888;</div>
        <div class="stat-info">
          <div class="stat-num">${overdue}</div>
          <div class="stat-label">지연 업무</div>
        </div>
      </div>
      <div class="stat-card stat-done">
        <div class="stat-icon">&#10003;</div>
        <div class="stat-info">
          <div class="stat-num">${done}</div>
          <div class="stat-label">완료</div>
        </div>
      </div>
      <div class="stat-card stat-emp">
        <div class="stat-icon">&#128101;</div>
        <div class="stat-info">
          <div class="stat-num">${(employees || []).length}</div>
          <div class="stat-label">재직 직원</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <h3>&#9888; 지연 업무 현황</h3>
          <a href="/tasks?status=OVERDUE" class="btn btn-sm">전체 보기</a>
        </div>
        ${overdueList.length === 0
          ? '<p class="empty-msg">지연 업무 없음</p>'
          : `<table class="table">
              <thead><tr><th>업무</th><th>담당자</th><th>마감</th><th>상태</th></tr></thead>
              <tbody>
                ${overdueList.map(t => `
                  <tr>
                    <td>${t.title || '-'}</td>
                    <td>${t.assignee_id || '-'}</td>
                    <td class="td-date">${t.due_date || '-'}</td>
                    <td>${statusBadge(t.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="card">
        <div class="card-header">
          <h3>&#128197; 오늘 마감 업무</h3>
          <a href="/tasks" class="btn btn-sm">업무 관리</a>
        </div>
        ${todayItems.length === 0
          ? '<p class="empty-msg">오늘 마감 업무 없음</p>'
          : `<table class="table">
              <thead><tr><th>업무</th><th>담당자</th><th>유형</th><th>상태</th></tr></thead>
              <tbody>
                ${todayItems.map(t => `
                  <tr>
                    <td>${t.title || '-'}</td>
                    <td>${t.assignee_id || '-'}</td>
                    <td><span class="tag">${t.task_type || '-'}</span></td>
                    <td>${statusBadge(t.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>&#9881; 스케줄러 상태</h3></div>
        <div class="scheduler-info">
          <div class="scheduler-item">
            <span>실행 중인 작업</span>
            <strong>${(scheduler.running_jobs || []).length}개</strong>
          </div>
          <div class="scheduler-item">
            <span>Outbox 대기</span>
            <strong>${scheduler.outbox_pending || 0}건</strong>
          </div>
          <div class="scheduler-item">
            <span>오전 알림 (09:00)</span>
            <strong class="text-green">예약됨</strong>
          </div>
          <div class="scheduler-item">
            <span>오후 알림 (14:00)</span>
            <strong class="text-green">예약됨</strong>
          </div>
          <div class="scheduler-item">
            <span>지연 탐지 (매 30분)</span>
            <strong class="text-green">예약됨</strong>
          </div>
          <div class="scheduler-item">
            <span>월간 평가 (매월 1일)</span>
            <strong class="text-green">예약됨</strong>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>&#128101; 직원 현황</h3></div>
        <div class="emp-list">
          ${(employees || []).slice(0, 6).map(e => `
            <div class="emp-item">
              <div class="emp-avatar">${(e.name || 'N').charAt(0)}</div>
              <div class="emp-info">
                <div class="emp-name">${e.name}</div>
                <div class="emp-meta">${e.role} · ${e.team_id}</div>
              </div>
              <span class="badge badge-done">재직</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  res.send(layout('대시보드', content, 'dashboard'));
});

// ── 라우트: 업무 관리 ────────────────────────────────────
app.get('/tasks', async (req, res) => {
  let tasks = { items: [], total: 0 };
  let employees = [];
  try {
    [tasks, employees] = await Promise.all([
      apiRequest('/api/v1/tasks' + (req.query.status ? `?status=${req.query.status}` : '')),
      apiRequest('/api/v1/employees'),
    ]);
  } catch(e) {}

  const items = tasks.items || [];
  const statusFilter = req.query.status || '';

  const content = `
    <div class="toolbar">
      <div class="filter-tabs">
        <a href="/tasks" class="tab ${!statusFilter ? 'active' : ''}">전체</a>
        <a href="/tasks?status=PENDING" class="tab ${statusFilter==='PENDING' ? 'active' : ''}">대기</a>
        <a href="/tasks?status=IN_PROGRESS" class="tab ${statusFilter==='IN_PROGRESS' ? 'active' : ''}">진행중</a>
        <a href="/tasks?status=OVERDUE" class="tab ${statusFilter==='OVERDUE' ? 'active' : ''}">지연</a>
        <a href="/tasks?status=COMPLETED" class="tab ${statusFilter==='COMPLETED' ? 'active' : ''}">완료</a>
      </div>
      <button onclick="showModal('create-task-modal')" class="btn btn-primary">+ 업무 생성</button>
    </div>

    <div class="card">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>업무명</th><th>유형</th><th>담당자</th><th>마감일</th>
            <th>우선순위</th><th>상태</th><th>가중치</th>
          </tr>
        </thead>
        <tbody>
          ${items.length === 0
            ? '<tr><td colspan="7" class="empty-msg">업무 없음</td></tr>'
            : items.map(t => `
              <tr>
                <td class="td-title">${t.title || '-'}</td>
                <td><span class="tag tag-${(t.task_type||'').toLowerCase()}">${t.task_type || '-'}</span></td>
                <td>${t.assignee_id || '-'}</td>
                <td class="td-date">${t.due_date || '-'}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td>${statusBadge(t.status)}</td>
                <td><span class="weight">${t.evaluation_weight || 1.0}x</span></td>
              </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-footer">총 ${items.length}건</div>
    </div>

    <!-- 업무 생성 모달 -->
    <div id="create-task-modal" class="modal" style="display:none">
      <div class="modal-backdrop" onclick="hideModal('create-task-modal')"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h3>업무 생성</h3>
          <button onclick="hideModal('create-task-modal')" class="modal-close">&times;</button>
        </div>
        <form method="POST" action="/tasks/create">
          <div class="form-group">
            <label>업무명 *</label>
            <input type="text" name="title" required placeholder="업무 제목 입력">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>유형 *</label>
              <select name="task_type">
                <option value="GENERAL">일반</option>
                <option value="EQUIPMENT">설비점검</option>
                <option value="RECURRING">반복</option>
                <option value="EMERGENCY">긴급</option>
              </select>
            </div>
            <div class="form-group">
              <label>우선순위</label>
              <select name="priority">
                <option value="LOW">낮음</option>
                <option value="MEDIUM" selected>보통</option>
                <option value="HIGH">높음</option>
                <option value="CRITICAL">긴급</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>담당자 ID *</label>
              <input type="text" name="assignee_id" required placeholder="직원 ID">
            </div>
            <div class="form-group">
              <label>팀 ID</label>
              <input type="text" name="team_id" placeholder="팀명">
            </div>
          </div>
          <div class="form-group">
            <label>마감일</label>
            <input type="date" name="due_date">
          </div>
          <div class="form-group">
            <label>설명</label>
            <textarea name="description" rows="3" placeholder="업무 상세 내용"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="hideModal('create-task-modal')" class="btn btn-ghost">취소</button>
            <button type="submit" class="btn btn-primary">생성</button>
          </div>
        </form>
      </div>
    </div>`;

  res.send(layout('업무 관리', content, 'tasks'));
});

app.post('/tasks/create', async (req, res) => {
  try {
    const body = {
      title: req.body.title,
      task_type: req.body.task_type,
      assignee_id: req.body.assignee_id,
      team_id: req.body.team_id || '재배팀',
      created_by: req.body.assignee_id,
      priority: req.body.priority || 'MEDIUM',
      due_date: req.body.due_date || null,
      description: req.body.description || '',
    };
    await apiRequest('/api/v1/tasks', 'POST', body);
    res.redirect('/tasks');
  } catch(e) {
    res.redirect('/tasks?error=' + encodeURIComponent(e.message));
  }
});

// ── 라우트: 설비 점검 ────────────────────────────────────
app.get('/maintenance', async (req, res) => {
  let tasks = { items: [], total: 0 };
  try {
    tasks = await apiRequest('/api/v1/tasks?task_type=EQUIPMENT');
  } catch(e) {}

  const items = (tasks.items || []);
  const pending = items.filter(t => t.status === 'PENDING').length;
  const overdue = items.filter(t => t.status === 'OVERDUE').length;
  const done = items.filter(t => t.status === 'COMPLETED').length;

  const content = `
    <div class="stats-grid stats-grid-3">
      <div class="stat-card stat-pending">
        <div class="stat-icon">&#128295;</div>
        <div class="stat-info"><div class="stat-num">${pending}</div><div class="stat-label">점검 대기</div></div>
      </div>
      <div class="stat-card stat-overdue">
        <div class="stat-icon">&#9888;</div>
        <div class="stat-info"><div class="stat-num">${overdue}</div><div class="stat-label">지연</div></div>
      </div>
      <div class="stat-card stat-done">
        <div class="stat-icon">&#10003;</div>
        <div class="stat-info"><div class="stat-num">${done}</div><div class="stat-label">완료</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>설비 정기 점검 목록</h3>
        <span class="badge badge-info">설비점검 가중치 2.0x</span>
      </div>
      <table class="table table-hover">
        <thead>
          <tr><th>점검항목</th><th>담당자</th><th>마감일</th><th>우선순위</th><th>상태</th><th>가중치</th></tr>
        </thead>
        <tbody>
          ${items.length === 0
            ? '<tr><td colspan="6" class="empty-msg">설비 점검 업무 없음</td></tr>'
            : items.map(t => `
              <tr class="${t.status === 'OVERDUE' ? 'row-overdue' : ''}">
                <td class="td-title">${t.title || '-'}</td>
                <td>${t.assignee_id || '-'}</td>
                <td class="td-date">${t.due_date || '-'}</td>
                <td>${priorityBadge(t.priority)}</td>
                <td>${statusBadge(t.status)}</td>
                <td><span class="weight">${t.evaluation_weight || 2.0}x</span></td>
              </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-footer">총 ${items.length}건</div>
    </div>

    <div class="card">
      <div class="card-header"><h3>에스컬레이션 정책</h3></div>
      <div class="escalation-policy">
        <div class="esc-step esc-step-1">
          <div class="esc-badge">1단계</div>
          <div class="esc-info">
            <strong>담당자 DM 알림</strong>
            <span>OVERDUE 감지 즉시 → 알림톡 발송</span>
          </div>
        </div>
        <div class="esc-arrow">&#8595;</div>
        <div class="esc-step esc-step-2">
          <div class="esc-badge">2단계</div>
          <div class="esc-info">
            <strong>1시간 후 재알림</strong>
            <span>담당자에게 재차 DM 알림</span>
          </div>
        </div>
        <div class="esc-arrow">&#8595;</div>
        <div class="esc-step esc-step-3">
          <div class="esc-badge">3단계</div>
          <div class="esc-info">
            <strong>팀장 CC + GROUP 발송</strong>
            <span>카카오워크 팀 단톡방 @팀장 멘션</span>
          </div>
        </div>
      </div>
    </div>`;

  res.send(layout('설비 점검', content, 'maintenance'));
});

// ── 라우트: 직원 관리 ────────────────────────────────────
app.get('/employees', async (req, res) => {
  let employees = [];
  try {
    employees = await apiRequest('/api/v1/employees');
  } catch(e) {}

  const empList = employees || [];

  const content = `
    <div class="toolbar">
      <div class="search-box">
        <input type="text" id="emp-search" placeholder="직원 이름 검색..." oninput="filterTable(this.value, 'emp-table')">
      </div>
      <button onclick="showModal('create-emp-modal')" class="btn btn-primary">+ 직원 등록</button>
    </div>

    <div class="card">
      <table class="table table-hover" id="emp-table">
        <thead>
          <tr><th>사번</th><th>이름</th><th>팀</th><th>직급</th><th>언어</th><th>카카오워크</th><th>이메일</th><th>상태</th></tr>
        </thead>
        <tbody>
          ${empList.length === 0
            ? '<tr><td colspan="8" class="empty-msg">직원 데이터 없음</td></tr>'
            : empList.map((e, i) => `
              <tr>
                <td><code>E${String(i+1).padStart(3,'0')}</code></td>
                <td><strong>${e.name || '-'}</strong></td>
                <td>${e.team_id || '-'}</td>
                <td>${e.role || '-'}</td>
                <td><span class="lang-badge lang-${(e.language||'ko').toLowerCase()}">${e.language || 'KO'}</span></td>
                <td>${e.kakaowork_id ? `<code>${e.kakaowork_id}</code>` : '<span class="text-gray">미설정</span>'}</td>
                <td>${e.email || '-'}</td>
                <td><span class="badge badge-done">재직</span></td>
              </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-footer">총 ${empList.length}명</div>
    </div>

    <!-- 직원 등록 모달 -->
    <div id="create-emp-modal" class="modal" style="display:none">
      <div class="modal-backdrop" onclick="hideModal('create-emp-modal')"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h3>직원 등록</h3>
          <button onclick="hideModal('create-emp-modal')" class="modal-close">&times;</button>
        </div>
        <form method="POST" action="/employees/create">
          <div class="form-row">
            <div class="form-group">
              <label>이름 *</label>
              <input type="text" name="name" required placeholder="홍길동">
            </div>
            <div class="form-group">
              <label>이메일</label>
              <input type="email" name="email" placeholder="email@company.com">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>연락처</label>
              <input type="text" name="phone" placeholder="010-0000-0000">
            </div>
            <div class="form-group">
              <label>카카오워크 ID</label>
              <input type="text" name="kakaowork_id" placeholder="hong.gildong">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>팀 *</label>
              <input type="text" name="team_id" required value="재배팀">
            </div>
            <div class="form-group">
              <label>직급 *</label>
              <select name="role">
                <option value="STAFF">사원</option>
                <option value="TEAM_LEAD">팀장</option>
                <option value="MANAGER">관리자</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>언어</label>
            <select name="language">
              <option value="KO">한국어 (KO)</option>
              <option value="VN">베트남어 (VN)</option>
              <option value="EN">영어 (EN)</option>
              <option value="ZH">중국어 (ZH)</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="hideModal('create-emp-modal')" class="btn btn-ghost">취소</button>
            <button type="submit" class="btn btn-primary">등록</button>
          </div>
        </form>
      </div>
    </div>`;

  res.send(layout('직원 관리', content, 'employees'));
});

app.post('/employees/create', async (req, res) => {
  try {
    const body = {
      name: req.body.name,
      email: req.body.email || '',
      phone: req.body.phone || '',
      kakaowork_id: req.body.kakaowork_id || null,
      team_id: req.body.team_id,
      role: req.body.role,
      language: req.body.language || 'KO',
      backup_employee_id: null,
      deputy_employee_id: null,
    };
    await apiRequest('/api/v1/employees', 'POST', body);
    res.redirect('/employees');
  } catch(e) {
    res.redirect('/employees?error=' + encodeURIComponent(e.message));
  }
});

// ── 라우트: 인사 평가 ────────────────────────────────────
app.get('/evaluation', async (req, res) => {
  let evalData = [];
  let employees = [];
  try {
    [evalData, employees] = await Promise.all([
      apiRequest('/api/v1/evaluations/monthly/all?year_month=2026-01'),
      apiRequest('/api/v1/employees'),
    ]);
  } catch(e) {}

  const evals = Array.isArray(evalData) ? evalData : (evalData.items || []);
  const empList = employees || [];

  function gradeClass(g) {
    return { 'S':'grade-s','A':'grade-a','B':'grade-b','C':'grade-c','D':'grade-d' }[g] || 'grade-b';
  }

  const content = `
    <div class="card">
      <div class="card-header">
        <h3>2026년 1월 월간 평가</h3>
        <div>
          <a href="/api/v1/evaluations/monthly?year=2026&month=1" target="_blank" class="btn btn-sm">JSON 보기</a>
        </div>
      </div>
      ${evals.length === 0
        ? `<div class="eval-empty">
            <p>평가 데이터가 없습니다.</p>
            <p class="text-gray">매월 1일 00:30에 전월 평가가 자동 집계됩니다.</p>
            <form method="POST" action="/evaluation/calculate">
              <button type="submit" class="btn btn-primary">지금 평가 집계 실행</button>
            </form>
           </div>`
        : `<table class="table">
            <thead>
              <tr><th>이름</th><th>총배정</th><th>정시완료</th><th>지연</th><th>미완료</th><th>과제달성율</th><th>종합점수</th><th>등급</th></tr>
            </thead>
            <tbody>
              ${evals.map(e => `
                <tr>
                  <td><strong>${e.employee_name || e.name || '-'}</strong></td>
                  <td>${e.total_assigned || 0}</td>
                  <td><span class="text-green">${e.on_time_count || 0}</span></td>
                  <td><span class="text-orange">${e.delay_count || 0}</span></td>
                  <td><span class="text-red">${e.incomplete_count || 0}</span></td>
                  <td>${e.task_achievement_rate || '-'}</td>
                  <td><strong>${e.final_score || e.total_score || '-'}</strong></td>
                  <td><span class="grade ${gradeClass(e.grade)}">${e.grade || '-'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>`}
    </div>

    <div class="card">
      <div class="card-header"><h3>평가 점수 산출 공식</h3></div>
      <div class="score-formula">
        <div class="formula-item">
          <div class="formula-name">weighted_score</div>
          <div class="formula-eq">= (정시완료 × 가중치 합계) / 총 가중치</div>
        </div>
        <div class="formula-item">
          <div class="formula-name">equipment_check_score</div>
          <div class="formula-eq">= 설비점검 정시 완료 비율 × 100</div>
        </div>
        <div class="formula-item">
          <div class="formula-name">final_score</div>
          <div class="formula-eq">= weighted_score × 0.6 + equipment_check_score × 0.3 + task_achievement × 0.1</div>
        </div>
        <div class="formula-grades">
          <span class="grade grade-s">S: 95+</span>
          <span class="grade grade-a">A: 85-94</span>
          <span class="grade grade-b">B: 75-84</span>
          <span class="grade grade-c">C: 60-74</span>
          <span class="grade grade-d">D: ~59</span>
        </div>
      </div>
    </div>`;

  res.send(layout('인사 평가', content, 'evaluation'));
});

app.post('/evaluation/calculate', async (req, res) => {
  try {
    await apiRequest('/api/v1/evaluations/calculate', 'POST', {});
    res.redirect('/evaluation');
  } catch(e) {
    res.redirect('/evaluation?error=' + encodeURIComponent(e.message));
  }
});

// ── 라우트: 긴급 업무 ────────────────────────────────────
app.get('/emergency', async (req, res) => {
  let tasks = { items: [] };
  try {
    tasks = await apiRequest('/api/v1/tasks?task_type=EMERGENCY');
  } catch(e) {}

  const items = (tasks.items || []);

  const content = `
    <div class="alert alert-warning">
      <strong>&#128680; 긴급업무 SLA 기준</strong>
      <div class="sla-table">
        <span>CRITICAL: 인지 30분 / 대응 1시간 / 완료 4시간</span>
        <span>HIGH: 인지 1시간 / 대응 2시간 / 완료 8시간</span>
        <span>EMERGENCY: 인지 2시간 / 대응 4시간 / 완료 24시간</span>
      </div>
    </div>

    <div class="toolbar">
      <h3>긴급 업무 목록</h3>
      <button onclick="showModal('create-emergency-modal')" class="btn btn-danger">&#128680; 긴급 업무 등록</button>
    </div>

    <div class="card">
      <table class="table table-hover">
        <thead>
          <tr><th>업무명</th><th>담당자</th><th>마감</th><th>상태</th><th>대응시간</th></tr>
        </thead>
        <tbody>
          ${items.length === 0
            ? '<tr><td colspan="5" class="empty-msg">진행 중인 긴급 업무 없음</td></tr>'
            : items.map(t => `
              <tr class="row-emergency">
                <td class="td-title">&#128680; ${t.title || '-'}</td>
                <td>${t.assignee_id || '-'}</td>
                <td class="td-date">${t.due_date || '-'}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${t.emergency_detail ? t.emergency_detail.response_time_minutes + '분' : '-'}</td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- 긴급 업무 등록 모달 -->
    <div id="create-emergency-modal" class="modal" style="display:none">
      <div class="modal-backdrop" onclick="hideModal('create-emergency-modal')"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h3>&#128680; 긴급 업무 등록</h3>
          <button onclick="hideModal('create-emergency-modal')" class="modal-close">&times;</button>
        </div>
        <form method="POST" action="/tasks/create">
          <input type="hidden" name="task_type" value="EMERGENCY">
          <input type="hidden" name="priority" value="CRITICAL">
          <div class="form-group">
            <label>긴급 업무명 *</label>
            <input type="text" name="title" required placeholder="예: A동 보일러 배관 누수 대응">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>대응 담당자 ID *</label>
              <input type="text" name="assignee_id" required placeholder="직원 ID">
            </div>
            <div class="form-group">
              <label>팀</label>
              <input type="text" name="team_id" value="재배팀">
            </div>
          </div>
          <div class="form-group">
            <label>상황 설명</label>
            <textarea name="description" rows="4" placeholder="발생 상황, 위치, 긴급도 등 상세 기록"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="hideModal('create-emergency-modal')" class="btn btn-ghost">취소</button>
            <button type="submit" class="btn btn-danger">&#128680; 긴급 등록</button>
          </div>
        </form>
      </div>
    </div>`;

  res.send(layout('긴급 업무', content, 'emergency'));
});

// ── API 프록시 (프론트 → 백엔드 투명 프록시) ────────────
app.use('/api/v1', async (req, res) => {
  try {
    const data = await apiRequest('/api/v1' + req.path, req.method, req.body);
    res.json(data);
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
});

// ── 서버 시작 ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[JAEWOO OPS Admin] http://localhost:${PORT}`);
  console.log(`[Backend API]      ${API_BASE}`);
  console.log(`[Swagger Docs]     ${API_BASE}/docs`);
});

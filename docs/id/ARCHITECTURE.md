> 🌐 [English](../../ARCHITECTURE.md) | **Bahasa Indonesia**

# AoKira — Arsitektur Sistem

**Peran Dokumen:** Sumber kebenaran kanonis untuk topologi sistem secara keseluruhan, tech stack, organisasi modul di TypeScript, Rust/WASM, dan Python, protokol Web Worker, aliran data, propagasi error, degradasi offline/anggun, topologi deployment, dan pola performa runtime.
**Dokumen Kanonis Terkait:** [DATA_MODEL.md](DATA_MODEL.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [API_CONTRACT.md](API_CONTRACT.md).

---

## 1. Topologi Sistem

`AoKira` mengisolasi **visualisasi interaktif**, **simulasi deterministik real-time**, dan **analytics/optimasi numerik batch** ke dalam tiga tier eksekusi yang terpisah:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Thread Utama Browser — React + TypeScript + Three.js / React Three Fiber│
│  • 5 Tampilan Fitur (Overview, Digital Twin, Sim Lab, Analytics, Opt)   │
│  • Scene Graph 3D & Kontrol Kamera                                      │
│  • Store Zustand (State UI, Cermin Sim, Buffer Event, Cache Analytics)  │
└───────────────┬───────────────────────────────────────┬─────────────────┘
                │ postMessage (WorkerCommand/Snapshot)  │ HTTPS JSON (/api/v1)
                ▼                                       ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│ Web Worker — Rust dikompilasi ke WASM │ │ Layanan Container Terpisah    │
│ (crates/aokira-engine)                │ │ Python 3.12 + FastAPI         │
│ • FK / DLS IK / Trajektori Quintic    │ │ (apps/api)                    │
│ • Pemeriksa Tabrakan Capsule/Box      │ │ • Analytics KPI & Energi      │
│ • State Machine 8 Stage (jam 20 ms)   │ │ • Deteksi Bottleneck          │
│ • Konveyor / Gripper / Stasiun        │ │ • Optimasi Multi-Skenario     │
│ • Aliran Event & Metrik Deterministik │ │ • Validasi Konsistensi        │
└───────────────────────────────────────┘ └───────────────────────────────┘
```

### Invarian Arsitektur Kunci
Web Worker Rust/WASM dieksekusi **100% di sisi klien** di dalam browser. Backend Python FastAPI sepenuhnya adalah **koprosesor analitik dan optimasi** dan tidak pernah dibutuhkan pada jalur simulasi frame demi frame maupun untuk eksekusi simulasi lokal.

---

## 2. Tech Stack & Struktur Repositori

### 2.1 Stack Terkunci

| Tier | Teknologi |
|---|---|
| **Frontend (`apps/web`)** | TypeScript, React 18+, Vite, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, Tailwind CSS, Recharts, React Router |
| **Engine Simulasi (`crates/aokira-engine`)** | Rust (stable), `wasm-bindgen`, `serde`, `serde_json`, `serde-wasm-bindgen`, `wasm-pack` |
| **Analytics & Optimasi (`apps/api`)** | Python 3.12+, FastAPI, Pydantic v2, Uvicorn, NumPy, SciPy, Pytest, HTTPX |
| **Tooling & CI/CD** | Node.js / pnpm (atau npm), Cargo, Playwright, GitHub Actions, Docker |

### 2.2 Organisasi Repositori Target

```text
AoKira/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/              # Router, layout shell, error boundary
│   │   │   ├── components/       # Primitif UI bersama & komponen scene 3D
│   │   │   ├── features/
│   │   │   │   ├── overview/
│   │   │   │   ├── digital-twin/
│   │   │   │   ├── simulation/
│   │   │   │   ├── analytics/
│   │   │   │   └── optimization/
│   │   │   ├── hooks/            # Jembatan Worker, reduced-motion, kesehatan API
│   │   │   ├── services/         # Klien HTTP bertipe untuk /api/v1
│   │   │   ├── stores/           # Store Zustand (twinUi, simulation, scenarios)
│   │   │   ├── workers/          # simulation.worker.ts khusus
│   │   │   └── styles/           # Tailwind & token desain
│   │   └── package.json
│   └── api/
│       ├── app/
│       │   ├── main.py           # Aplikasi FastAPI, CORS, lifespan, router
│       │   ├── routes/           # health, analytics, scenarios, optimization
│       │   ├── schemas/          # Model Pydantic v2 yang cocok dengan DATA_MODEL.md
│       │   ├── services/         # Lapisan orkestrasi
│       │   └── analytics/        # analytics, bottleneck, optimization, forecasting, energy, validation
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
├── crates/
│   └── aokira-engine/
│       ├── src/
│       │   ├── lib.rs            # Ekspor WASM & titik masuk engine
│       │   ├── kinematics/       # FK Standard DH & IK Damped Least Squares
│       │   ├── trajectory/       # Interpolasi quintic & penskalaan kecepatan/akselerasi
│       │   ├── collision/        # Pemeriksaan jarak/near-collision capsule & box
│       │   ├── robot/            # State sendi, batas, validasi home/jog
│       │   ├── gripper/          # State rahang paralel & validasi genggam
│       │   ├── conveyor/         # Pergerakan belt input/output & zona sensor
│       │   ├── production/       # State machine 8 stage & penanganan fault
│       │   ├── scheduler/        # Akumulator tick tetap 20 ms & pengurutan event
│       │   └── metrics/          # Penghitung turunan event & integral energi sintetis
│       └── Cargo.toml
├── data/
│   ├── workcell/                 # aokira-workcell.v1.json kanonis
│   ├── scenarios/                # JSON skenario baseline & preset (A-D)
│   └── fixtures/                 # Fixture event/tes golden deterministik
└── docs / spesifikasi Markdown di root
```

---

## 3. Arsitektur Frontend (`apps/web`)

### 3.1 Store State (Zustand)
1. **`useTwinUiStore`**: Preset kamera, ID komponen terpilih, peta visibilitas/isolasi komponen, slider exploded-view (`0..1`), toggle grid/sumbu, toggle label/sensor, toggle geometri tabrakan, flag ketersediaan WebGL.
2. **`useSimulationStore`**: Cermin `SimulationSnapshot`, `SimulationRunStatus`, `ScenarioConfig`, log `SimulationEvent[]` bergulir, `ProductionMetrics` langsung, override jog sendi manual (hanya aktif saat `runStatus === 'READY' | 'STOPPED'`), dan state koneksi Worker.
3. **`useAnalyticsStore`**: Respons Python `/analytics/evaluate`, `/scenarios/compare`, dan `/optimization/run` yang di-cache, kesehatan backend (`ONLINE | CHECKING | UNAVAILABLE`), dan state loading/error yang sedang berjalan.

### 3.2 Lapisan Rendering 3D (React Three Fiber)
- **Satu Canvas Bersama**: `<Canvas>` persisten atau terbatas per tampilan yang dibungkus `<WebGLErrorBoundary>` dengan fallback SVG/data non-WebGL yang anggun (`AC-17`).
- **Paritas Kinematik**: Komponen `<group>` link robot membaca `snapshot.linkWorldPoses` dari ref yang dapat diubah, diperbarui lewat subscription transien Zustand di dalam `useFrame`, sehingga mencegah render ulang pohon komponen React pada setiap tick `20 ms` sambil tetap tersinkron ketat dengan transform FK Rust (`AC-05`).
- **Transform Exploded View**: Diterapkan murni di lapisan visual sebagai offset radial/aksial ke luar (`explodedFactor * componentExplosionVector`) pada tampilan inspeksi non-simulasi (`Digital Twin`), tanpa menyentuh koordinat tabrakan/kinematik Rust di bawahnya.

---

## 4. Arsitektur Rust/WASM (`crates/aokira-engine`)

### 4.1 Tanggung Jawab Modul
- **`kinematics`**: Memuat parameter DH `WorkcellConfig`; menghitung `forward_kinematics(q)` yang mengembalikan seluruh 7 frame `Pose3D` dan Jacobian geometris `6x6`; menjalankan `inverse_kinematics(target, seed)` dengan DLS + fallback multi-seed.
- **`trajectory`**: Merencanakan segmen `QuinticTrajectory` dalam batas kecepatan/akselerasi efektif; mengambil sampel `q(t), dq(t), ddq(t)` dan memvalidasi setiap sampel terhadap batas `JointConfig`.
- **`collision`**: Mengevaluasi clearance capsule-capsule dan capsule-box terhadap rintangan statis, konveyor, stasiun, dan workpiece yang dipegang; mengembalikan `CollisionReport`.
- **`robot`**: Menjaga `[JointState; 6]` yang aktif, menegakkan batas jog manual, memvalidasi massa payload (`<= 5.0 kg`).
- **`gripper`**: Memajukan pembukaan rahang (`OPEN <-> CLOSED` selama `300 ms`), memverifikasi kedekatan workpiece (`<= 0.015 m`) saat menggenggam.
- **`conveyor`**: Memunculkan workpiece secara deterministik di `input-conveyor`, memajukan posisi sepanjang `+X_w`, mendeteksi zona sensor, dan memensiunkan workpiece output yang keluar.
- **`production`**: Mengeksekusi state machine 8 stage (`IDLE` -> `CYCLE_COMPLETE` -> loop/idle atau `FAULT`), menangani `Pause`/`Resume`/`Stop`/`Reset`/`E-Stop`.
- **`scheduler`**: Memegang `sim_time_ms: u64`, `tick_index: u64`, `event_seq: u64` yang monoton, dan eksekusi `step_tick(20)` tetap.
- **`metrics`**: Mengagregasi `ProductionMetrics` secara inkremental dari catatan `SimulationEvent` yang dipancarkan dan kenaikan energi per tick.

---

## 5. Protokol Jembatan Web Worker

Worker khusus (`apps/web/src/workers/simulation.worker.ts`) menginstansiasi modul WASM sekali saat startup dan berkomunikasi hanya lewat pesan diskriminatif bertipe:

| Arah | Tipe Pesan | Payload | Fungsi |
|---|---|---|---|
| Main -> Worker | `INIT` | `{ workcellConfigJson?: string }` | Memuat engine WASM & memverifikasi konfigurasi default |
| Main -> Worker | `LOAD_SCENARIO` | `{ scenario: ScenarioConfig }` | Reset & menerapkan kecepatan, mode, kuantitas, dwell, seed |
| Main -> Worker | `COMMAND` | `{ action: 'START' \| 'PAUSE' \| 'RESUME' \| 'STOP' \| 'RESET' \| 'ESTOP' }` | Kontrol siklus hidup state machine |
| Main -> Worker | `STEP_TICKS` | `{ tickCount: number }` | Memajukan `N x 20 ms` tick simulasi deterministik |
| Main -> Worker | `SET_JOINTS` | `{ anglesRad: number[] }` | Jog inspeksi sendi manual (hanya diizinkan saat idle/berhenti) |
| Main -> Worker | `SOLVE_IK` | `{ requestId: string; targetPose: Pose3D }` | Memvalidasi keterjangkauan target Cartesian & menerapkan/pratinjau |
| Main -> Worker | `SET_GRIPPER` | `{ open: boolean }` | Toggle uji gripper manual di `Simulation Lab` |
| Worker -> Main | `READY` | `{ engineVersion: string; initialSnapshot: SimulationSnapshot }` | Mengonfirmasi inisialisasi WASM |
| Worker -> Main | `TICK_RESULT` | `{ snapshot: SimulationSnapshot; newEvents: SimulationEvent[]; metrics: ProductionMetrics }` | State deterministik terbaru + event yang baru dipancarkan |
| Worker -> Main | `IK_RESULT` | `{ requestId: string; ok: boolean; anglesRad?: number[]; fault?: FaultCode; message?: string }` | Respons IK sinkron/terkorelasi |
| Worker -> Main | `WORKER_ERROR` | `{ code: string; message: string }` | Panic WASM / exception worker yang tidak dapat dipulihkan |

---

## 6. Arsitektur Backend Python (`apps/api`)

`apps/api` adalah layanan FastAPI stateless yang diorganisasi berdasarkan pemisahan tanggung jawab:
- **`routes/`**: Endpoint HTTP tipis (`/api/v1/health`, `/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`) yang mendelegasikan ke `services/`.
- **`schemas/`**: Model Pydantic v2 yang ketat yang menegakkan alias JSON `camelCase` sesuai `DATA_MODEL.md`.
- **`analytics/`**:
  - `analytics.py`: Penghitungan ulang KPI independen dari `SimulationEvent[]` mentah (memverifikasi silang throughput, pemisahan siklus, utilisasi, downtime).
  - `bottleneck.py`: Analisis pangsa durasi stage yang mengidentifikasi kendala pembatas (misalnya transit robot vs. dwell pemrosesan vs. starvation/kecepatan feed konveyor input).
  - `energy.py`: Rincian energi tingkat komponen (`robotMotionWh`, `processingWh`, `conveyorWh`, `idleStandbyWh`) dengan rumus sintetis yang identik dengan `SIMULATION_SPEC.md`.
  - `forecasting.py`: Proyeksi throughput shift/jam kondisi tunak yang deterministik (`1h`, shift `8h`) tanpa varians stokastik yang dikarang.
  - `optimization.py`: Pencarian grid berkendala + SciPy berbatas (`SLSQP` / `differential_evolution` atau penyempurnaan grid deterministik) atas `robotSpeedScale`, `robotAccelScale`, `inputConveyorSpeedMps`, `outputConveyorSpeedMps`, `processingDwellMs` yang meminimalkan waktu siklus / energi dengan syarat nol tabrakan dan throughput target.
  - `validation.py`: Memeriksa monotonisitas urutan event, durasi negatif, dan selisih KPI klien-vs-server (`|Δ| < 1e-4`).

---

## 7. Penanganan Error & Degradasi Offline

1. **Kegagalan WASM / Worker**: Jika instansiasi WebAssembly gagal atau melempar error, Worker memancarkan `WORKER_ERROR`; UI mengalihkan panel simulasi ke banner diagnostik yang jelas dengan aksi `Reload Engine` sambil tetap menjaga inspeksi statis `Digital Twin` dapat dioperasikan.
2. **Fault Simulasi (State Domain yang Diharapkan)**: Tabrakan, target IK tak terjangkau, dan pelanggaran sendi tidak pernah membuat worker crash; mereka memancarkan snapshot `FAULT` + event error dan tetap dapat diinspeksi hingga `Reset`.
3. **Ketidaktersediaan Backend Python (`AC-15`)**:
   - Aplikasi melakukan polling `/api/v1/health` saat mount dan secara lazy sebelum request optimasi/analytics (timeout `3000 ms`).
   - Ketika tidak dapat dijangkau (error jaringan, `5xx`, kegagalan CORS, atau demo GitHub Pages tanpa URL API ter-host yang dikonfigurasi lewat `VITE_API_BASE_URL`):
     - `Overview`, `Digital Twin`, `Simulation Lab`, dan `ProductionMetrics` sisi klien langsung di `Performance Analytics` tetap beroperasi normal lewat Rust/WASM.
     - Panel yang bergantung pada Python (Bottleneck Deep-Dive, Shift Forecast, Consistency Audit, Multi-Scenario Optimization) menampilkan banner status **`Backend Unavailable`** yang eksplisit dengan tombol retry dan penjelasan yang jelas — tidak pernah panel kosong yang diam atau crash Promise yang tidak tertangkap.

---

## 8. Arsitektur Deployment & Performa

### 8.1 Topologi Deployment
- **Frontend + Rust/WASM**: Dibangun lewat Vite + `wasm-pack` di GitHub Actions dan dipublikasikan ke **GitHub Pages** (`https://orls967.github.io/AoKiraDeck/` dengan `base: '/AoKiraDeck/'` pada Vite yang dikonfigurasi lewat variabel lingkungan).
- **Backend Python**: Dikemas lewat `apps/api/Dockerfile` (image Python slim multi-stage yang menjalankan `uvicorn app.main:app`) untuk hosting container (misalnya Cloud Run / Fly.io / Railway / Render / Docker Compose lokal). Origin CORS secara eksplisit mengizinkan dev lokal (`http://localhost:5173`) dan origin GitHub Pages (`https://orls967.github.io`).
- **Injeksi Konfigurasi**: Frontend membaca `VITE_API_BASE_URL` saat build; jika tidak diatur, status backend masuk ke `Unavailable` / `Not Configured` dengan anggun sementara simulasi WASM lokal tetap 100% berfungsi.

### 8.2 Strategi Performa Runtime
- Jaga alokasi `step_tick` seminimal mungkin di Rust dan kelompokkan beberapa tick `20 ms` ketika kecepatan playback `> 1x` menjadi **satu** `postMessage` `TICK_RESULT` per frame animasi (`<= 60` pesan/detik).
- Batasi kompleksitas geometri scene 3D yang dirender dengan mesh low-poly prosedural/kelas-CAD + material PBR bersama.
- Pertahankan jendela tampilan log UI yang terbatas (misalnya `500` event terbaru dirender dalam daftar tervirtualisasi/dapat di-scroll) sambil tetap menyimpan penghitung ringkasan siklus penuh untuk run kontinu yang panjang.

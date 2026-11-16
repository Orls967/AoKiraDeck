> 🌐 [English](../../flow.md) | **Bahasa Indonesia**

# AoKira — Alur Implementasi Bertahap

**Peran Dokumen:** Roadmap eksekusi kanonis yang mengatur seluruh siklus hidup proyek dari penguncian dokumentasi Phase 0 hingga deployment akhir Phase 8. Setiap phase menetapkan dependensi, deliverable, gerbang validasi, dan Definition of Done (DoD) yang ketat.
**Aturan Eksekusi:** Diatur oleh [constraints.md](constraints.md). Detail verifikasi ada di [TEST_PLAN.md](TEST_PLAN.md).

---

## 1. Gambaran Dependensi Phase

```
Phase 0 (Audit Repo & Penguncian Dokumen)
   │
   ▼
Phase 1 (Fondasi, Konfigurasi Workcell Kanonis, Shell & Design System)
   ├───────────────────────────┬───────────────────────────┐
   ▼                           ▼                           ▼
Phase 2 (Workcell 3D)     Phase 3 (Engine Rust/WASM)   Phase 5 (API Python)
   └───────────┬───────────────┘                           │
               ▼                                           │
         Phase 4 (Siklus Produksi, Worker & Sim Lab)       │
               └───────────────────────────┬───────────────┘
                                           ▼
                                  Phase 6 (UI Analytics & Optimization)
                                           │
                                           ▼
                                  Phase 7 (Pengujian, Baseline Performa & Poles)
                                           │
                                           ▼
                                  Phase 8 (Deployment & Pengiriman Akhir)
```

---

## 2. Spesifikasi Phase Terperinci

### Phase 0 — Audit Repositori & Penguncian Dokumentasi *(Phase Saat Ini)*
- **Kriteria Masuk:** Repositori GitHub yang valid (`Orls967/AoKiraDeck`) terverifikasi; nama proyek (`AoKira`) dikonfirmasi.
- **Deliverable:** Paket dokumentasi yang telah diaudit silang secara lengkap (`PRD.md`, `DATA_MODEL.md`, `SIMULATION_SPEC.md`, `ARCHITECTURE.md`, `API_CONTRACT.md`, `DESIGN.md`, `TEST_PLAN.md`, `flow.md`, `constraints.md`, `README.md`) yang di-commit secara bertahap.
- **Gerbang Validasi:** Audit konsistensi antar dokumen lulus tanpa parameter yang bertentangan, ketidakcocokan skema, atau klaim yang belum terverifikasi.
- **Definition of Done:** Ke-10 dokumen ter-commit dengan bersih di `main`; persetujuan eksplisit dari pengguna diterima sebelum menulis kode aplikasi.

---

### Phase 1 — Fondasi Proyek, Konfigurasi Kanonis & Design System
- **Bergantung Pada:** Phase 0.
- **Deliverable:**
  - `.gitignore` (mengecualikan `node_modules/`, `target/`, `pkg/`, `.venv/`, `dist/`, `.env*`, `.DS_Store`).
  - Konfigurasi workcell sumber-kebenaran-tunggal kanonis `data/workcell/aokira-workcell.v1.json` dan preset skenario baseline `data/scenarios/scenario-{a,b,c,d}.json`.
  - Workspace frontend (`apps/web`): Vite + TypeScript strict + React + token Tailwind CSS (`#0B0F14`..`#EF4444`), tipografi, navigasi atas yang persisten di 5 rute, `<WebGLErrorBoundary>`, kerangka `WebGLFallbackView`, dan hook `prefers-reduced-motion`.
  - Workspace Rust (`crates/aokira-engine/Cargo.toml`) dan workspace Python (`apps/api/pyproject.toml`).
- **Gerbang Validasi:**
  - `npm run typecheck && npm run build` berhasil di `apps/web`.
  - `cargo check` berhasil di `crates/aokira-engine`.
  - `pytest --collect-only` atau pemeriksaan impor minimal berhasil di `apps/api`.
  - Smoke check skema JSON memverifikasi `aokira-workcell.v1.json` ter-parse dengan bersih.
- **Definition of Done:** Shell aplikasi kosong merender kelima rute secara responsif dengan token desain terkunci dan nol error konsol/build.

---

### Phase 2 — Workcell Robotik 3D (Scene `Overview` + `Digital Twin`)
- **Bergantung Pada:** Phase 1.
- **Deliverable:**
  - Model Three.js / R3F prosedural/kelas-CAD yang dibangun langsung dari `aokira-workcell.v1.json`: pedestal, lengan articulated 6 sumbu (`link-0`..`link-6`), gripper paralel dua jari, konveyor input, konveyor output, stasiun pemrosesan (dengan scanner belakang + clamp samping), template workpiece, pagar pengaman, konsol E-stop, sensor & menara beacon status.
  - Seleksi raycast interaktif untuk seluruh 10 target `ComponentId` (`AC-02`).
  - Rig preset kamera (`Isometric`, `Front`, `Side`, `Top`) + `OrbitControls` yang dibatasi (`AC-03`).
  - Overlay inspeksi `Digital Twin`: tampilkan/sembunyikan, isolasi komponen, slider exploded view, toggle grid/sumbu, label/indikator sensor, toggle wireframe primitif tabrakan, dan panel inspektor 6 sendi (awalnya terikat ke FK/store lokal hingga tautan WASM Phase 3).
  - Viewport hero `Overview` dengan drift kamera sinematik yang menghormati `prefers-reduced-motion`.
- **Gerbang Validasi:**
  - Verifikasi visual & Vitest/DOM untuk pemilihan komponen, transisi preset kamera, slider exploded, dan layout responsif.
- **Definition of Done:** Ke-10 komponen dapat dipilih, diisolasi, dan diinspeksi; keenam sendi robot berartikulasi secara visual di sekitar sumbu DH yang tepat.

---

### Phase 3 — Engine Simulasi Rust/WASM (`crates/aokira-engine`)
- **Bergantung Pada:** Phase 1 (dapat dieksekusi paralel dengan Phase 2).
- **Deliverable:**
  - `kinematics`: FK Standard DH (`BaseFrame` -> `WorldFrame`) + IK DLS dengan strategi 3-seed dan error tak-terjangkau/batas yang terstruktur (`AC-05`, `AC-06`, `AC-07`).
  - `trajectory`: Perencana ruang sendi quintic yang menghormati skala kecepatan/akselerasi (`AC-08`).
  - `collision`: Pemeriksa clearance capsule + box (`NONE`, `NEAR_COLLISION <= 25 mm`, `COLLISION <= 0 mm`) dengan pengecualian grasp yang disengaja (`AC-09`).
  - `robot`, `gripper`, `conveyor`, `production`, `scheduler`, `metrics`: Loop tick tetap `20 ms`, state machine 8 stage, urutan event deterministik, integral energi sintetis.
  - Pipeline `wasm-pack build --target web` yang menghasilkan binding WASM bertipe untuk `apps/web`.
- **Gerbang Validasi:**
  - `cargo test` meloloskan `RUST-KIN-01..03`, `RUST-IK-01..04`, `RUST-TRAJ-01..03`, `RUST-COL-01..06`, `RUST-PROD-01..06` tanpa warning (`cargo clippy -- -D warnings`).
  - `wasm-pack build` berhasil tanpa jalur panic melintasi FFI.
- **Definition of Done:** Engine Rust murni membuktikan eksekusi multi-siklus yang deterministik, penghentian saat tabrakan, penanganan error IK, dan paritas FK terhadap golden fixture.

---

### Phase 4 — Siklus Produksi, Jembatan Web Worker & `Simulation Lab`
- **Bergantung Pada:** Phase 2 dan Phase 3.
- **Deliverable:**
  - `simulation.worker.ts` khusus yang menjadi host Rust/WASM (`INIT`, `LOAD_SCENARIO`, `COMMAND`, `STEP_TICKS`, `SET_JOINTS`, `SOLVE_IK`, `SET_GRIPPER`).
  - Sinkronisasi matriks/pose `useFrame` tanpa render ulang yang menghubungkan `SimulationSnapshot` ke scene 3D (`AC-05`).
  - UI `Simulation Lab` lengkap: kontrol transport (`Start`, `Pause`, `Resume`, `Stop`, `Reset`, `E-Stop`), kontrol mode & kecepatan, toggle gripper manual, stepper 8 stage, log event langsung, warna sorotan tabrakan (`#F59E0B` / `#EF4444`), dan banner fault (`AC-10`, `AC-11`, `AC-15`).
  - Jog manual 6 sendi `Digital Twin` & probe IK Cartesian yang tersambung ke Worker WASM (`AC-04`, `AC-06`, `AC-07`), ditambah showcase produksi beranimasi langsung di `Overview` (`AC-01`).
- **Gerbang Validasi:**
  - `FE-01`, `FE-02`, `E2E-01`, `E2E-02`, dan `E2E-03` (penyelesaian siklus tunggal/kontinu di browser) lulus.
- **Definition of Done:** Siklus pick-and-place 3D langsung berjalan secara deterministik di dalam Web Worker dengan visualisasi tabrakan real-time dan nol freeze frame pada thread utama.

---

### Phase 5 — Layanan Analytics & Optimasi Python (`apps/api`)
- **Bergantung Pada:** Phase 1 (selaras dengan `DATA_MODEL.md` & `API_CONTRACT.md`).
- **Deliverable:**
  - Aplikasi FastAPI (`routes/`, `schemas/`, `services/`, `analytics/`) yang mengimplementasikan `/api/v1/health`, `/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`.
  - Verifikasi KPI independen, deteksi bottleneck stage, rincian energi per komponen, prakiraan shift deterministik, dan optimizer skenario berkendala berbasis SciPy/NumPy.
  - `apps/api/Dockerfile` dan verifikasi menjalankan container lokal.
- **Gerbang Validasi:**
  - `pytest` meloloskan `API-01..07` memakai golden fixture dari `data/fixtures/`.
  - `docker build` berhasil dan container merespons `200 OK` pada `/api/v1/health`.
- **Definition of Done:** Semua endpoint `/api/v1` patuh ketat pada skema, batas validasi, dan envelope error di `API_CONTRACT.md`.

---

### Phase 6 — `Performance Analytics`, `Optimization Center` & Degradasi yang Anggun
- **Bergantung Pada:** Phase 4 dan Phase 5.
- **Deliverable:**
  - `apps/web/src/services/apiClient.ts` dengan timeout bertipe (`3s`/`10s`/`20s`), pemeriksaan `/health`, dan penanganan `BACKEND_UNAVAILABLE` yang eksplisit.
  - Halaman `Performance Analytics` yang menampilkan seluruh 10 KPI turunan event (`AC-12`), grafik siklus/throughput/energi Recharts, status kosong tanpa mock, dan pengayaan bottleneck/forecast/validasi dari backend (`AC-13`).
  - Halaman `Optimization Center` yang mendukung perbandingan Skenario `A`–`D`, eksekusi optimasi berkendala, tabel/grafik perbandingan berperingkat, dan `Load into Simulation Lab` satu klik (`AC-14`).
  - Verifikasi status `Backend Unavailable` lengkap (`AC-15`).
- **Gerbang Validasi:**
  - `FE-03`, `FE-04`, dan `E2E-04` lulus dengan backend online DAN dengan backend dihentikan (mode terdegradasi).
- **Definition of Done:** Setiap angka analytics dapat ditelusuri ke event simulasi yang aktif; hasil optimasi mengalir mulus kembali ke simulator 3D; mode offline tidak pernah crash.

---

### Phase 7 — Pengujian Komprehensif, Baseline Performa & Penyempurnaan
- **Bergantung Pada:** Phase 6.
- **Deliverable:**
  - Suite regresi E2E Playwright lengkap (`E2E-01`..`E2E-05`) di desktop (`1440x900`) dan mobile (`390x844`) (`AC-16`).
  - Verifikasi `FE-05` untuk `prefers-reduced-motion` dan `WebGLFallbackView` (`AC-17`).
  - Laporan baseline performa Phase 7 yang terukur, membandingkan FPS yang teramati, latensi tick WASM, durasi solusi IK, latensi respons API, dan ukuran bundle terhadap target di [TEST_PLAN.md](TEST_PLAN.md).
  - Penyelesaian defect dan poles UI/UX tanpa perluasan cakupan.
- **Gerbang Validasi:** Semua kasus uji `AC-01` hingga `AC-17` lulus dengan bersih pada commit kandidat final.
- **Definition of Done:** Nol tes gagal, nol asersi penerimaan yang di-skip, dan baseline performa yang teramati dicatat dengan jujur.

---

### Phase 8 — Pengiriman Akhir & Deployment (`AC-18`)
- **Bergantung Pada:** Phase 7.
- **Deliverable:**
  - Workflow GitHub Actions `.github/workflows/ci-deploy.yml` yang menjalankan Rust `cargo test`, Python `pytest`, Web `vitest` + `vite build`, dan deployment artefak GitHub Pages untuk `https://orls967.github.io/AoKiraDeck/`.
  - Konfigurasi deployment backend Python dalam container & petunjuk verifikasi kesehatan.
  - Verifikasi perintah & URL langsung pada `README.md` akhir serta Laporan Pengiriman Phase 8.
- **Gerbang Validasi:** Build/tes CI bersih lulus + perilaku frontend yang di-deploy dan backend container terverifikasi (`AC-18`).
- **Definition of Done:** Artefak produksi dibangun, diuji, di-deploy (atas otorisasi pengguna untuk push/deploy), dan disetujui terhadap `AC-01`–`AC-18`.
